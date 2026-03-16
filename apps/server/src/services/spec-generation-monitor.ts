/**
 * Spec Generation Monitor - Detects and cleans up stalled spec regeneration jobs
 *
 * Monitors spec/feature generation processes for inactivity and performs cleanup:
 * - Aborts stalled AbortControllers
 * - Clears running state
 * - Emits error events to notify the UI
 *
 * Uses a tick-based approach similar to WorldStateMonitor for consistency.
 */

import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import { getSpecRegenerationStatus, setRunningState } from '../routes/app-spec/common.js';
import type { SchedulerService } from './scheduler-service.js';

const logger = createLogger('SpecGenerationMonitor');

/** Default interval for checking stalled jobs (30 seconds) */
const DEFAULT_CHECK_INTERVAL_MS = 30 * 1000;

/** Threshold for considering a job stalled (5 minutes of inactivity) */
const STALL_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Configuration options for the spec generation monitor
 */
export interface SpecGenerationMonitorConfig {
  /** Interval between checks in milliseconds */
  checkIntervalMs?: number;
  /** Threshold for considering a job stalled in milliseconds */
  stallThresholdMs?: number;
  /** Whether monitoring is enabled */
  enabled?: boolean;
}

/**
 * Spec Generation Monitor Service
 *
 * Periodically checks for stalled spec/feature generation jobs and cleans them up.
 */
export class SpecGenerationMonitor {
  private events: EventEmitter;
  private intervalId: NodeJS.Timeout | null = null;
  private config: Required<SpecGenerationMonitorConfig>;
  private isRunning = false;
  private lastActivityTimestamps = new Map<string, number>();
  private schedulerService: SchedulerService | null = null;

  private static readonly INTERVAL_ID = 'spec-generation-monitor:check';

  constructor(events: EventEmitter, config?: SpecGenerationMonitorConfig) {
    this.events = events;
    this.config = {
      checkIntervalMs: config?.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS,
      stallThresholdMs: config?.stallThresholdMs ?? STALL_THRESHOLD_MS,
      enabled: config?.enabled ?? true,
    };

    // Subscribe to spec regeneration events to track activity
    this.events.subscribe((type, payload: unknown) => {
      if (type === 'spec-regeneration:event') {
        const eventPayload = payload as { projectPath?: string } | null;
        if (eventPayload?.projectPath) {
          // Update last activity timestamp for this project
          this.lastActivityTimestamps.set(eventPayload.projectPath, Date.now());
        }
      }
    });
  }

  /**
   * Set the scheduler service for managed interval tracking
   */
  setSchedulerService(schedulerService: SchedulerService): void {
    this.schedulerService = schedulerService;
  }

  /**
   * Start monitoring for stalled spec generation jobs
   */
  startMonitoring(): void {
    if (!this.config.enabled) {
      logger.info('SpecGenerationMonitor is disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('SpecGenerationMonitor is already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting SpecGenerationMonitor with interval of ${this.config.checkIntervalMs}ms`);

    // Set up periodic checks via schedulerService if available, else raw setInterval
    if (this.schedulerService) {
      this.schedulerService.registerInterval(
        SpecGenerationMonitor.INTERVAL_ID,
        'Spec Generation Monitor',
        this.config.checkIntervalMs,
        () => this.tick()
      );
    } else {
      this.intervalId = setInterval(() => {
        this.tick().catch((error) => {
          logger.error('Periodic check failed:', error);
        });
      }, this.config.checkIntervalMs);
    }

    // Run initial check
    this.tick().catch((error) => {
      logger.error('Initial check failed:', error);
    });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this.isRunning) {
      logger.warn('SpecGenerationMonitor is not running');
      return;
    }

    if (this.schedulerService) {
      this.schedulerService.unregisterInterval(SpecGenerationMonitor.INTERVAL_ID);
    } else if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('Stopped SpecGenerationMonitor');
  }

  /**
   * Check if monitoring is currently active
   */
  isMonitoring(): boolean {
    return this.isRunning;
  }

  /**
   * Main tick function - checks for stalled jobs and cleans them up
   */
  private async tick(): Promise<void> {
    const now = Date.now();

    // Check each project with activity
    for (const [projectPath, lastActivity] of this.lastActivityTimestamps.entries()) {
      const status = getSpecRegenerationStatus(projectPath);

      // If the job is running and hasn't had activity in the threshold time, it's stalled
      if (status.isRunning) {
        const inactivityDuration = now - lastActivity;

        if (inactivityDuration > this.config.stallThresholdMs) {
          logger.warn(
            `Detected stalled spec generation for ${projectPath} (${Math.round(inactivityDuration / 1000)}s of inactivity)`
          );

          // Clean up the stalled job
          try {
            await this.cleanupStalledJob(projectPath);
            logger.info(`Successfully cleaned up stalled job for ${projectPath}`);
          } catch (error) {
            logger.error(`Failed to cleanup stalled job for ${projectPath}:`, error);
            // Continue to check other projects even if one fails
          }
        }
      } else {
        // Job is no longer running, remove from tracking
        this.lastActivityTimestamps.delete(projectPath);
      }
    }
  }

  /**
   * Clean up a stalled spec generation job
   */
  private async cleanupStalledJob(projectPath: string): Promise<void> {
    logger.info(`Cleaning up stalled job for ${projectPath}`);

    // Get the AbortController and abort if it exists
    const status = getSpecRegenerationStatus(projectPath);
    if (status.currentAbortController) {
      logger.info('Aborting existing AbortController');
      status.currentAbortController.abort();
    }

    // Clear the running state
    setRunningState(projectPath, false, null);

    // Emit error event to notify the UI
    this.events.emit('spec-regeneration:event', {
      type: 'spec_regeneration_error',
      error: 'Generation timed out after 5 minutes of inactivity',
      projectPath,
    });

    // Remove from tracking
    this.lastActivityTimestamps.delete(projectPath);

    logger.info(`Stalled job cleanup completed for ${projectPath}`);
  }
}

// Singleton instance
let specGenerationMonitorInstance: SpecGenerationMonitor | null = null;

/**
 * Get the singleton spec generation monitor instance
 */
export function getSpecGenerationMonitor(
  events: EventEmitter,
  config?: SpecGenerationMonitorConfig
): SpecGenerationMonitor {
  if (!specGenerationMonitorInstance) {
    specGenerationMonitorInstance = new SpecGenerationMonitor(events, config);
  }
  return specGenerationMonitorInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetSpecGenerationMonitor(): void {
  if (specGenerationMonitorInstance) {
    specGenerationMonitorInstance.stopMonitoring();
    specGenerationMonitorInstance = null;
  }
}
