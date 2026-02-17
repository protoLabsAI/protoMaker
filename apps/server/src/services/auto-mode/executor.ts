/**
 * AutoModeExecutor - Agent execution wrapper
 *
 * Responsibilities:
 * - Manage running feature state
 * - Handle feature execution lifecycle (start, stop, cleanup)
 * - Track execution timing and retries
 * - Provide running feature info for capacity checks
 *
 * Note: The actual agent execution logic remains in AutoModeService for now
 * as it has deep integration with providers, context loading, and event emission.
 * This module provides the state management layer.
 */

import { createLogger } from '@automaker/utils';
import type { RunningFeature } from './types.js';

const logger = createLogger('AutoMode:Executor');

/**
 * Options for executing a feature
 */
export interface ExecuteOptions {
  continuationPrompt?: string;
  retryCount?: number;
  previousErrors?: string[];
  recoveryContext?: string;
}

/**
 * Result of feature execution
 */
export interface ExecutionResult {
  success: boolean;
  featureId: string;
  error?: string;
  duration?: number;
}

export class AutoModeExecutor {
  // Track running features by feature ID
  private runningFeatures = new Map<string, RunningFeature>();

  // Track retry timers
  private retryTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Check if a feature is currently running
   */
  isRunning(featureId: string): boolean {
    return this.runningFeatures.has(featureId);
  }

  /**
   * Get a running feature by ID
   */
  getRunningFeature(featureId: string): RunningFeature | undefined {
    return this.runningFeatures.get(featureId);
  }

  /**
   * Get all running features
   */
  getAllRunningFeatures(): Map<string, RunningFeature> {
    return this.runningFeatures;
  }

  /**
   * Register a feature as running
   */
  registerRunningFeature(featureId: string, feature: RunningFeature): void {
    if (this.runningFeatures.has(featureId)) {
      const existing = this.runningFeatures.get(featureId);
      const runtime = existing ? Math.floor((Date.now() - existing.startTime) / 1000) : 0;
      logger.warn(
        `Feature ${featureId} is already running (runtime: ${runtime}s). Skipping duplicate registration.`
      );
      return;
    }
    this.runningFeatures.set(featureId, feature);
    logger.debug(`Registered running feature ${featureId}`);
  }

  /**
   * Unregister a feature (no longer running)
   */
  unregisterRunningFeature(featureId: string): boolean {
    const existed = this.runningFeatures.has(featureId);
    this.runningFeatures.delete(featureId);
    if (existed) {
      logger.debug(`Unregistered running feature ${featureId}`);
    }
    return existed;
  }

  /**
   * Get count of running features for a specific project
   */
  getRunningCountForProject(projectPath: string): number {
    let count = 0;
    for (const [, feature] of this.runningFeatures) {
      if (feature.projectPath === projectPath) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get count of running features for a specific worktree
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree
   */
  async getRunningCountForWorktree(
    projectPath: string,
    branchName: string | null
  ): Promise<number> {
    let count = 0;
    for (const [, feature] of this.runningFeatures) {
      if (feature.projectPath !== projectPath) continue;

      if (branchName === null) {
        // Main worktree auto-loop: count ALL running features for this project.
        // Features start with branchName null but get assigned feature-specific branches
        // when their worktree is created.
        count++;
      } else {
        // Feature worktree: exact match
        const featureBranch = feature.branchName ?? null;
        if (featureBranch === branchName) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Get the most recent running feature for a project (by start time)
   */
  getMostRecentRunningFeature(projectPath: string): RunningFeature | null {
    let mostRecent: RunningFeature | null = null;
    let latestStartTime = 0;

    for (const [, feature] of this.runningFeatures) {
      if (feature.projectPath === projectPath && feature.startTime > latestStartTime) {
        mostRecent = feature;
        latestStartTime = feature.startTime;
      }
    }

    return mostRecent;
  }

  /**
   * Register a retry timer for a feature
   */
  registerRetryTimer(featureId: string, timer: NodeJS.Timeout): void {
    // Clear existing timer if any
    this.clearRetryTimer(featureId);
    this.retryTimers.set(featureId, timer);
  }

  /**
   * Clear a retry timer for a feature
   */
  clearRetryTimer(featureId: string): void {
    const timer = this.retryTimers.get(featureId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(featureId);
    }
  }

  /**
   * Clear all retry timers for a project
   */
  clearRetryTimersForProject(projectPath: string): void {
    for (const [featureId, timer] of this.retryTimers) {
      const running = this.runningFeatures.get(featureId);
      if (running && running.projectPath === projectPath) {
        clearTimeout(timer);
        this.retryTimers.delete(featureId);
        logger.info(`Cancelled retry timer for feature ${featureId}`);
      }
    }
  }

  /**
   * Clean up stale running features (for recovery after crashes)
   * @param maxAgeMs - Maximum age in milliseconds before considering stale
   */
  cleanupStaleRunningFeatures(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    const staleFeatures: string[] = [];

    for (const [featureId, feature] of this.runningFeatures) {
      const age = now - feature.startTime;
      if (age > maxAgeMs) {
        staleFeatures.push(featureId);
      }
    }

    for (const featureId of staleFeatures) {
      logger.warn(`Cleaning up stale running feature ${featureId}`);
      this.runningFeatures.delete(featureId);
      this.clearRetryTimer(featureId);
    }

    if (staleFeatures.length > 0) {
      logger.info(`Cleaned up ${staleFeatures.length} stale running features`);
    }
  }

  /**
   * Stop a specific running feature
   * @returns true if feature was stopped, false if not running
   */
  stopFeature(featureId: string): boolean {
    const running = this.runningFeatures.get(featureId);
    if (!running) {
      return false;
    }

    // Abort the feature's execution
    if (running.abortController) {
      running.abortController.abort();
    }

    // Clean up
    this.runningFeatures.delete(featureId);
    this.clearRetryTimer(featureId);

    logger.info(`Stopped feature ${featureId}`);
    return true;
  }

  /**
   * Stop all running features for a project
   * @returns Number of features stopped
   */
  stopAllForProject(projectPath: string): number {
    let count = 0;
    const toStop: string[] = [];

    for (const [featureId, feature] of this.runningFeatures) {
      if (feature.projectPath === projectPath) {
        toStop.push(featureId);
      }
    }

    for (const featureId of toStop) {
      if (this.stopFeature(featureId)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Get running features info for a project (for status reporting)
   */
  getRunningFeaturesInfo(projectPath?: string): Array<{
    featureId: string;
    projectPath: string;
    branchName: string | null;
    isAutoMode: boolean;
    runtimeSeconds: number;
    retryCount: number;
  }> {
    const result = [];
    const now = Date.now();

    for (const [featureId, feature] of this.runningFeatures) {
      if (projectPath && feature.projectPath !== projectPath) {
        continue;
      }

      result.push({
        featureId,
        projectPath: feature.projectPath,
        branchName: feature.branchName,
        isAutoMode: feature.isAutoMode,
        runtimeSeconds: Math.floor((now - feature.startTime) / 1000),
        retryCount: feature.retryCount,
      });
    }

    return result;
  }
}
