/**
 * Health Monitor Service - Periodic health checks and auto-remediation
 *
 * Monitors:
 * - Stuck features (in_progress for too long without activity)
 * - Retryable features (failed with retryable errors)
 * - Worktree health (orphaned worktrees, corrupted state)
 * - Resource usage (memory, disk space)
 *
 * Auto-remediates critical issues when possible:
 * - Resets stuck features to pending
 * - Retries features with retryable errors
 * - Cleans up orphaned worktrees
 */

import { createLogger } from '@automaker/utils';
import { isRetryableError, ErrorType, classifyError } from '../lib/error-handler.js';
import type { EventEmitter } from '../lib/events.js';
import type { Feature } from '@automaker/types';
import { FeatureLoader } from './feature-loader.js';
import * as secureFs from '../lib/secure-fs.js';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const logger = createLogger('HealthMonitor');

/** Default interval for health checks (30 seconds for faster memory monitoring) */
const DEFAULT_CHECK_INTERVAL_MS = 30 * 1000;

/** Threshold for considering a feature stuck (30 minutes) */
const STUCK_FEATURE_THRESHOLD_MS = 30 * 60 * 1000;

/** Maximum memory usage before warning (80% of heap) */
const MEMORY_WARNING_THRESHOLD = 0.8;

/** Maximum number of auto-retry attempts for retryable errors */
const MAX_AUTO_RETRY_ATTEMPTS = 3;

/**
 * Health check issue severity levels
 */
export type HealthIssueSeverity = 'info' | 'warning' | 'critical';

/**
 * Types of health issues that can be detected
 */
export type HealthIssueType =
  | 'stuck_feature'
  | 'retryable_feature'
  | 'orphaned_worktree'
  | 'high_memory_usage'
  | 'disk_space_low'
  | 'corrupted_feature';

/**
 * A detected health issue
 */
export interface HealthIssue {
  type: HealthIssueType;
  severity: HealthIssueSeverity;
  message: string;
  context: Record<string, unknown>;
  autoRemediable: boolean;
  remediated?: boolean;
  remediationAction?: string;
}

/**
 * Result of a health check run
 */
export interface HealthCheckResult {
  timestamp: string;
  status: 'healthy' | 'degraded' | 'critical';
  issues: HealthIssue[];
  metrics: {
    memoryUsagePercent: number;
    heapUsedMB: number;
    heapTotalMB: number;
    uptimeSeconds: number;
    activeFeatures: number;
    stuckFeatures: number;
    retryableFeatures: number;
  };
}

/**
 * Configuration options for the health monitor
 */
export interface HealthMonitorConfig {
  /** Interval between health checks in milliseconds */
  checkIntervalMs?: number;
  /** Threshold for considering a feature stuck in milliseconds */
  stuckThresholdMs?: number;
  /** Whether to auto-remediate issues */
  autoRemediate?: boolean;
  /** Projects to monitor (if empty, monitoring is disabled) */
  projectPaths?: string[];
}

/**
 * Health Monitor Service
 *
 * Runs periodic health checks and auto-remediates critical issues.
 * Uses event emitter to broadcast health status changes.
 */
export class HealthMonitorService {
  private events: EventEmitter | null = null;
  private featureLoader: FeatureLoader;
  private intervalId: NodeJS.Timeout | null = null;
  private config: Required<HealthMonitorConfig>;
  private lastCheckResult: HealthCheckResult | null = null;
  private isRunning = false;

  constructor(featureLoader?: FeatureLoader, config?: HealthMonitorConfig) {
    this.featureLoader = featureLoader ?? new FeatureLoader();
    this.config = {
      checkIntervalMs: config?.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS,
      stuckThresholdMs: config?.stuckThresholdMs ?? STUCK_FEATURE_THRESHOLD_MS,
      autoRemediate: config?.autoRemediate ?? true,
      projectPaths: config?.projectPaths ?? [],
    };
  }

  /**
   * Set the event emitter for broadcasting health events
   */
  setEventEmitter(events: EventEmitter): void {
    this.events = events;
  }

  /**
   * Add a project path to monitor
   */
  addProjectPath(projectPath: string): void {
    if (!this.config.projectPaths.includes(projectPath)) {
      this.config.projectPaths.push(projectPath);
      logger.info(`Added project to health monitoring: ${projectPath}`);
    }
  }

  /**
   * Remove a project path from monitoring
   */
  removeProjectPath(projectPath: string): void {
    const index = this.config.projectPaths.indexOf(projectPath);
    if (index !== -1) {
      this.config.projectPaths.splice(index, 1);
      logger.info(`Removed project from health monitoring: ${projectPath}`);
    }
  }

  /**
   * Start periodic health monitoring
   */
  startMonitoring(): void {
    if (this.isRunning) {
      logger.warn('Health monitoring is already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting health monitoring with interval of ${this.config.checkIntervalMs}ms`);

    // Run initial check
    this.runHealthCheck().catch((error) => {
      logger.error('Initial health check failed:', error);
    });

    // Set up periodic checks
    this.intervalId = setInterval(() => {
      this.runHealthCheck().catch((error) => {
        logger.error('Periodic health check failed:', error);
      });
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop periodic health monitoring
   */
  stopMonitoring(): void {
    if (!this.isRunning) {
      logger.warn('Health monitoring is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('Stopped health monitoring');
  }

  /**
   * Check if monitoring is currently active
   */
  isMonitoring(): boolean {
    return this.isRunning;
  }

  /**
   * Get the last health check result
   */
  getLastCheckResult(): HealthCheckResult | null {
    return this.lastCheckResult;
  }

  /**
   * Run a health check and optionally auto-remediate issues
   */
  async runHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    logger.info('Running health check...');

    const issues: HealthIssue[] = [];
    let activeFeatures = 0;
    let stuckFeatures = 0;
    let retryableFeatures = 0;

    // Check each monitored project
    for (const projectPath of this.config.projectPaths) {
      try {
        const projectIssues = await this.checkProjectHealth(projectPath);
        issues.push(...projectIssues.issues);
        activeFeatures += projectIssues.activeCount;
        stuckFeatures += projectIssues.stuckCount;
        retryableFeatures += projectIssues.retryableCount;
      } catch (error) {
        logger.error(`Failed to check health for project ${projectPath}:`, error);
        issues.push({
          type: 'corrupted_feature',
          severity: 'warning',
          message: `Failed to check health for project: ${(error as Error).message}`,
          context: { projectPath },
          autoRemediable: false,
        });
      }
    }

    // Check resource usage
    const resourceIssues = this.checkResourceUsage();
    issues.push(...resourceIssues);

    // Calculate overall status
    const criticalCount = issues.filter((i) => i.severity === 'critical').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (criticalCount > 0) {
      status = 'critical';
    } else if (warningCount > 0) {
      status = 'degraded';
    }

    // Get memory metrics
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / (1024 * 1024);
    const heapTotalMB = memoryUsage.heapTotal / (1024 * 1024);
    const memoryUsagePercent = memoryUsage.heapUsed / memoryUsage.heapTotal;

    const result: HealthCheckResult = {
      timestamp: new Date().toISOString(),
      status,
      issues,
      metrics: {
        memoryUsagePercent: Math.round(memoryUsagePercent * 100) / 100,
        heapUsedMB: Math.round(heapUsedMB * 100) / 100,
        heapTotalMB: Math.round(heapTotalMB * 100) / 100,
        uptimeSeconds: Math.round(process.uptime()),
        activeFeatures,
        stuckFeatures,
        retryableFeatures,
      },
    };

    this.lastCheckResult = result;

    // Auto-remediate if enabled
    if (this.config.autoRemediate) {
      await this.autoRemediate(issues);
    }

    const duration = Date.now() - startTime;
    logger.info(
      `Health check completed in ${duration}ms: status=${status}, issues=${issues.length}`
    );

    // Emit health check event
    if (this.events) {
      this.events.emit('health:check-completed', result);
    }

    return result;
  }

  /**
   * Check health of a specific project
   */
  private async checkProjectHealth(projectPath: string): Promise<{
    issues: HealthIssue[];
    activeCount: number;
    stuckCount: number;
    retryableCount: number;
  }> {
    const issues: HealthIssue[] = [];
    let activeCount = 0;
    let stuckCount = 0;
    let retryableCount = 0;

    // Load all features for the project
    const features = await this.featureLoader.getAll(projectPath);

    for (const feature of features) {
      // Check for stuck features
      if (this.isFeatureStuck(feature)) {
        stuckCount++;
        issues.push({
          type: 'stuck_feature',
          severity: 'warning',
          message: `Feature "${feature.title || feature.id}" appears to be stuck in ${feature.status} status`,
          context: {
            featureId: feature.id,
            featureTitle: feature.title,
            status: feature.status,
            startedAt: feature.startedAt,
            projectPath,
          },
          autoRemediable: true,
          remediationAction: 'reset_to_backlog',
        });
      }

      // Check for retryable errors
      if (this.isFeatureRetryable(feature)) {
        retryableCount++;
        issues.push({
          type: 'retryable_feature',
          severity: 'warning',
          message: `Feature "${feature.title || feature.id}" failed with retryable error`,
          context: {
            featureId: feature.id,
            featureTitle: feature.title,
            error: feature.error,
            projectPath,
          },
          autoRemediable: true,
          remediationAction: 'retry_feature',
        });
      }

      // Count active features
      if (feature.status === 'in_progress') {
        activeCount++;
      }
    }

    // Check for orphaned worktrees
    const worktreeIssues = await this.checkWorktreeHealth(projectPath, features);
    issues.push(...worktreeIssues);

    return { issues, activeCount, stuckCount, retryableCount };
  }

  /**
   * Check if a feature is stuck (running for too long without progress)
   */
  private isFeatureStuck(feature: Feature): boolean {
    // Only check features that are in in_progress state
    if (!feature.status || feature.status !== 'in_progress') {
      return false;
    }

    // Check if feature has been running longer than threshold
    if (feature.startedAt) {
      const startedTime = new Date(feature.startedAt).getTime();
      const elapsed = Date.now() - startedTime;
      return elapsed > this.config.stuckThresholdMs;
    }

    return false;
  }

  /**
   * Check if a feature has a retryable error
   */
  private isFeatureRetryable(feature: Feature): boolean {
    // Check both 'failed' and 'blocked' since FeatureLoader normalizes 'failed' to 'blocked'
    const isFailedStatus = feature.status === 'blocked';
    if (!isFailedStatus || !feature.error) {
      return false;
    }

    // Check if the error is retryable
    const classification = classifyError(feature.error);
    return classification.retryable;
  }

  /**
   * Check worktree health for a project
   */
  private async checkWorktreeHealth(
    projectPath: string,
    features: Feature[]
  ): Promise<HealthIssue[]> {
    const issues: HealthIssue[] = [];

    try {
      // Get list of worktrees
      const worktreesDir = path.join(projectPath, '.worktrees');
      let worktreeDirs: string[] = [];

      try {
        const entries = await secureFs.readdir(worktreesDir, { withFileTypes: true });
        worktreeDirs = (entries as any[])
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
      } catch {
        // No worktrees directory - that's fine
        return issues;
      }

      // Get branch names from features
      const featureBranches = new Set(
        features.filter((f) => f.branchName).map((f) => f.branchName!.replace(/^feature\//, ''))
      );

      // Check for orphaned worktrees (worktrees without corresponding features)
      for (const worktreeDir of worktreeDirs) {
        // Skip main/master branches
        if (worktreeDir === 'main' || worktreeDir === 'master') {
          continue;
        }

        // Check if there's a matching feature
        const hasFeature = Array.from(featureBranches).some(
          (branch) => worktreeDir.includes(branch) || branch.includes(worktreeDir)
        );

        if (!hasFeature) {
          // Verify the worktree is actually orphaned by checking git
          const worktreePath = path.join(worktreesDir, worktreeDir);
          const isOrphaned = await this.isWorktreeOrphaned(worktreePath);

          if (isOrphaned) {
            issues.push({
              type: 'orphaned_worktree',
              severity: 'info',
              message: `Worktree "${worktreeDir}" has no corresponding feature`,
              context: {
                worktreePath,
                projectPath,
              },
              autoRemediable: true,
              remediationAction: 'cleanup_worktree',
            });
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to check worktree health for ${projectPath}:`, error);
    }

    return issues;
  }

  /**
   * Check if a worktree is orphaned (no active work)
   */
  private async isWorktreeOrphaned(worktreePath: string): Promise<boolean> {
    try {
      // Check if the worktree has uncommitted changes
      const { stdout } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
      });

      // If there are uncommitted changes, don't consider it orphaned
      if (stdout.trim()) {
        return false;
      }

      // Check if the worktree's branch has been merged
      const { stdout: branchStdout } = await execAsync('git branch --show-current', {
        cwd: worktreePath,
      });
      const branch = branchStdout.trim();

      if (!branch) {
        return true; // Detached HEAD is likely orphaned
      }

      // Check if branch has been merged to main/master
      try {
        await execAsync(`git merge-base --is-ancestor ${branch} main`, {
          cwd: worktreePath,
        });
        return true; // Branch has been merged
      } catch {
        // Not merged to main, try master
        try {
          await execAsync(`git merge-base --is-ancestor ${branch} master`, {
            cwd: worktreePath,
          });
          return true; // Branch has been merged
        } catch {
          // Not merged - not orphaned
          return false;
        }
      }
    } catch {
      // If we can't check, assume not orphaned to be safe
      return false;
    }
  }

  /**
   * Check system resource usage
   */
  private checkResourceUsage(): HealthIssue[] {
    const issues: HealthIssue[] = [];

    const memoryUsage = process.memoryUsage();
    const heapUsagePercent = memoryUsage.heapUsed / memoryUsage.heapTotal;

    if (heapUsagePercent > MEMORY_WARNING_THRESHOLD) {
      issues.push({
        type: 'high_memory_usage',
        severity: heapUsagePercent > 0.95 ? 'critical' : 'warning',
        message: `High memory usage: ${Math.round(heapUsagePercent * 100)}% of heap used`,
        context: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          heapUsagePercent,
          external: memoryUsage.external,
          rss: memoryUsage.rss,
        },
        autoRemediable: false,
      });
    }

    return issues;
  }

  /**
   * Auto-remediate detected issues
   */
  private async autoRemediate(issues: HealthIssue[]): Promise<void> {
    const remediableIssues = issues.filter((i) => i.autoRemediable && !i.remediated);

    if (remediableIssues.length === 0) {
      return;
    }

    logger.info(`Auto-remediating ${remediableIssues.length} issues`);

    for (const issue of remediableIssues) {
      try {
        switch (issue.remediationAction) {
          case 'reset_to_backlog':
            await this.remediateStuckFeature(issue);
            break;
          case 'retry_feature':
            await this.remediateRetryableFeature(issue);
            break;
          case 'cleanup_worktree':
            await this.remediateOrphanedWorktree(issue);
            break;
          default:
            logger.warn(`Unknown remediation action: ${issue.remediationAction}`);
        }

        // Emit remediation event for each successful remediation
        if (issue.remediated && this.events) {
          this.events.emit('health:issue-remediated', {
            issue: {
              type: issue.type,
              severity: issue.severity,
              message: issue.message,
              remediationAction: issue.remediationAction,
            },
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        logger.error(`Failed to remediate issue: ${issue.message}`, error);
      }
    }

    // Emit summary event
    const remediatedCount = remediableIssues.filter((i) => i.remediated).length;
    if (remediatedCount > 0 && this.events) {
      this.events.emit('health:issue-remediated', {
        total: remediableIssues.length,
        successful: remediatedCount,
        failed: remediableIssues.length - remediatedCount,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Remediate a stuck feature by resetting it to backlog
   */
  private async remediateStuckFeature(issue: HealthIssue): Promise<void> {
    const { featureId, projectPath } = issue.context as {
      featureId: string;
      projectPath: string;
    };

    logger.info(`Remediating stuck feature: ${featureId}`);

    await this.featureLoader.update(projectPath, featureId, {
      status: 'backlog',
      startedAt: undefined,
      error: 'Auto-reset: Feature was stuck in in_progress state',
    });

    issue.remediated = true;
    logger.info(`Reset stuck feature ${featureId} to backlog`);
  }

  /**
   * Remediate a feature with retryable error by marking it for retry
   */
  private async remediateRetryableFeature(issue: HealthIssue): Promise<void> {
    const { featureId, projectPath } = issue.context as {
      featureId: string;
      projectPath: string;
    };

    logger.info(`Marking feature for retry: ${featureId}`);

    // Get current feature to check retry count
    const feature = await this.featureLoader.get(projectPath, featureId);
    if (!feature) {
      logger.warn(`Feature ${featureId} not found for retry remediation`);
      return;
    }

    const currentRetries = (feature as any)._autoRetryCount || 0;

    if (currentRetries >= MAX_AUTO_RETRY_ATTEMPTS) {
      logger.warn(
        `Feature ${featureId} has exceeded max auto-retry attempts (${MAX_AUTO_RETRY_ATTEMPTS})`
      );
      return;
    }

    // Reset to backlog and increment retry count
    await this.featureLoader.update(projectPath, featureId, {
      status: 'backlog',
      error: undefined,
      _autoRetryCount: currentRetries + 1,
    } as Partial<Feature>);

    issue.remediated = true;
    logger.info(
      `Marked feature ${featureId} for retry (attempt ${currentRetries + 1}/${MAX_AUTO_RETRY_ATTEMPTS})`
    );
  }

  /**
   * Remediate an orphaned worktree by cleaning it up
   */
  private async remediateOrphanedWorktree(issue: HealthIssue): Promise<void> {
    const { worktreePath, projectPath } = issue.context as {
      worktreePath: string;
      projectPath: string;
    };

    logger.info(`Cleaning up orphaned worktree: ${worktreePath}`);

    try {
      // Use git worktree remove to properly clean up
      await execAsync(`git worktree remove "${worktreePath}" --force`, {
        cwd: projectPath,
      });

      issue.remediated = true;
      logger.info(`Removed orphaned worktree: ${worktreePath}`);
    } catch (error) {
      // If git worktree remove fails, try manual cleanup
      logger.warn(`git worktree remove failed, trying manual cleanup: ${error}`);

      try {
        await secureFs.rm(worktreePath, { recursive: true, force: true });

        // Also clean up the git worktree reference
        await execAsync('git worktree prune', { cwd: projectPath });

        issue.remediated = true;
        logger.info(`Manually cleaned up orphaned worktree: ${worktreePath}`);
      } catch (cleanupError) {
        logger.error(`Failed to clean up orphaned worktree: ${cleanupError}`);
      }
    }
  }
}

// Singleton instance
let healthMonitorServiceInstance: HealthMonitorService | null = null;

/**
 * Get the singleton health monitor service instance
 */
export function getHealthMonitorService(
  featureLoader?: FeatureLoader,
  config?: HealthMonitorConfig
): HealthMonitorService {
  if (!healthMonitorServiceInstance) {
    healthMonitorServiceInstance = new HealthMonitorService(featureLoader, config);
  }
  return healthMonitorServiceInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetHealthMonitorService(): void {
  if (healthMonitorServiceInstance) {
    healthMonitorServiceInstance.stopMonitoring();
    healthMonitorServiceInstance = null;
  }
}
