/**
 * AutoModeLifecycle - Start/stop, configuration, and state persistence
 *
 * Responsibilities:
 * - Manage auto-loop lifecycle (start, stop, pause, resume)
 * - Persist and restore execution state across restarts
 * - Track per-project/worktree auto-loop states
 * - Handle graceful shutdown
 */

import { createLogger } from '@automaker/utils';
import { ensureAutomakerDir, getExecutionStatePath, secureFs } from '@automaker/platform';
import type { ProjectAutoLoopState, AutoModeConfig, ExecutionState } from './types.js';
import { getWorktreeAutoLoopKey } from './types.js';

const logger = createLogger('AutoMode:Lifecycle');

// Default concurrency if not specified
export const DEFAULT_MAX_CONCURRENCY = 4;

/**
 * Callback for emitting events
 */
export type EventEmitter = (event: string, data: Record<string, unknown>) => void;

/**
 * Configuration for starting an auto-loop
 */
export interface StartConfig {
  projectPath: string;
  branchName?: string | null;
  maxConcurrency?: number;
  useWorktrees?: boolean;
}

export class AutoModeLifecycle {
  // Track per-project/worktree auto-loop states
  private autoLoopsByProject = new Map<string, ProjectAutoLoopState>();

  // Legacy compatibility flag
  private autoLoopRunning = false;

  constructor(private readonly eventEmitter: EventEmitter) {}

  /**
   * Get or create project auto-loop state
   */
  getOrCreateProjectState(
    projectPath: string,
    branchName: string | null,
    config: AutoModeConfig
  ): ProjectAutoLoopState {
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    let state = this.autoLoopsByProject.get(worktreeKey);

    if (!state) {
      state = {
        config,
        isRunning: false,
        abortController: new AbortController(),
        startingFeatures: new Set(),
        consecutiveFailures: [],
        pausedDueToFailures: false,
        cooldownTimer: null,
        branchName,
        hasEmittedIdleEvent: false,
      };
      this.autoLoopsByProject.set(worktreeKey, state);
    }

    return state;
  }

  /**
   * Get project state (without creating)
   */
  getProjectState(projectPath: string, branchName: string | null): ProjectAutoLoopState | undefined {
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    return this.autoLoopsByProject.get(worktreeKey);
  }

  /**
   * Check if auto-loop is running for a project/worktree
   */
  isRunning(projectPath: string, branchName: string | null = null): boolean {
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const state = this.autoLoopsByProject.get(worktreeKey);
    return state?.isRunning ?? false;
  }

  /**
   * Check if auto-loop is running globally (legacy compatibility)
   */
  isGloballyRunning(): boolean {
    return this.autoLoopRunning;
  }

  /**
   * Mark auto-loop as started
   */
  markStarted(projectPath: string, branchName: string | null): void {
    const state = this.getProjectState(projectPath, branchName);
    if (state) {
      state.isRunning = true;
      state.hasEmittedIdleEvent = false;
      // Reset abort controller if previously aborted
      if (state.abortController.signal.aborted) {
        state.abortController = new AbortController();
      }
    }
    this.autoLoopRunning = true;
  }

  /**
   * Mark auto-loop as stopped
   */
  markStopped(projectPath: string, branchName: string | null): void {
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const state = this.autoLoopsByProject.get(worktreeKey);

    if (state) {
      state.isRunning = false;
      state.abortController.abort();

      // Clear cooldown timer if active
      if (state.cooldownTimer) {
        clearTimeout(state.cooldownTimer);
        state.cooldownTimer = null;
      }
    }

    // Remove from map
    this.autoLoopsByProject.delete(worktreeKey);

    // Update global flag if no more auto-loops running
    if (this.autoLoopsByProject.size === 0) {
      this.autoLoopRunning = false;
    }
  }

  /**
   * Get all running auto-loops info
   */
  getAllRunningLoops(): Array<{
    projectPath: string;
    branchName: string | null;
    maxConcurrency: number;
    startingCount: number;
    isPaused: boolean;
  }> {
    const result = [];
    for (const [, state] of this.autoLoopsByProject) {
      if (state.isRunning) {
        result.push({
          projectPath: state.config.projectPath,
          branchName: state.branchName ?? null,
          maxConcurrency: state.config.maxConcurrency,
          startingCount: state.startingFeatures.size,
          isPaused: state.pausedDueToFailures,
        });
      }
    }
    return result;
  }

  /**
   * Get config for a running auto-loop
   */
  getConfig(projectPath: string, branchName: string | null = null): AutoModeConfig | null {
    const state = this.getProjectState(projectPath, branchName);
    return state?.config ?? null;
  }

  /**
   * Save execution state for crash recovery
   */
  async saveExecutionState(
    projectPath: string,
    branchName: string | null,
    runningFeatureIds: string[]
  ): Promise<void> {
    const state = this.getProjectState(projectPath, branchName);
    if (!state) {
      return;
    }

    try {
      await ensureAutomakerDir(projectPath);
      const statePath = getExecutionStatePath(projectPath);

      const executionState: ExecutionState = {
        version: 1,
        autoLoopWasRunning: true,
        maxConcurrency: state.config.maxConcurrency,
        projectPath,
        branchName,
        runningFeatureIds,
        savedAt: new Date().toISOString(),
      };

      await secureFs.writeFile(statePath, JSON.stringify(executionState, null, 2), 'utf-8');
      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.info(
        `Saved execution state for ${worktreeDesc} in ${projectPath}: ${runningFeatureIds.length} running features`
      );
    } catch (error) {
      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.error(`Failed to save execution state for ${worktreeDesc} in ${projectPath}:`, error);
    }
  }

  /**
   * Load execution state for crash recovery
   */
  async loadExecutionState(projectPath: string): Promise<ExecutionState | null> {
    try {
      const statePath = getExecutionStatePath(projectPath);
      const content = await secureFs.readFile(statePath, 'utf-8');
      return JSON.parse(content.toString()) as ExecutionState;
    } catch {
      // No saved state or failed to read
      return null;
    }
  }

  /**
   * Clear execution state (called when auto-loop stops normally)
   */
  async clearExecutionState(projectPath: string, branchName: string | null): Promise<void> {
    try {
      const statePath = getExecutionStatePath(projectPath);
      await secureFs.unlink(statePath);
      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.info(`Cleared execution state for ${worktreeDesc} in ${projectPath}`);
    } catch {
      // File might not exist, that's OK
    }
  }

  /**
   * Stop all auto-loops (for graceful shutdown)
   */
  async stopAll(): Promise<number> {
    let count = 0;
    const loops = Array.from(this.autoLoopsByProject.entries());

    for (const [worktreeKey, state] of loops) {
      if (state.isRunning) {
        state.isRunning = false;
        state.abortController.abort();

        if (state.cooldownTimer) {
          clearTimeout(state.cooldownTimer);
          state.cooldownTimer = null;
        }

        this.eventEmitter('auto_mode_stopped', {
          message: 'Auto mode stopped (shutdown)',
          projectPath: state.config.projectPath,
          branchName: state.branchName,
        });

        count++;
      }
      this.autoLoopsByProject.delete(worktreeKey);
    }

    this.autoLoopRunning = false;
    logger.info(`Stopped ${count} auto-loops during shutdown`);
    return count;
  }

  /**
   * Get the auto-loops map (for advanced operations)
   */
  getAutoLoopsMap(): Map<string, ProjectAutoLoopState> {
    return this.autoLoopsByProject;
  }
}
