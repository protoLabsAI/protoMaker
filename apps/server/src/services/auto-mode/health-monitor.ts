/**
 * AutoModeHealthMonitor - Health checks, capacity tracking, and circuit breaker logic
 *
 * Responsibilities:
 * - Monitor heap usage and system resources
 * - Track consecutive failures for circuit breaker
 * - Manage cooldown periods and auto-resume
 * - Provide health status for auto-loop decisions
 */

import * as v8 from 'node:v8';
import { createLogger } from '@automaker/utils';
import type { ProjectAutoLoopState, ErrorInfo } from './types.js';
import { getWorktreeAutoLoopKey } from './types.js';

const logger = createLogger('AutoMode:HealthMonitor');

// Circuit breaker thresholds
const CONSECUTIVE_FAILURE_THRESHOLD = 2; // Pause after 2 consecutive failures (circuit breaker)
const FAILURE_WINDOW_MS = 60000; // Failures within 1 minute count as consecutive
const COOLDOWN_PERIOD_MS = 300000; // 5 minutes cooldown before auto-resume

/**
 * Callback for emitting events from the health monitor
 */
export type EventEmitter = (event: string, data: Record<string, unknown>) => void;

/**
 * Callback for restarting an auto-loop after cooldown
 */
export type AutoLoopRestarter = (
  projectPath: string,
  branchName: string | null,
  maxConcurrency: number
) => Promise<void>;

/**
 * Callback for stopping an auto-loop
 */
export type AutoLoopStopper = (projectPath: string, branchName: string | null) => void;

export class AutoModeHealthMonitor {
  // Legacy global failure tracking (for backward compatibility)
  private consecutiveFailures: { timestamp: number; error: string }[] = [];
  private pausedDueToFailures = false;

  constructor(
    private readonly eventEmitter: EventEmitter,
    private readonly stopAutoLoop: AutoLoopStopper,
    private readonly startAutoLoop: AutoLoopRestarter
  ) {}

  /**
   * Get the current heap usage as a percentage of the heap size limit.
   * Uses V8's heap_size_limit (configured max) rather than heapTotal (current allocation).
   */
  getHeapUsagePercent(): number {
    const memoryUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    // Use heap_size_limit (actual max from --max-old-space-size) instead of heapTotal
    // (current allocation). V8 grows heapTotal conservatively, so heapUsed/heapTotal
    // is naturally 70-90% even for idle processes — causing false positives that
    // silently block all agent starts.
    return memoryUsage.heapUsed / heapStats.heap_size_limit;
  }

  /**
   * Track a failure and check if we should pause due to consecutive failures.
   * This handles cases where the SDK doesn't return useful error messages.
   * @param projectPath - The project to track failure for
   * @param errorInfo - Error information
   * @returns true if the auto-loop should pause
   */
  trackFailureAndCheckPauseForProject(
    projectPath: string,
    branchName: string | null,
    errorInfo: ErrorInfo,
    projectState: ProjectAutoLoopState | undefined
  ): boolean {
    if (!projectState) {
      // Fall back to legacy global tracking
      return this.trackFailureAndCheckPause(errorInfo);
    }

    const now = Date.now();

    // Add this failure
    projectState.consecutiveFailures.push({ timestamp: now, error: errorInfo.message });

    // Remove old failures outside the window
    projectState.consecutiveFailures = projectState.consecutiveFailures.filter(
      (f) => now - f.timestamp < FAILURE_WINDOW_MS
    );

    // Check if we've hit the threshold
    if (projectState.consecutiveFailures.length >= CONSECUTIVE_FAILURE_THRESHOLD) {
      return true; // Should pause
    }

    // Immediately pause for critical errors that should trigger circuit breaker
    if (
      errorInfo.type === 'quota_exhausted' ||
      errorInfo.type === 'rate_limit' ||
      errorInfo.type === 'network'
    ) {
      return true;
    }

    return false;
  }

  /**
   * Track a failure and check if we should pause due to consecutive failures (legacy global).
   * @returns true if the auto-loop should pause
   */
  private trackFailureAndCheckPause(errorInfo: ErrorInfo): boolean {
    const now = Date.now();

    // Add this failure
    this.consecutiveFailures.push({ timestamp: now, error: errorInfo.message });

    // Remove old failures outside the window
    this.consecutiveFailures = this.consecutiveFailures.filter(
      (f) => now - f.timestamp < FAILURE_WINDOW_MS
    );

    // Check if we've hit the threshold
    if (this.consecutiveFailures.length >= CONSECUTIVE_FAILURE_THRESHOLD) {
      return true; // Should pause
    }

    // Immediately pause for critical errors that should trigger circuit breaker
    if (
      errorInfo.type === 'quota_exhausted' ||
      errorInfo.type === 'rate_limit' ||
      errorInfo.type === 'network'
    ) {
      return true;
    }

    return false;
  }

  /**
   * Signal that we should pause due to repeated failures or quota exhaustion.
   * This will pause the auto loop for a specific project and schedule auto-resume.
   * @param projectPath - The project to pause
   * @param branchName - The branch name, or null for main worktree
   * @param errorInfo - Error information
   * @param projectState - The project auto-loop state
   */
  signalShouldPauseForProject(
    projectPath: string,
    branchName: string | null,
    errorInfo: ErrorInfo,
    projectState: ProjectAutoLoopState | undefined
  ): void {
    if (!projectState) {
      // Fall back to legacy global pause
      this.signalShouldPause(errorInfo, projectPath);
      return;
    }

    if (projectState.pausedDueToFailures) {
      return; // Already paused
    }

    projectState.pausedDueToFailures = true;
    const failureCount = projectState.consecutiveFailures.length;
    logger.info(
      `Circuit breaker triggered for ${projectPath} after ${failureCount} consecutive failures. Last error: ${errorInfo.type}`
    );

    // Emit event to notify UI
    const cooldownMinutes = Math.floor(COOLDOWN_PERIOD_MS / 60000);
    this.eventEmitter('auto_mode_paused_failures', {
      message:
        failureCount >= CONSECUTIVE_FAILURE_THRESHOLD
          ? `Auto Mode paused: ${failureCount} consecutive failures detected. Circuit breaker activated. Auto-resume in ${cooldownMinutes} minutes.`
          : `Auto Mode paused: Critical error detected (${errorInfo.type}). Circuit breaker activated. Auto-resume in ${cooldownMinutes} minutes.`,
      errorType: errorInfo.type,
      originalError: errorInfo.message,
      failureCount,
      projectPath,
      cooldownMs: COOLDOWN_PERIOD_MS,
    });

    // Stop the auto loop for this project
    this.stopAutoLoop(projectPath, branchName);

    // Schedule auto-resume after cooldown period
    projectState.cooldownTimer = setTimeout(() => {
      this.autoResumeAfterCooldown(projectPath, branchName, projectState);
    }, COOLDOWN_PERIOD_MS);
  }

  /**
   * Signal that we should pause due to repeated failures or quota exhaustion (legacy global).
   */
  private signalShouldPause(errorInfo: ErrorInfo, projectPath?: string): void {
    if (this.pausedDueToFailures) {
      return; // Already paused
    }

    this.pausedDueToFailures = true;
    const failureCount = this.consecutiveFailures.length;
    logger.info(
      `Pausing auto loop after ${failureCount} consecutive failures. Last error: ${errorInfo.type}`
    );

    // Emit event to notify UI
    this.eventEmitter('auto_mode_paused_failures', {
      message:
        failureCount >= CONSECUTIVE_FAILURE_THRESHOLD
          ? `Auto Mode paused: ${failureCount} consecutive failures detected. This may indicate a quota limit or API issue. Please check your usage and try again.`
          : 'Auto Mode paused: Usage limit or API error detected. Please wait for your quota to reset or check your API configuration.',
      errorType: errorInfo.type,
      originalError: errorInfo.message,
      failureCount,
      projectPath,
    });

    // Stop the auto loop using the legacy global method (pass null for branchName)
    this.stopAutoLoop(projectPath ?? '', null);
  }

  /**
   * Auto-resume auto-mode after cooldown period
   * @param projectPath - The project to resume
   * @param branchName - The branch name, or null for main worktree
   * @param projectState - The project auto-loop state
   */
  private async autoResumeAfterCooldown(
    projectPath: string,
    branchName: string | null,
    projectState: ProjectAutoLoopState
  ): Promise<void> {
    if (!projectState.pausedDueToFailures) {
      return; // No longer paused
    }

    logger.info(`Auto-resuming auto loop for ${projectPath} after cooldown period`);

    // Reset failure tracking
    projectState.pausedDueToFailures = false;
    projectState.consecutiveFailures = [];
    projectState.cooldownTimer = null;

    // Notify user about auto-resume
    this.eventEmitter('auto_mode_resumed', {
      message: 'Circuit breaker cooldown complete. Auto Mode resuming...',
      projectPath,
      reason: 'cooldown_complete',
    });

    // Restart auto-mode with the same configuration
    try {
      await this.startAutoLoop(
        projectPath,
        projectState.branchName ?? null,
        projectState.config.maxConcurrency
      );
    } catch (error) {
      logger.error('Failed to auto-resume after cooldown:', error);
      this.eventEmitter('auto_mode_error', {
        message: 'Failed to auto-resume after cooldown',
        error: error instanceof Error ? error.message : String(error),
        projectPath,
      });
    }
  }

  /**
   * Reset failure tracking for a specific project
   * @param projectPath - The project to reset failure tracking for
   * @param branchName - The branch name, or null for main worktree
   * @param projectState - The project auto-loop state
   */
  resetFailureTrackingForProject(
    projectPath: string,
    branchName: string | null,
    projectState: ProjectAutoLoopState | undefined
  ): void {
    if (projectState) {
      projectState.consecutiveFailures = [];
      projectState.pausedDueToFailures = false;
      if (projectState.cooldownTimer) {
        clearTimeout(projectState.cooldownTimer);
        projectState.cooldownTimer = null;
      }
    }
  }

  /**
   * Reset failure tracking (called when user manually restarts auto mode) - legacy global
   */
  resetFailureTracking(): void {
    this.consecutiveFailures = [];
    this.pausedDueToFailures = false;
  }

  /**
   * Record a successful feature completion to reset consecutive failure count for a project
   * @param projectPath - The project to record success for
   * @param branchName - The branch name, or null for main worktree
   * @param projectState - The project auto-loop state
   */
  recordSuccessForProject(
    projectPath: string,
    branchName: string | null,
    projectState: ProjectAutoLoopState | undefined
  ): void {
    if (projectState) {
      projectState.consecutiveFailures = [];
    } else {
      // Legacy global tracking
      this.consecutiveFailures = [];
    }
  }

  /**
   * Get the legacy global paused state (for backward compatibility)
   */
  isGloballyPaused(): boolean {
    return this.pausedDueToFailures;
  }
}
