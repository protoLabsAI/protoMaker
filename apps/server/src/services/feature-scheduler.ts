/**
 * FeatureScheduler — Decoupled scheduling layer for auto-mode.
 *
 * Owns the loop lifecycle, pending feature loading, concurrency management,
 * and feature selection logic. Delegates actual execution to a PipelineRunner.
 *
 * Design: FeatureScheduler depends on PipelineRunner (interface).
 * AutoModeService implements PipelineRunner by delegating to leadEngineerService.process().
 */

import * as v8 from 'node:v8';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { Feature, EventType } from '@protolabsai/types';
import {
  DEFAULT_MAX_CONCURRENCY,
  MAX_SYSTEM_CONCURRENCY,
  normalizeFeatureStatus,
  EscalationSource,
  EscalationSeverity,
} from '@protolabsai/types';
import {
  createLogger,
  readJsonWithRecovery,
  logRecoveryWarning,
  DEFAULT_BACKUP_COUNT,
  classifyError,
} from '@protolabsai/utils';
import {
  resolveDependencies,
  areDependenciesSatisfied,
  getBlockingInfo,
} from '@protolabsai/dependency-resolver';
import { getFeaturesDir } from '@protolabsai/platform';
import { isWorktreeLocked } from '../lib/worktree-lock.js';
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import type { EventEmitter } from '../lib/events.js';
import type { LoopState } from './auto-mode/auto-loop-coordinator.js';
import type { RunningFeature } from './auto-mode/execution-types.js';
import type { HealthReport } from './feature-health-service.js';

const execAsync = promisify(exec);
const logger = createLogger('FeatureScheduler');

// Auto-loop sleep interval constants
const SLEEP_INTERVAL_CAPACITY_MS = 5000;
const SLEEP_INTERVAL_IDLE_MS = 30000;
const SLEEP_INTERVAL_NORMAL_MS = 2000;
const SLEEP_INTERVAL_ERROR_MS = 5000;

// ── Public interfaces ──────────────────────────────────────────────────────

/** Structured outcome from an auto-loop feature dispatch attempt. */
export interface DispatchResult {
  outcome: 'completed' | 'escalated' | 'blocked' | 'needs_retry';
  retryAfterMs?: number;
  errorInfo?: ReturnType<typeof classifyError>;
}

/**
 * Interface implemented by the execution layer (AutoModeService).
 * FeatureScheduler calls run() when it decides a feature should be executed.
 */
export interface PipelineRunner {
  run(projectPath: string, featureId: string): Promise<DispatchResult>;
}

/**
 * Callbacks into AutoModeService for operations that remain there.
 */
export interface SchedulerCallbacks {
  getRunningCountForWorktree(projectPath: string, branchName: string | null): Promise<number>;
  hasInProgressFeatures(projectPath: string, branchName: string | null): Promise<boolean>;
  isFeatureRunning(featureId: string): boolean;
  isFeatureActiveInPipeline(featureId: string): boolean;
  isFeatureFinished(feature: Feature): boolean;
  emitAutoModeEvent(eventType: string, data: Record<string, unknown>): void;
  getHeapUsagePercent(): number;
  getMostRecentRunningFeature(
    projectPath: string
  ): { featureId: string; abortController?: AbortController } | null;
  recordSuccessForProject(projectPath: string, branchName: string | null): void;
  trackFailureAndCheckPauseForProject(
    projectPath: string,
    branchName: string | null,
    errorInfo: { type: string; message: string }
  ): boolean;
  signalShouldPauseForProject(
    projectPath: string,
    branchName: string | null,
    errorInfo: { type: string; message: string }
  ): void;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  /** Memory thresholds */
  HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD: number;
  HEAP_USAGE_ABORT_AGENTS_THRESHOLD: number;
  /**
   * Optional hook: returns true when new feature pickup should be paused
   * due to an error budget freeze. Running agents are NOT affected.
   */
  isPickupFrozen?(): boolean;
}

/** Interface for the feature health auditor (optional). */
export interface FeatureHealthAuditor {
  audit(projectPath: string, autoFix: boolean): Promise<HealthReport>;
}

// ── FeatureScheduler ───────────────────────────────────────────────────────

export class FeatureScheduler {
  private featureLoader: FeatureLoader;
  private settingsService: SettingsService | null;
  private events: EventEmitter;
  private runner: PipelineRunner;
  private callbacks: SchedulerCallbacks;
  private featureHealthAuditor: FeatureHealthAuditor | null = null;
  /**
   * Instance identity for project-affinity filtering.
   * When null, no affinity filtering is applied (single-instance backward compat).
   */
  private instanceId: string | null = null;
  /**
   * Async callback that returns the set of project slugs currently assigned to this instance.
   * Injected from AutoModeService to avoid a hard dependency on ProjectAssignmentService.
   * When null, affinity filtering is bypassed.
   */
  private getAssignedProjectSlugs: ((projectPath: string) => Promise<Set<string>>) | null = null;
  /**
   * Whether this instance accepts overflow work from projects not explicitly assigned to it.
   * Read from proto.config.yaml projectPreferences.overflowEnabled (default: true).
   */
  private overflowEnabled = true;

  constructor(deps: {
    featureLoader: FeatureLoader;
    settingsService: SettingsService | null;
    events: EventEmitter;
    runner: PipelineRunner;
    callbacks: SchedulerCallbacks;
  }) {
    this.featureLoader = deps.featureLoader;
    this.settingsService = deps.settingsService;
    this.events = deps.events;
    this.runner = deps.runner;
    this.callbacks = deps.callbacks;
  }

  setFeatureHealthAuditor(auditor: FeatureHealthAuditor): void {
    this.featureHealthAuditor = auditor;
  }

  /**
   * Configure project-affinity filtering for multi-instance deployments.
   * When set, loadPendingFeatures() will filter and sort features by project ownership.
   * Leave unset for single-instance deployments (backward compatible).
   *
   * @param instanceId - This instance's identity string
   * @param getAssignedProjectSlugs - Async fn returning slugs of projects assigned to this instance
   * @param overflowEnabled - Whether to accept features from non-assigned projects (default: true)
   */
  setProjectAffinity(
    instanceId: string,
    getAssignedProjectSlugs: (projectPath: string) => Promise<Set<string>>,
    overflowEnabled = true
  ): void {
    this.instanceId = instanceId;
    this.getAssignedProjectSlugs = getAssignedProjectSlugs;
    this.overflowEnabled = overflowEnabled;
  }

  // ── Loop ─────────────────────────────────────────────────────────────────

  async runLoop(worktreeKey: string, projectState: LoopState): Promise<void> {
    const { projectPath, branchName } = projectState.config;
    const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';

    logger.info(
      `[AutoLoop] Starting loop for ${worktreeDesc} in ${projectPath}, maxConcurrency: ${projectState.config.maxConcurrency}`
    );
    let iterationCount = 0;

    // Configurable startup delay before first agent launch (default 10s, 0 to disable)
    const startupDelayMs = parseInt(process.env.AUTO_MODE_STARTUP_DELAY_MS || '10000', 10);
    if (startupDelayMs > 0) {
      logger.info(
        `[AutoLoop] Startup cooldown: waiting ${startupDelayMs}ms before first agent launch`
      );
      await this.callbacks.sleep(startupDelayMs, projectState.abortController.signal);
      if (!projectState.isRunning || projectState.abortController.signal.aborted) {
        logger.info(`[AutoLoop] Auto-mode stopped during startup cooldown for ${worktreeDesc}`);
        return;
      }
      const heapUsage = this.callbacks.getHeapUsagePercent();
      if (heapUsage >= this.callbacks.HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD) {
        logger.warn(
          `[AutoLoop] Heap at ${Math.round(heapUsage * 100)}% after cooldown, stopping auto-mode for ${worktreeDesc}`
        );
        projectState.isRunning = false;
        return;
      }
    }

    while (projectState.isRunning && !projectState.abortController.signal.aborted) {
      iterationCount++;
      logger.debug(
        `[AutoLoop] Heartbeat - Iteration ${iterationCount} for ${worktreeDesc} in ${projectPath}`
      );

      // Periodic health sweep (every ~100 seconds at 2s interval)
      if (iterationCount % 50 === 0 && this.featureHealthAuditor) {
        try {
          const report = await this.featureHealthAuditor.audit(projectPath, true);
          if (report.issues.length > 0) {
            logger.warn(
              `[AutoLoop] Health sweep found ${report.issues.length} issues, fixed ${report.fixed.length}`
            );
            for (const issue of report.issues) {
              this.events.emit('escalation:signal-received' as EventType, {
                source: 'auto_mode_health_sweep',
                severity: issue.type === 'stale_gate' ? 'medium' : 'low',
                type: issue.type,
                context: {
                  featureId: issue.featureId,
                  featureTitle: issue.featureTitle,
                  message: issue.message,
                  fix: issue.fix,
                  projectPath,
                },
                deduplicationKey: `health_${issue.type}_${issue.featureId}_${projectPath}`,
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (err) {
          logger.warn('[AutoLoop] Health sweep failed:', err);
        }
      }

      // Early heap check — prevent any work when memory is critical
      const earlyHeapUsage = this.callbacks.getHeapUsagePercent();
      if (earlyHeapUsage >= this.callbacks.HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD) {
        logger.warn(
          `[AutoLoop] High heap (${Math.round(earlyHeapUsage * 100)}%), deferring iteration for ${worktreeDesc}`
        );
        await this.callbacks.sleep(10000, projectState.abortController.signal);
        continue;
      }

      try {
        // Count running features for THIS project/worktree only
        const projectRunningCount = await this.callbacks.getRunningCountForWorktree(
          projectPath,
          branchName
        );

        // Count features that are in the process of being started but not yet
        // tracked by the ConcurrencyManager. Exclude any feature that has already
        // acquired a running lease — it is already counted by getRunningCountForWorktree
        // and adding it again here causes double-counting that blocks the second
        // concurrent slot when maxConcurrency >= 2.
        const startingCount = [...projectState.startingFeatures].filter(
          (id) => !this.callbacks.isFeatureRunning(id)
        ).length;

        // Total occupied slots = running + starting
        const totalOccupied = projectRunningCount + startingCount;

        // Check if we have capacity for this project/worktree
        if (totalOccupied >= projectState.config.maxConcurrency) {
          logger.debug(
            `[AutoLoop] At capacity (${projectRunningCount} running + ${startingCount} starting = ${totalOccupied}/${projectState.config.maxConcurrency}), waiting...`
          );
          await this.callbacks.sleep(SLEEP_INTERVAL_CAPACITY_MS);
          continue;
        }

        // Load pending features for this project/worktree
        const pendingFeatures = await this.loadPendingFeatures(projectPath, branchName);

        logger.info(
          `[AutoLoop] Iteration ${iterationCount}: Found ${pendingFeatures.length} pending features, ${projectRunningCount}/${projectState.config.maxConcurrency} running for ${worktreeDesc}`
        );

        if (pendingFeatures.length === 0) {
          const inProgress = await this.callbacks.hasInProgressFeatures(projectPath, branchName);
          if (projectRunningCount === 0 && !inProgress && !projectState.hasEmittedIdleEvent) {
            this.callbacks.emitAutoModeEvent('auto_mode_idle', {
              message: 'No pending features - auto mode idle',
              projectPath,
              branchName,
            });
            projectState.hasEmittedIdleEvent = true;
            logger.info(`[AutoLoop] Backlog complete, auto mode now idle for ${worktreeDesc}`);
          } else if (projectRunningCount > 0) {
            logger.info(
              `[AutoLoop] No pending features available, ${projectRunningCount} still running, waiting...`
            );
          } else if (inProgress) {
            logger.info(
              `[AutoLoop] No pending features available but features still in_progress, waiting for status transition...`
            );
          } else if (projectState.hasEmittedIdleEvent) {
            logger.debug(
              `[AutoLoop] Still idle for ${worktreeDesc}, polling again in ${SLEEP_INTERVAL_IDLE_MS / 1000}s...`
            );
          }
          await this.callbacks.sleep(
            projectState.hasEmittedIdleEvent ? SLEEP_INTERVAL_IDLE_MS : 10000,
            projectState.abortController.signal
          );
          continue;
        }

        // Find a feature not currently running, not being started, and not yet finished
        const nextFeature = pendingFeatures.find(
          (f) =>
            !this.callbacks.isFeatureRunning(f.id) &&
            !projectState.startingFeatures.has(f.id) &&
            !this.callbacks.isFeatureFinished(f)
        );

        logger.info(
          `[AutoLoop] Feature selection from ${pendingFeatures.length} pending: ${pendingFeatures.map((f) => `${f.id}(running:${this.callbacks.isFeatureRunning(f.id)},finished:${this.callbacks.isFeatureFinished(f)})`).join(', ')}`
        );

        if (nextFeature) {
          // Check heap usage before starting new agents
          const heapUsage = this.callbacks.getHeapUsagePercent();

          // At 90% heap usage, abort most recent agent to free memory
          if (heapUsage >= this.callbacks.HEAP_USAGE_ABORT_AGENTS_THRESHOLD) {
            const mostRecent = this.callbacks.getMostRecentRunningFeature(projectPath);
            if (mostRecent && mostRecent.abortController) {
              logger.warn(
                `[AutoLoop] Critical heap usage (${Math.round(heapUsage * 100)}%), aborting most recent agent: ${mostRecent.featureId}`
              );
              mostRecent.abortController.abort();
              this.callbacks.emitAutoModeEvent('auto_mode_progress', {
                featureId: mostRecent.featureId,
                message: `Agent aborted due to critical memory usage (${Math.round(heapUsage * 100)}%)`,
                projectPath,
              });
            } else {
              logger.warn(
                `[AutoLoop] Critical heap usage (${Math.round(heapUsage * 100)}%), deferring agent start (no running agents to abort)`
              );
            }
            await this.callbacks.sleep(2000);
            continue;
          }

          // At 80% heap usage, stop accepting new agents
          if (heapUsage >= this.callbacks.HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD) {
            logger.warn(
              `[AutoLoop] High heap usage (${Math.round(heapUsage * 100)}%), deferring new agent start`
            );
            await this.callbacks.sleep(5000);
            continue;
          }

          // Error budget freeze: pause pickup when budget is exhausted
          if (this.callbacks.isPickupFrozen?.()) {
            logger.warn(
              `[AutoLoop] Error budget frozen — pausing new feature pickup for ${worktreeDesc}`
            );
            await this.callbacks.sleep(
              SLEEP_INTERVAL_CAPACITY_MS,
              projectState.abortController.signal
            );
            continue;
          }

          // Review queue WIP limit: pause pickup when too many PRs are in review
          const reviewDepth = await this.getReviewQueueDepth(projectPath);
          const maxPendingReviews = await this.getMaxPendingReviews(projectPath);
          if (reviewDepth >= maxPendingReviews) {
            logger.warn(
              `[AutoLoop] Review queue saturated (${reviewDepth}/${maxPendingReviews} PRs in review) — pausing feature pickup for ${worktreeDesc}`
            );
            await this.callbacks.sleep(
              SLEEP_INTERVAL_CAPACITY_MS,
              projectState.abortController.signal
            );
            continue;
          }

          // Double-check we're not at capacity (defensive check before starting)
          const currentRunningCount = await this.callbacks.getRunningCountForWorktree(
            projectPath,
            branchName
          );
          const currentStartingCount = [...projectState.startingFeatures].filter(
            (id) => !this.callbacks.isFeatureRunning(id)
          ).length;
          const currentTotalOccupied = currentRunningCount + currentStartingCount;

          if (currentTotalOccupied >= projectState.config.maxConcurrency) {
            logger.warn(
              `[AutoLoop] Race condition detected: at capacity ${currentRunningCount} running + ${currentStartingCount} starting = ${currentTotalOccupied}/${projectState.config.maxConcurrency} when trying to start feature ${nextFeature.id}, skipping`
            );
            await this.callbacks.sleep(1000);
            continue;
          }

          // Mark feature as starting BEFORE calling process() to prevent race conditions
          projectState.startingFeatures.add(nextFeature.id);

          logger.info(`[AutoLoop] Starting feature ${nextFeature.id}: ${nextFeature.title}`);
          // Reset idle event flag since we're doing work again
          projectState.hasEmittedIdleEvent = false;

          // Safety timeout: Remove from starting set if the feature is truly stuck.
          // Check pipeline activity and worktree locks before declaring stuck —
          // the Lead Engineer PLAN phase can take 30-120s for LLM calls.
          const STARTING_TIMEOUT_MS = 300_000; // 5 minutes — covers longest PLAN phase
          const featureForTimeout = nextFeature;
          const scheduleStartingTimeout = (delayMs: number): NodeJS.Timeout => {
            return setTimeout(() => {
              if (!projectState.startingFeatures.has(featureForTimeout.id)) return;

              // If the feature is already in runningFeatures, startup succeeded — clear silently
              if (this.callbacks.isFeatureRunning(featureForTimeout.id)) {
                projectState.startingFeatures.delete(featureForTimeout.id);
                return;
              }

              // If the feature is active in the Lead Engineer pipeline (INTAKE/PLAN/EXECUTE),
              // it's progressing — extend the timeout rather than creating a phantom slot
              if (this.callbacks.isFeatureActiveInPipeline(featureForTimeout.id)) {
                logger.info(
                  `[AutoLoop] Feature ${featureForTimeout.id} still starting after ${delayMs}ms but active in pipeline — extending timeout`
                );
                scheduleStartingTimeout(STARTING_TIMEOUT_MS);
                return;
              }

              // Check worktree lock file: if a live process holds the lock, extend the timeout
              const branchForLock = featureForTimeout.branchName;
              if (branchForLock) {
                const worktreePathForLock = path.join(
                  projectPath,
                  '.worktrees',
                  branchForLock.replace(/\//g, '-')
                );
                isWorktreeLocked(worktreePathForLock)
                  .then((locked) => {
                    if (locked) {
                      logger.info(
                        `[AutoLoop] Feature ${featureForTimeout.id} still starting after ${delayMs}ms but lock file shows live process — extending timeout`
                      );
                      scheduleStartingTimeout(STARTING_TIMEOUT_MS);
                    } else {
                      logger.warn(
                        `[AutoLoop] Feature ${featureForTimeout.id} stuck in starting state for ${delayMs}ms (no pipeline activity, no lock), cleaning up`
                      );
                      projectState.startingFeatures.delete(featureForTimeout.id);
                    }
                  })
                  .catch(() => {
                    logger.warn(
                      `[AutoLoop] Feature ${featureForTimeout.id} stuck in starting state for ${delayMs}ms, cleaning up`
                    );
                    projectState.startingFeatures.delete(featureForTimeout.id);
                  });
              } else {
                // No branch yet — feature is in INTAKE/PLAN. Only clean up if not active in pipeline
                logger.warn(
                  `[AutoLoop] Feature ${featureForTimeout.id} stuck in starting state for ${delayMs}ms (no branch, no pipeline activity), cleaning up`
                );
                projectState.startingFeatures.delete(featureForTimeout.id);
              }
            }, delayMs);
          };
          const startingTimeout = scheduleStartingTimeout(STARTING_TIMEOUT_MS);

          // Start feature execution in background.
          // All features route through the PipelineRunner.
          // Model selection is handled inside IntakeProcessor.
          // The runner returns a structured DispatchResult so all outcomes —
          // success, escalation, blocked, and retryable failures — are handled uniformly.
          const dispatchResultPromise: Promise<DispatchResult> = this.runner
            .run(projectPath, nextFeature.id)
            .catch((error: unknown): DispatchResult => {
              const errorInfo = classifyError(error);
              if (errorInfo.isRateLimit) {
                const retryAfterMs = errorInfo.retryAfter
                  ? errorInfo.retryAfter * 1000
                  : SLEEP_INTERVAL_ERROR_MS;
                return { outcome: 'needs_retry', retryAfterMs, errorInfo };
              }
              return { outcome: 'escalated', errorInfo };
            });

          dispatchResultPromise.then((result: DispatchResult) => {
            clearTimeout(startingTimeout);
            switch (result.outcome) {
              case 'completed':
                projectState.startingFeatures.delete(nextFeature.id);
                this.callbacks.recordSuccessForProject(projectPath, branchName);
                break;
              case 'escalated': {
                projectState.startingFeatures.delete(nextFeature.id);
                const errorInfo = result.errorInfo!;
                logger.error(`[AutoLoop] Feature ${nextFeature.id} escalated:`, errorInfo);
                if (!errorInfo.isCancellation) {
                  const shouldPause = this.callbacks.trackFailureAndCheckPauseForProject(
                    projectPath,
                    branchName,
                    errorInfo
                  );
                  if (shouldPause) {
                    this.callbacks.signalShouldPauseForProject(projectPath, branchName, errorInfo);
                  }
                }
                break;
              }
              case 'blocked':
                projectState.startingFeatures.delete(nextFeature.id);
                logger.warn(`[AutoLoop] Feature ${nextFeature.id} blocked by pipeline`);
                break;
              case 'needs_retry': {
                const delay = result.retryAfterMs ?? SLEEP_INTERVAL_ERROR_MS;
                logger.info(
                  `[AutoLoop] Feature ${nextFeature.id} scheduled for retry in ${delay}ms`
                );
                setTimeout(() => {
                  projectState.startingFeatures.delete(nextFeature.id);
                }, delay);
                break;
              }
            }
          });

          // Brief sleep to ensure proper sequencing
          await this.callbacks.sleep(100);
        } else {
          logger.debug(`[AutoLoop] All pending features are already running or being started`);
        }

        await this.callbacks.sleep(SLEEP_INTERVAL_NORMAL_MS);
      } catch (error) {
        logger.error(`[AutoLoop] Loop iteration error for ${projectPath}:`, error);
        await this.callbacks.sleep(SLEEP_INTERVAL_ERROR_MS);
      }
    }

    // Mark as not running when loop exits
    projectState.isRunning = false;
    logger.info(
      `[AutoLoop] Loop stopped for project: ${projectPath} after ${iterationCount} iterations`
    );
  }

  // ── Concurrency ──────────────────────────────────────────────────────────

  async resolveMaxConcurrency(
    projectPath: string,
    branchName: string | null,
    provided?: number
  ): Promise<number> {
    let resolvedValue: number;

    if (typeof provided === 'number' && Number.isFinite(provided)) {
      resolvedValue = provided;
    } else if (!this.settingsService) {
      resolvedValue = DEFAULT_MAX_CONCURRENCY;
    } else {
      try {
        const settings = await this.settingsService.getGlobalSettings();
        const globalMax =
          typeof settings.maxConcurrency === 'number'
            ? settings.maxConcurrency
            : DEFAULT_MAX_CONCURRENCY;
        const projectId = settings.projects?.find((project) => project.path === projectPath)?.id;
        const autoModeByWorktree = settings.autoModeByWorktree;

        if (projectId && autoModeByWorktree && typeof autoModeByWorktree === 'object') {
          const key = `${projectId}::${branchName ?? '__main__'}`;
          const entry = autoModeByWorktree[key];
          if (entry && typeof entry.maxConcurrency === 'number') {
            resolvedValue = entry.maxConcurrency;
          } else {
            resolvedValue = globalMax;
          }
        } else {
          resolvedValue = globalMax;
        }
      } catch {
        resolvedValue = DEFAULT_MAX_CONCURRENCY;
      }
    }

    // Enforce hard system limit to prevent resource exhaustion
    if (resolvedValue > MAX_SYSTEM_CONCURRENCY) {
      logger.warn(
        `maxConcurrency ${resolvedValue} exceeds system limit of ${MAX_SYSTEM_CONCURRENCY}, capping to ${MAX_SYSTEM_CONCURRENCY}`
      );
      return MAX_SYSTEM_CONCURRENCY;
    }

    return resolvedValue;
  }

  // ── Feature Loading ──────────────────────────────────────────────────────

  async loadPendingFeatures(
    projectPath: string,
    branchName: string | null = null
  ): Promise<Feature[]> {
    const featuresDir = getFeaturesDir(projectPath);

    const primaryBranch = await this.getCurrentBranch(projectPath);
    const worktreeBranches = await this.getAllWorktreeBranches(projectPath);

    // Fetch all open PRs once — guards against re-executing features that already have open PRs.
    const openPrBranches = new Map<string, number>();
    let openPrsFetchFailed = false;
    try {
      const { stdout: prJson } = await execAsync(
        'gh pr list --state open --json number,headRefName --limit 200',
        { cwd: projectPath, timeout: 15000 }
      );
      const prs: { number: number; headRefName: string }[] = JSON.parse(prJson || '[]');
      for (const pr of prs) openPrBranches.set(pr.headRefName, pr.number);
      logger.debug(
        `[loadPendingFeatures] Found ${openPrBranches.size} open PR(s) — these branches are excluded from re-execution`
      );
    } catch (err) {
      openPrsFetchFailed = true;
      logger.warn('[loadPendingFeatures] Could not fetch open PRs (non-fatal):', err);
    }

    const openPrNumbers = new Set<number>(openPrBranches.values());

    // Fetch recently merged PRs to reconcile blocked/review features whose PRs already landed.
    const mergedPrBranches = new Map<string, { number: number; mergedAt?: string }>();
    try {
      const { stdout: mergedPrJson } = await execAsync(
        'gh pr list --state merged --json number,headRefName,mergedAt --limit 100',
        { cwd: projectPath, timeout: 15000 }
      );
      const mergedPrs: { number: number; headRefName: string; mergedAt?: string }[] = JSON.parse(
        mergedPrJson || '[]'
      );
      for (const pr of mergedPrs)
        mergedPrBranches.set(pr.headRefName, { number: pr.number, mergedAt: pr.mergedAt });
      logger.debug(
        `[loadPendingFeatures] Found ${mergedPrBranches.size} recently merged PR(s) — used for stale blocked/review reconciliation`
      );
    } catch (err) {
      logger.warn('[loadPendingFeatures] Could not fetch merged PRs (non-fatal):', err);
    }

    try {
      const entries = await secureFs.readdir(featuresDir, {
        withFileTypes: true,
      });
      const allFeatures: Feature[] = [];
      const pendingFeatures: Feature[] = [];

      // Load all features (for dependency checking) with recovery support
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featurePath = path.join(featuresDir, entry.name, 'feature.json');

          const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
            maxBackups: DEFAULT_BACKUP_COUNT,
            autoRestore: true,
          });

          logRecoveryWarning(result, `Feature ${entry.name}`, logger);

          const feature = result.data;
          if (!feature) continue;

          const canonicalStatus = normalizeFeatureStatus(feature.status);

          const normalizedFeature = {
            ...feature,
            status: canonicalStatus,
          };
          allFeatures.push(normalizedFeature);
        }
      }

      // ── Merged PR reconciliation ──
      const staleViaLinkedPr = allFeatures.filter(
        (f) =>
          (f.status === 'blocked' || f.status === 'review') &&
          f.branchName &&
          mergedPrBranches.has(f.branchName)
      );
      for (const feature of staleViaLinkedPr) {
        const mergedPr = mergedPrBranches.get(feature.branchName!)!;
        logger.info(
          `[loadPendingFeatures] Feature ${feature.id} ("${feature.title}") has merged PR #${mergedPr.number} — reconciling to done`
        );
        const prevStatus = feature.status;
        try {
          await this.featureLoader.update(projectPath, feature.id, {
            status: 'done',
            prNumber: mergedPr.number,
            prMergedAt: mergedPr.mergedAt ?? new Date().toISOString(),
          });
          feature.status = 'done';
          // feature:status-changed is auto-emitted by featureLoader.update()
        } catch (error) {
          feature.status = prevStatus;
          logger.error(
            `[loadPendingFeatures] Failed to reconcile feature ${feature.id} to done:`,
            error
          );
        }
      }

      // ── Dependency re-evaluation: unblock features whose deps are now satisfied ──
      const blockedWithDeps = allFeatures.filter(
        (f) => f.status === 'blocked' && f.dependencies && f.dependencies.length > 0
      );

      for (const feature of blockedWithDeps) {
        const satisfied = areDependenciesSatisfied(feature, allFeatures);
        if (satisfied) {
          const existingPrByBranch = feature.branchName
            ? openPrBranches.get(feature.branchName)
            : undefined;
          const existingPrByNumber =
            !existingPrByBranch && feature.prNumber && openPrNumbers.has(feature.prNumber)
              ? feature.prNumber
              : undefined;
          let existingPrFallback: number | undefined;
          if (
            !existingPrByBranch &&
            !existingPrByNumber &&
            openPrsFetchFailed &&
            feature.prNumber
          ) {
            try {
              const prNum = String(feature.prNumber).replace(/[^0-9]/g, '');
              const { stdout: prStateRaw } = await execAsync(
                `gh pr view ${prNum} --json state --jq '.state'`,
                { cwd: projectPath, timeout: 10000 }
              );
              if (prStateRaw.trim() === 'OPEN') {
                existingPrFallback = feature.prNumber;
                logger.info(
                  `[loadPendingFeatures] Feature ${feature.id} PR #${feature.prNumber} confirmed open via direct check (bulk fetch had failed)`
                );
              }
            } catch (verifyErr) {
              existingPrFallback = feature.prNumber;
              logger.warn(
                `[loadPendingFeatures] Could not verify PR #${feature.prNumber} for feature ${feature.id} — ` +
                  `assuming open to prevent duplicate agent launch: ${verifyErr}`
              );
            }
          }
          const existingPr = existingPrByBranch ?? existingPrByNumber ?? existingPrFallback;
          if (existingPr) {
            logger.info(
              `[loadPendingFeatures] Feature ${feature.id} deps satisfied but has open PR #${existingPr} — syncing to review`
            );
            feature.status = 'review';
            try {
              await this.featureLoader.update(projectPath, feature.id, {
                status: 'review',
                prNumber: existingPr,
              });
              // feature:status-changed is auto-emitted by featureLoader.update()
            } catch (error) {
              logger.error(
                `[loadPendingFeatures] Failed to sync feature ${feature.id} to review:`,
                error
              );
            }
          } else {
            // Don't unblock features that were blocked by agent failure / escalation.
            // Only unblock features that were blocked because their dependencies weren't met.
            const failureCount = feature.failureCount ?? 0;
            const failureClassification = feature.failureClassification as
              | { retryable?: boolean }
              | undefined;
            const isAgentFailureBlock =
              failureCount >= 3 || failureClassification?.retryable === false;
            const changeReason = feature.statusChangeReason ?? '';
            const isGitWorkflowBlock =
              changeReason.includes('git commit') ||
              changeReason.includes('git workflow failed') ||
              changeReason.includes('plan validation failed') ||
              changeReason.includes('Max agent retries exceeded');
            if (isAgentFailureBlock || isGitWorkflowBlock) {
              logger.warn(
                `[loadPendingFeatures] Feature ${feature.id} skipping dep-unblock — ` +
                  `blocked after ${failureCount} failure(s) (retryable: ${failureClassification?.retryable ?? 'unknown'}). Requires human intervention.`
              );
              continue;
            }

            logger.info(
              `[loadPendingFeatures] Unblocking feature ${feature.id} — all dependencies now satisfied`
            );
            feature.status = 'backlog';
            try {
              await this.featureLoader.update(projectPath, feature.id, { status: 'backlog' });
              // feature:status-changed is auto-emitted by featureLoader.update()
            } catch (error) {
              logger.error(`[loadPendingFeatures] Failed to unblock feature ${feature.id}:`, error);
            }
          }
        }
      }

      // ── Filter eligible features for execution ──
      for (const feature of allFeatures) {
        const canonicalStatus = feature.status;

        const isEligibleStatus =
          canonicalStatus === 'backlog' ||
          (canonicalStatus !== 'done' &&
            canonicalStatus !== 'verified' &&
            canonicalStatus !== 'review' &&
            canonicalStatus !== 'in_progress' &&
            canonicalStatus !== 'blocked' &&
            feature.planSpec?.status === 'approved' &&
            (feature.planSpec.tasksCompleted ?? 0) < (feature.planSpec.tasksTotal ?? 0));

        logger.debug(
          `[loadPendingFeatures] Feature ${feature.id}: status="${feature.status}", assignee="${feature.assignee ?? 'null'}", isEpic=${feature.isEpic ?? false}, branchName="${feature.branchName ?? 'null'}", eligible=${isEligibleStatus}`
        );

        if (isEligibleStatus) {
          if (feature.isEpic) {
            logger.info(
              `[loadPendingFeatures] Skipping epic feature ${feature.id} - ${feature.title}`
            );
            continue;
          }

          if (feature.assignee && feature.assignee !== 'agent') {
            logger.info(
              `[loadPendingFeatures] Skipping feature ${feature.id} - assigned to "${feature.assignee}" (not agent)`
            );
            continue;
          }

          // Creation cooldown: skip features created too recently to allow the creator time
          // to set dependencies, adjust properties, or batch-create related features.
          if (feature.createdAt) {
            const cooldownMs = await this.getPickupCooldownMs();
            if (cooldownMs > 0) {
              const ageMs = Date.now() - new Date(feature.createdAt).getTime();
              if (ageMs < cooldownMs) {
                const remainingSec = Math.ceil((cooldownMs - ageMs) / 1000);
                logger.info(
                  `[loadPendingFeatures] Skipping feature ${feature.id} - within creation cooldown (${remainingSec}s remaining)`
                );
                continue;
              }
            }
          }

          // Guard: if feature already has an open PR, sync it to 'review' and skip execution.
          const existingPrByBranchFilter = feature.branchName
            ? openPrBranches.get(feature.branchName)
            : undefined;
          const existingPrByNumberFilter =
            !existingPrByBranchFilter && feature.prNumber && openPrNumbers.has(feature.prNumber)
              ? feature.prNumber
              : undefined;
          let existingPrFallbackFilter: number | undefined;
          if (
            !existingPrByBranchFilter &&
            !existingPrByNumberFilter &&
            openPrsFetchFailed &&
            feature.prNumber
          ) {
            try {
              const prNum = String(feature.prNumber).replace(/[^0-9]/g, '');
              const { stdout: prStateRaw } = await execAsync(
                `gh pr view ${prNum} --json state --jq '.state'`,
                { cwd: projectPath, timeout: 10000 }
              );
              if (prStateRaw.trim() === 'OPEN') {
                existingPrFallbackFilter = feature.prNumber;
                logger.info(
                  `[loadPendingFeatures] Feature ${feature.id} PR #${feature.prNumber} confirmed open via direct check — skipping agent launch`
                );
              }
            } catch (verifyErr) {
              existingPrFallbackFilter = feature.prNumber;
              logger.warn(
                `[loadPendingFeatures] Could not verify PR #${feature.prNumber} for feature ${feature.id} — ` +
                  `assuming open to prevent duplicate agent launch: ${verifyErr}`
              );
            }
          }
          const existingPrFilter =
            existingPrByBranchFilter ?? existingPrByNumberFilter ?? existingPrFallbackFilter;
          if (existingPrFilter) {
            logger.info(
              `[loadPendingFeatures] Feature ${feature.id} has open PR #${existingPrFilter} — syncing to review, skipping execution`
            );
            try {
              await this.featureLoader.update(projectPath, feature.id, {
                status: 'review',
                prNumber: existingPrFilter,
              });
              // feature:status-changed is auto-emitted by featureLoader.update()
            } catch (error) {
              logger.error(
                `[loadPendingFeatures] Failed to sync feature ${feature.id} to review:`,
                error
              );
            }
            continue;
          }

          // Filter by branchName
          const featureBranch = feature.branchName ?? null;
          if (branchName === null) {
            const isPrimaryOrUnassigned =
              featureBranch === null || (primaryBranch && featureBranch === primaryBranch);
            const isOrphaned = featureBranch !== null && !worktreeBranches.has(featureBranch);
            const hasStaleWorktree =
              featureBranch !== null &&
              worktreeBranches.has(featureBranch) &&
              (feature.status === 'backlog' ||
                feature.status === 'pending' ||
                feature.status === 'ready');

            logger.debug(
              `[loadPendingFeatures] Feature ${feature.id} branch filter - featureBranch: ${featureBranch}, primaryBranch: ${primaryBranch}, isPrimaryOrUnassigned: ${isPrimaryOrUnassigned}, isOrphaned: ${isOrphaned}, hasStaleWorktree: ${hasStaleWorktree}`
            );

            if (isPrimaryOrUnassigned || isOrphaned || hasStaleWorktree) {
              if (hasStaleWorktree) {
                logger.info(
                  `[loadPendingFeatures] Including feature ${feature.id} with stale worktree (branchName: ${featureBranch}, status: ${feature.status}) for main worktree`
                );
              } else if (isOrphaned) {
                logger.info(
                  `[loadPendingFeatures] Including orphaned feature ${feature.id} (branchName: ${featureBranch} has no worktree) for main worktree`
                );
              } else {
                logger.info(
                  `[loadPendingFeatures] Including feature ${feature.id} for main worktree (featureBranch: ${featureBranch})`
                );
              }
              pendingFeatures.push(feature);
            } else {
              logger.info(
                `[loadPendingFeatures] Filtering out feature ${feature.id} (branchName: ${featureBranch} has worktree, status: ${feature.status}) for main worktree`
              );
            }
          } else {
            if (featureBranch === branchName) {
              logger.info(
                `[loadPendingFeatures] Including feature ${feature.id} for worktree ${branchName}`
              );
              pendingFeatures.push(feature);
            } else {
              logger.info(
                `[loadPendingFeatures] Filtering out feature ${feature.id} (branchName: ${featureBranch}, expected: ${branchName}) for worktree ${branchName}`
              );
            }
          }
        }
      }

      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.info(
        `[loadPendingFeatures] Found ${allFeatures.length} total features, ${pendingFeatures.length} candidates (pending/ready/backlog/approved_with_pending_tasks) for ${worktreeDesc}`
      );

      if (pendingFeatures.length === 0) {
        logger.warn(
          `[loadPendingFeatures] No pending features found for ${worktreeDesc}. Check branchName matching - looking for branchName: ${branchName === null ? 'null (main)' : branchName}`
        );
        const allBacklogFeatures = allFeatures.filter(
          (f) =>
            f.status === 'backlog' ||
            f.status === 'pending' ||
            f.status === 'ready' ||
            (f.planSpec?.status === 'approved' &&
              (f.planSpec.tasksCompleted ?? 0) < (f.planSpec.tasksTotal ?? 0))
        );
        if (allBacklogFeatures.length > 0) {
          logger.info(
            `[loadPendingFeatures] Found ${allBacklogFeatures.length} backlog features with branchNames: ${allBacklogFeatures.map((f) => `${f.id}(${f.branchName ?? 'null'})`).join(', ')}`
          );
        }
      }

      // Apply dependency-aware ordering
      const { orderedFeatures, missingDependencies } = resolveDependencies(pendingFeatures);

      // Remove TRULY missing dependencies
      if (missingDependencies.size > 0) {
        const allFeatureIds = new Set(allFeatures.map((f) => f.id));

        for (const [featureId, missingDepIds] of missingDependencies) {
          const feature = pendingFeatures.find((f) => f.id === featureId);
          if (feature && feature.dependencies) {
            const trulyMissingDepIds = missingDepIds.filter((depId) => !allFeatureIds.has(depId));

            if (trulyMissingDepIds.length > 0) {
              const validDependencies = feature.dependencies.filter(
                (depId) => !trulyMissingDepIds.includes(depId)
              );

              logger.warn(
                `[loadPendingFeatures] Feature ${featureId} has truly missing dependencies (deleted from board): ${trulyMissingDepIds.join(', ')}. Removing them.`
              );

              feature.dependencies = validDependencies.length > 0 ? validDependencies : undefined;

              try {
                await this.featureLoader.update(projectPath, featureId, {
                  dependencies: feature.dependencies,
                });
                logger.info(
                  `[loadPendingFeatures] Updated feature ${featureId} - removed truly missing dependencies`
                );
              } catch (error) {
                logger.error(
                  `[loadPendingFeatures] Failed to save feature ${featureId} after removing missing dependencies:`,
                  error
                );
              }
            } else {
              const depStatuses = missingDepIds.map((depId) => {
                const dep = allFeatures.find((f) => f.id === depId);
                return `${depId.slice(-12)}(${dep?.status || 'unknown'})`;
              });
              logger.debug(
                `[loadPendingFeatures] Feature ${featureId} has deps in non-pending statuses: ${depStatuses.join(', ')}. Preserving dependencies.`
              );
            }
          }
        }
      }

      // Get skipVerificationInAutoMode setting
      const settings = await this.settingsService?.getGlobalSettings();
      const skipVerification = settings?.skipVerificationInAutoMode ?? false;

      // Filter to only features with satisfied dependencies
      const readyFeatures: Feature[] = [];
      const blockedFeatures: Array<{ feature: Feature; reason: string }> = [];

      for (const feature of orderedFeatures) {
        const isSatisfied = areDependenciesSatisfied(feature, allFeatures, { skipVerification });
        if (isSatisfied) {
          readyFeatures.push(feature);
        } else {
          const blockingDeps =
            feature.dependencies?.filter((depId) => {
              const dep = allFeatures.find((f) => f.id === depId);
              if (!dep) return true;
              if (skipVerification) {
                return dep.status === 'running' || dep.status === 'in_progress';
              }
              if (dep.isFoundation) {
                return (
                  dep.status !== 'done' && dep.status !== 'completed' && dep.status !== 'verified'
                );
              }
              return (
                dep.status !== 'completed' && dep.status !== 'verified' && dep.status !== 'done'
              );
            }) || [];

          const reason = blockingDeps
            .map((depId) => {
              const dep = allFeatures.find((f) => f.id === depId);
              const suffix = dep?.isFoundation ? ' [foundation - needs merge]' : '';
              return `${depId}(${dep?.status || 'missing'})${suffix}`;
            })
            .join(', ');

          blockedFeatures.push({
            feature,
            reason: reason ? `Blocked by dependencies: ${reason}` : 'Unknown dependency issue',
          });
        }
      }

      if (blockedFeatures.length > 0) {
        logger.info(
          `[loadPendingFeatures] ${blockedFeatures.length} features blocked by dependencies: ${blockedFeatures.map((b) => `${b.feature.id} (${b.reason})`).join('; ')}`
        );
      }

      // ── Human-blocked dependency detection and escalation ──
      const humanBlockedFeatures: Array<{ feature: Feature; humanBlockers: string[] }> = [];
      const agentBlockedFeatures: Array<{ feature: Feature; agentBlockers: string[] }> = [];

      for (const blocked of blockedFeatures) {
        const blockingInfo = getBlockingInfo(blocked.feature, allFeatures);

        if (blockingInfo.humanBlockers.length > 0) {
          humanBlockedFeatures.push({
            feature: blocked.feature,
            humanBlockers: blockingInfo.humanBlockers,
          });

          const humanBlockerDetails = blockingInfo.humanBlockers
            .map((blockerId) => {
              const blocker = allFeatures.find((f) => f.id === blockerId);
              return blocker
                ? `${blockerId} (assigned to ${blocker.assignee || 'unknown'})`
                : blockerId;
            })
            .join(', ');

          logger.warn(
            `[loadPendingFeatures] Feature ${blocked.feature.id} human-blocked by ${humanBlockerDetails}`
          );

          this.events.emit('escalation:signal-received', {
            source: EscalationSource.human_blocked_dependency,
            severity: EscalationSeverity.medium,
            type: 'feature_human_blocked',
            context: {
              featureId: blocked.feature.id,
              featureTitle: blocked.feature.title || blocked.feature.description,
              humanBlockers: blockingInfo.humanBlockers,
              humanBlockerDetails,
              projectPath,
              branchName,
            },
            deduplicationKey: `human-blocked-${blocked.feature.id}-${blockingInfo.humanBlockers.join('-')}`,
            timestamp: new Date().toISOString(),
          });
        } else if (blockingInfo.agentBlockers.length > 0) {
          agentBlockedFeatures.push({
            feature: blocked.feature,
            agentBlockers: blockingInfo.agentBlockers,
          });
        }
      }

      // Update project state with human-blocked count (via coordinator key lookup)
      // This is optional — callers that need this data pass the coordinator externally
      if (humanBlockedFeatures.length > 0 || agentBlockedFeatures.length > 0) {
        logger.info(
          `[loadPendingFeatures] Blocked feature breakdown: ${humanBlockedFeatures.length} human-blocked, ${agentBlockedFeatures.length} agent-blocked`
        );
      }

      // ── Pipeline stall detection ──
      const totalPendingCount = orderedFeatures.length;
      const allFeaturesHumanBlocked =
        humanBlockedFeatures.length > 0 &&
        humanBlockedFeatures.length === totalPendingCount &&
        readyFeatures.length === 0;

      if (allFeaturesHumanBlocked) {
        logger.error(
          `[loadPendingFeatures] PIPELINE STALLED: All ${totalPendingCount} remaining features are human-blocked. No agent work can proceed.`
        );

        this.events.emit('escalation:signal-received', {
          source: EscalationSource.human_blocked_dependency,
          severity: EscalationSeverity.critical,
          type: 'pipeline_stalled_human_blocked',
          context: {
            totalFeatures: totalPendingCount,
            humanBlockedCount: humanBlockedFeatures.length,
            humanBlockedFeatureIds: humanBlockedFeatures.map((hb) => hb.feature.id),
            projectPath,
            branchName,
            message: `All ${totalPendingCount} remaining features are blocked by human-assigned dependencies. Pipeline is stalled.`,
          },
          deduplicationKey: `pipeline-stalled-${projectPath}-${branchName ?? 'main'}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Sort by priority (lower number = higher priority, picked up first)
      const priorityOrder = (p?: number | null): number => (p === 0 || p == null ? 3 : p);
      readyFeatures.sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority));

      // ── Project affinity filtering and sorting ──
      // Only applied when instance identity is configured (multi-instance deployments).
      // Single-instance setups with no proto.config.yaml identity pass through unmodified.
      let affinityFilteredFeatures = readyFeatures;
      if (this.instanceId && this.getAssignedProjectSlugs) {
        try {
          const assignedSlugs = await this.getAssignedProjectSlugs(projectPath);

          // Categorise each feature by affinity tier:
          //   0 = assigned project    (projectSlug explicitly assigned to this instance)
          //   1 = own unassigned      (no projectSlug but createdByInstance matches this instance)
          //   2 = overflow            (all other features — eligible only when overflowEnabled)
          const affinityTier = (f: Feature): 0 | 1 | 2 => {
            if (f.projectSlug && assignedSlugs.has(f.projectSlug)) return 0;
            if (!f.projectSlug && f.createdByInstance === this.instanceId) return 1;
            return 2;
          };

          const beforeCount = readyFeatures.length;
          affinityFilteredFeatures = readyFeatures.filter((f) => {
            const tier = affinityTier(f);
            if (tier === 2 && !this.overflowEnabled) {
              logger.debug(
                `[loadPendingFeatures] Affinity: skipping overflow feature ${f.id} (overflowEnabled=false)`
              );
              return false;
            }
            return true;
          });

          // Sort: assigned (0) > own unassigned (1) > overflow (2)
          // Within the same tier, preserve the existing priority order.
          affinityFilteredFeatures.sort((a, b) => {
            const tierDiff = affinityTier(a) - affinityTier(b);
            if (tierDiff !== 0) return tierDiff;
            return priorityOrder(a.priority) - priorityOrder(b.priority);
          });

          logger.info(
            `[loadPendingFeatures] Affinity filter (instanceId=${this.instanceId}): ${beforeCount} → ${affinityFilteredFeatures.length} features ` +
              `(assigned=${assignedSlugs.size} projects, overflow=${this.overflowEnabled})`
          );
        } catch (err) {
          // On error, fall back to the unfiltered list (safe degradation)
          logger.warn(
            '[loadPendingFeatures] Affinity filtering failed, using unfiltered list:',
            err
          );
          affinityFilteredFeatures = readyFeatures;
        }
      }

      logger.info(
        `[loadPendingFeatures] After dependency filtering: ${affinityFilteredFeatures.length} ready features (skipVerification=${skipVerification})`
      );

      return affinityFilteredFeatures;
    } catch (error) {
      logger.error(`[loadPendingFeatures] Error loading features:`, error);
      return [];
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Read the auto-mode pickup cooldown from workflow settings.
   * Default: 30000ms (30s). Set to 0 to disable.
   */
  private async getPickupCooldownMs(): Promise<number> {
    const DEFAULT_COOLDOWN_MS = 30_000;
    try {
      const settings = await this.settingsService?.getGlobalSettings();
      return settings?.autoModePickupCooldownMs ?? DEFAULT_COOLDOWN_MS;
    } catch {
      return DEFAULT_COOLDOWN_MS;
    }
  }

  /**
   * Read the maxPendingReviews threshold from project workflow settings.
   * Default: 5. When the review queue depth meets or exceeds this value,
   * auto-mode feature pickup is paused.
   */
  private async getMaxPendingReviews(projectPath: string): Promise<number> {
    const DEFAULT_MAX = 5;
    try {
      if (!this.settingsService) return DEFAULT_MAX;
      const projectSettings = await this.settingsService.getProjectSettings(projectPath);
      const workflow = projectSettings.workflow as typeof projectSettings.workflow & {
        maxPendingReviews?: number;
      };
      return workflow?.maxPendingReviews ?? DEFAULT_MAX;
    } catch {
      return DEFAULT_MAX;
    }
  }

  /**
   * Count the number of features currently in 'review' state for a project.
   * Used to enforce the review queue WIP limit.
   */
  private async getReviewQueueDepth(projectPath: string): Promise<number> {
    const featuresDir = getFeaturesDir(projectPath);
    try {
      const entries = await secureFs.readdir(featuresDir, { withFileTypes: true });
      let reviewCount = 0;
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const featurePath = path.join(featuresDir, entry.name, 'feature.json');
        const result = await readJsonWithRecovery<{ status?: string } | null>(featurePath, null, {
          maxBackups: DEFAULT_BACKUP_COUNT,
          autoRestore: false,
        });
        if (result.data?.status === 'review') {
          reviewCount++;
        }
      }
      return reviewCount;
    } catch {
      return 0;
    }
  }

  private async getCurrentBranch(projectPath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd: projectPath });
      const branch = stdout.trim();
      return branch || null;
    } catch {
      return null;
    }
  }

  private async getAllWorktreeBranches(projectPath: string): Promise<Set<string>> {
    const branches = new Set<string>();
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: projectPath,
      });

      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.startsWith('branch ')) {
          const branch = line.slice(7).replace('refs/heads/', '');
          branches.add(branch);
        }
      }
    } catch {
      // If we can't get worktrees, return empty set
    }
    return branches;
  }
}
