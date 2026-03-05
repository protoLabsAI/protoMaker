/**
 * FeatureScheduler - Decoupled scheduling layer for auto-mode.
 *
 * Owns the loop lifecycle, pending feature loading, concurrency management,
 * and feature selection logic. Delegates actual execution to a PipelineRunner.
 *
 * Design: FeatureScheduler depends on PipelineRunner (interface).
 * AutoModeService implements PipelineRunner, delegating to leadEngineerService.process().
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
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import type { EventEmitter } from '../lib/events.js';
import type { LoopState } from './auto-mode/auto-loop-coordinator.js';
import type { RunningFeature } from './auto-mode/execution-types.js';
import type { FeatureHealthService } from './feature-health-service.js';

const execAsync = promisify(exec);
const logger = createLogger('FeatureScheduler');

// Auto-loop sleep interval constants
const SLEEP_INTERVAL_CAPACITY_MS = 5000;
const SLEEP_INTERVAL_IDLE_MS = 30000;
const SLEEP_INTERVAL_NORMAL_MS = 2000;
const SLEEP_INTERVAL_ERROR_MS = 5000;

// ── Public interfaces ──────────────────────────────────────────────────────

/**
 * Result returned by PipelineRunner.run() on success.
 * On failure, the runner throws.
 */
export interface PipelineResult {
  featureId: string;
  success: boolean;
}

/**
 * Interface implemented by the execution layer (AutoModeService).
 * FeatureScheduler calls run() when it decides a feature should be executed.
 */
export interface PipelineRunner {
  run(projectPath: string, featureId: string): Promise<PipelineResult>;
}

/**
 * Callbacks into AutoModeService for operations that remain there.
 * Passed at construction time to avoid circular imports.
 */
export interface SchedulerCallbacks {
  /** Synchronous count of running features for a project/worktree */
  getRunningCountForWorktree(projectPath: string, branchName: string | null): number;

  /** Emit a rate-limited auto-mode event to the frontend */
  emitAutoModeEvent(eventType: string, data: Record<string, unknown>): void;

  /** Record a failure and return true if the circuit-breaker threshold is reached */
  trackFailureAndCheckPauseForProject(
    projectPath: string,
    branchName: string | null,
    error: { type: string; message: string }
  ): boolean;

  /** Trigger loop pause after circuit-breaker fires */
  signalShouldPauseForProject(
    projectPath: string,
    branchName: string | null,
    error: { type: string; message: string }
  ): void;

  /** Returns false when the feature type cannot be run (e.g. content without LE service) */
  canRunFeature(feature: Feature): boolean;

  /** Update the human-blocked feature count in the loop state */
  updateHumanBlockedCount(projectPath: string, branchName: string | null, count: number): void;
}

// ── FeatureScheduler ────────────────────────────────────────────────────────

export class FeatureScheduler {
  private readonly HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD = parseFloat(
    process.env.HEAP_STOP_THRESHOLD || '0.8'
  );
  private readonly HEAP_USAGE_ABORT_AGENTS_THRESHOLD = parseFloat(
    process.env.HEAP_ABORT_THRESHOLD || '0.9'
  );

  private featureHealthService: FeatureHealthService | null = null;

  constructor(
    private runner: PipelineRunner,
    private featureLoader: FeatureLoader,
    private events: EventEmitter,
    private settingsService: SettingsService | null,
    private runningFeatures: Map<string, RunningFeature>,
    private callbacks: SchedulerCallbacks
  ) {}

  setFeatureHealthService(service: FeatureHealthService): void {
    this.featureHealthService = service;
  }

  // ── resolveMaxConcurrency ────────────────────────────────────────────────

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

    if (resolvedValue > MAX_SYSTEM_CONCURRENCY) {
      logger.warn(
        `maxConcurrency ${resolvedValue} exceeds system limit of ${MAX_SYSTEM_CONCURRENCY}, capping to ${MAX_SYSTEM_CONCURRENCY}`
      );
      return MAX_SYSTEM_CONCURRENCY;
    }

    return resolvedValue;
  }

  // ── loadPendingFeatures ──────────────────────────────────────────────────

  /**
   * Load pending features for a specific project/worktree.
   * @param projectPath - The project path
   * @param branchName - The branch name to filter by, or null for main worktree
   */
  async loadPendingFeatures(
    projectPath: string,
    branchName: string | null = null
  ): Promise<Feature[]> {
    const featuresDir = getFeaturesDir(projectPath);

    const primaryBranch = await this.getCurrentBranch(projectPath);
    const worktreeBranches = await this.getAllWorktreeBranches(projectPath);

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

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featurePath = path.join(featuresDir, entry.name, 'feature.json');

          const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
            maxBackups: DEFAULT_BACKUP_COUNT,
            autoRestore: true,
          });

          logRecoveryWarning(result, `Feature ${entry.name}`, logger);

          const feature = result.data;
          if (!feature) {
            continue;
          }

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
          this.events.emit('feature:status-changed', {
            projectPath,
            featureId: feature.id,
            previousStatus: prevStatus,
            newStatus: 'done',
          });
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
              const { stdout: prStateRaw } = await execAsync(
                `gh pr view ${feature.prNumber} --json state --jq '.state'`,
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
              this.events.emit('feature:status-changed', {
                projectPath,
                featureId: feature.id,
                previousStatus: 'blocked',
                newStatus: 'review',
              });
            } catch (error) {
              logger.error(
                `[loadPendingFeatures] Failed to sync feature ${feature.id} to review:`,
                error
              );
            }
          } else {
            const changeReason = feature.statusChangeReason ?? '';
            const isGitWorkflowBlock =
              changeReason.includes('git commit') ||
              changeReason.includes('git workflow failed') ||
              changeReason.includes('plan validation failed');
            if (isGitWorkflowBlock) {
              logger.warn(
                `[loadPendingFeatures] Feature ${feature.id} skipping dep-unblock — ` +
                  `blocked after ${feature.failureCount ?? 0} git workflow failure(s). Requires human intervention.`
              );
              continue;
            }

            logger.info(
              `[loadPendingFeatures] Unblocking feature ${feature.id} — all dependencies now satisfied`
            );
            feature.status = 'backlog';
            try {
              await this.featureLoader.update(projectPath, feature.id, { status: 'backlog' });
              this.events.emit('feature:status-changed', {
                projectPath,
                featureId: feature.id,
                previousStatus: 'blocked',
                newStatus: 'backlog',
              });
            } catch (error) {
              logger.error(
                `[loadPendingFeatures] Failed to unblock feature ${feature.id}:`,
                error
              );
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
              `[loadPendingFeatures] ❌ Skipping epic feature ${feature.id} - ${feature.title}`
            );
            continue;
          }

          if (feature.assignee && feature.assignee !== 'agent') {
            logger.info(
              `[loadPendingFeatures] ❌ Skipping feature ${feature.id} - assigned to "${feature.assignee}" (not agent)`
            );
            continue;
          }

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
              const { stdout: prStateRaw } = await execAsync(
                `gh pr view ${feature.prNumber} --json state --jq '.state'`,
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
              `[loadPendingFeatures] ⏭ Feature ${feature.id} has open PR #${existingPrFilter} — syncing to review, skipping execution`
            );
            try {
              await this.featureLoader.update(projectPath, feature.id, {
                status: 'review',
                prNumber: existingPrFilter,
              });
              this.events.emit('feature:status-changed', {
                projectPath,
                featureId: feature.id,
                previousStatus: feature.status,
                newStatus: 'review',
              });
            } catch (error) {
              logger.error(
                `[loadPendingFeatures] Failed to sync feature ${feature.id} to review:`,
                error
              );
            }
            continue;
          }

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
                  `[loadPendingFeatures] ✅ Including feature ${feature.id} with stale worktree (branchName: ${featureBranch}, status: ${feature.status}) for main worktree`
                );
              } else if (isOrphaned) {
                logger.info(
                  `[loadPendingFeatures] ✅ Including orphaned feature ${feature.id} (branchName: ${featureBranch} has no worktree) for main worktree`
                );
              } else {
                logger.info(
                  `[loadPendingFeatures] ✅ Including feature ${feature.id} for main worktree (featureBranch: ${featureBranch})`
                );
              }
              pendingFeatures.push(feature);
            } else {
              logger.info(
                `[loadPendingFeatures] ❌ Filtering out feature ${feature.id} (branchName: ${featureBranch} has worktree, status: ${feature.status}) for main worktree`
              );
            }
          } else {
            if (featureBranch === branchName) {
              logger.info(
                `[loadPendingFeatures] ✅ Including feature ${feature.id} for worktree ${branchName}`
              );
              pendingFeatures.push(feature);
            } else {
              logger.info(
                `[loadPendingFeatures] ❌ Filtering out feature ${feature.id} (branchName: ${featureBranch}, expected: ${branchName}) for worktree ${branchName}`
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

      const settings = await this.settingsService?.getGlobalSettings();
      const skipVerification = settings?.skipVerificationInAutoMode ?? false;

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

      this.callbacks.updateHumanBlockedCount(projectPath, branchName, humanBlockedFeatures.length);

      if (humanBlockedFeatures.length > 0 || agentBlockedFeatures.length > 0) {
        logger.info(
          `[loadPendingFeatures] Blocked feature breakdown: ${humanBlockedFeatures.length} human-blocked, ${agentBlockedFeatures.length} agent-blocked`
        );
      }

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

      const priorityOrder = (p?: number | null): number => (p === 0 || p == null ? 3 : p);
      readyFeatures.sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority));

      logger.info(
        `[loadPendingFeatures] After dependency filtering: ${readyFeatures.length} ready features (skipVerification=${skipVerification})`
      );

      return readyFeatures;
    } catch (error) {
      logger.error(`[loadPendingFeatures] Error loading features:`, error);
      return [];
    }
  }

  // ── runLoop (core loop body) ────────────────────────────────────────────

  /**
   * Run the scheduling loop for a project/worktree.
   * Called by AutoModeService.runAutoLoopForProject() after resolving the LoopState.
   */
  async runLoop(loopState: LoopState): Promise<void> {
    const { projectPath, branchName } = loopState.config;
    const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';

    logger.info(
      `[AutoLoop] Starting loop for ${worktreeDesc} in ${projectPath}, maxConcurrency: ${loopState.config.maxConcurrency}`
    );
    let iterationCount = 0;

    // Configurable startup delay before first agent launch (default 10s, 0 to disable)
    const startupDelayMs = parseInt(process.env.AUTO_MODE_STARTUP_DELAY_MS || '10000', 10);
    if (startupDelayMs > 0) {
      logger.info(
        `[AutoLoop] Startup cooldown: waiting ${startupDelayMs}ms before first agent launch`
      );
      await this.sleep(startupDelayMs, loopState.abortController.signal);
      if (!loopState.isRunning || loopState.abortController.signal.aborted) {
        logger.info(`[AutoLoop] Auto-mode stopped during startup cooldown for ${worktreeDesc}`);
        return;
      }
      const heapUsage = this.getHeapUsagePercent();
      if (heapUsage >= this.HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD) {
        logger.warn(
          `[AutoLoop] Heap at ${Math.round(heapUsage * 100)}% after cooldown, stopping auto-mode for ${worktreeDesc}`
        );
        loopState.isRunning = false;
        return;
      }
    }

    while (loopState.isRunning && !loopState.abortController.signal.aborted) {
      iterationCount++;
      logger.debug(
        `[AutoLoop] Heartbeat - Iteration ${iterationCount} for ${worktreeDesc} in ${projectPath}`
      );

      // Periodic health sweep (every ~100 seconds at 2s interval)
      if (iterationCount % 50 === 0 && this.featureHealthService) {
        try {
          const report = await this.featureHealthService.audit(projectPath, true);
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
      const earlyHeapUsage = this.getHeapUsagePercent();
      if (earlyHeapUsage >= this.HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD) {
        logger.warn(
          `[AutoLoop] High heap (${Math.round(earlyHeapUsage * 100)}%), deferring iteration for ${worktreeDesc}`
        );
        await this.sleep(10000, loopState.abortController.signal);
        continue;
      }

      try {
        // Count running features for THIS project/worktree only
        const projectRunningCount = this.callbacks.getRunningCountForWorktree(
          projectPath,
          branchName
        );

        // Count features that are in the process of being started
        const startingCount = loopState.startingFeatures.size;

        // Total occupied slots = running + starting
        const totalOccupied = projectRunningCount + startingCount;

        if (totalOccupied >= loopState.config.maxConcurrency) {
          logger.debug(
            `[AutoLoop] At capacity (${projectRunningCount} running + ${startingCount} starting = ${totalOccupied}/${loopState.config.maxConcurrency}), waiting...`
          );
          await this.sleep(SLEEP_INTERVAL_CAPACITY_MS);
          continue;
        }

        // Load pending features for this project/worktree
        const pendingFeatures = await this.loadPendingFeatures(projectPath, branchName);

        logger.info(
          `[AutoLoop] Iteration ${iterationCount}: Found ${pendingFeatures.length} pending features, ${projectRunningCount}/${loopState.config.maxConcurrency} running for ${worktreeDesc}`
        );

        if (pendingFeatures.length === 0) {
          const inProgress = await this.hasInProgressFeatures(projectPath, branchName);
          if (projectRunningCount === 0 && !inProgress && !loopState.hasEmittedIdleEvent) {
            this.callbacks.emitAutoModeEvent('auto_mode_idle', {
              message: 'No pending features - auto mode idle',
              projectPath,
              branchName,
            });
            loopState.hasEmittedIdleEvent = true;
            logger.info(`[AutoLoop] Backlog complete, auto mode now idle for ${worktreeDesc}`);
          } else if (projectRunningCount > 0) {
            logger.info(
              `[AutoLoop] No pending features available, ${projectRunningCount} still running, waiting...`
            );
          } else if (inProgress) {
            logger.info(
              `[AutoLoop] No pending features available but features still in_progress, waiting for status transition...`
            );
          } else if (loopState.hasEmittedIdleEvent) {
            logger.debug(
              `[AutoLoop] Still idle for ${worktreeDesc}, polling again in ${SLEEP_INTERVAL_IDLE_MS / 1000}s...`
            );
          }
          await this.sleep(
            loopState.hasEmittedIdleEvent ? SLEEP_INTERVAL_IDLE_MS : 10000,
            loopState.abortController.signal
          );
          continue;
        }

        // Find a feature not currently running, not being started, and not yet finished
        const nextFeature = pendingFeatures.find(
          (f) =>
            !this.runningFeatures.has(f.id) &&
            !loopState.startingFeatures.has(f.id) &&
            !this.isFeatureFinished(f)
        );

        logger.info(
          `[AutoLoop] Feature selection from ${pendingFeatures.length} pending: ${pendingFeatures.map((f) => `${f.id}(running:${this.runningFeatures.has(f.id)},finished:${this.isFeatureFinished(f)})`).join(', ')}`
        );

        if (nextFeature) {
          const heapUsage = this.getHeapUsagePercent();

          if (heapUsage >= this.HEAP_USAGE_ABORT_AGENTS_THRESHOLD) {
            const mostRecent = this.getMostRecentRunningFeature(projectPath);
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
            await this.sleep(2000);
            continue;
          }

          if (heapUsage >= this.HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD) {
            logger.warn(
              `[AutoLoop] High heap usage (${Math.round(heapUsage * 100)}%), deferring new agent start`
            );
            await this.sleep(5000);
            continue;
          }

          // Double-check we're not at capacity (defensive check before starting)
          const currentRunningCount = this.callbacks.getRunningCountForWorktree(
            projectPath,
            branchName
          );
          const currentStartingCount = loopState.startingFeatures.size;
          const currentTotalOccupied = currentRunningCount + currentStartingCount;

          if (currentTotalOccupied >= loopState.config.maxConcurrency) {
            logger.warn(
              `[AutoLoop] Race condition detected: at capacity ${currentRunningCount} running + ${currentStartingCount} starting = ${currentTotalOccupied}/${loopState.config.maxConcurrency} when trying to start feature ${nextFeature.id}, skipping`
            );
            await this.sleep(1000);
            continue;
          }

          // Guard: check if the runner can handle this feature type
          if (!this.callbacks.canRunFeature(nextFeature)) {
            logger.warn(
              `[AutoLoop] Skipping feature ${nextFeature.id} ("${nextFeature.title}") — runner cannot handle this feature type`
            );
            await this.sleep(2000);
            continue;
          }

          // Mark feature as starting BEFORE calling runner to prevent race conditions
          loopState.startingFeatures.add(nextFeature.id);

          logger.info(`[AutoLoop] Starting feature ${nextFeature.id}: ${nextFeature.title}`);
          loopState.hasEmittedIdleEvent = false;

          // Safety timeout: Remove from starting set after 120 seconds if still there.
          const STARTING_TIMEOUT_MS = 120000;
          const startingTimeout = setTimeout(() => {
            if (loopState.startingFeatures.has(nextFeature.id)) {
              if (!this.runningFeatures.has(nextFeature.id)) {
                logger.warn(
                  `[AutoLoop] Feature ${nextFeature.id} stuck in starting state for ${STARTING_TIMEOUT_MS / 1000}s, cleaning up`
                );
                loopState.startingFeatures.delete(nextFeature.id);
              }
            }
          }, STARTING_TIMEOUT_MS);

          // Fire execution in background (non-blocking)
          const executionPromise = this.runner.run(projectPath, nextFeature.id);

          executionPromise
            .then(() => {
              clearTimeout(startingTimeout);
              loopState.startingFeatures.delete(nextFeature.id);
            })
            .catch((error: unknown) => {
              logger.error(`Feature ${nextFeature.id} error:`, error);
              clearTimeout(startingTimeout);
              loopState.startingFeatures.delete(nextFeature.id);
              const errorInfo = classifyError(error);
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
            });

          // Brief sleep to ensure proper sequencing
          await this.sleep(100);
        } else {
          logger.debug(`[AutoLoop] All pending features are already running or being started`);
        }

        await this.sleep(SLEEP_INTERVAL_NORMAL_MS);
      } catch (error) {
        logger.error(`[AutoLoop] Loop iteration error for ${projectPath}:`, error);
        await this.sleep(SLEEP_INTERVAL_ERROR_MS);
      }
    }

    loopState.isRunning = false;
    logger.info(
      `[AutoLoop] Loop stopped for project: ${projectPath} after ${iterationCount} iterations`
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────

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
      // Return empty set — all features will be treated as orphaned on main worktree
    }
    return branches;
  }

  private async hasInProgressFeatures(
    projectPath: string,
    branchName: string | null
  ): Promise<boolean> {
    try {
      const allFeatures = await this.featureLoader.getAll(projectPath);
      return allFeatures.some((f) => {
        if (f.status !== 'in_progress') return false;
        if (branchName === null) {
          return !f.branchName || f.branchName === 'main';
        }
        return f.branchName === branchName;
      });
    } catch {
      return false;
    }
  }

  private isFeatureFinished(feature: Feature): boolean {
    const isCompleted =
      feature.status === 'completed' ||
      feature.status === 'verified' ||
      feature.status === 'done' ||
      feature.status === 'review';

    if (feature.planSpec?.status === 'approved') {
      const tasksCompleted = feature.planSpec.tasksCompleted ?? 0;
      const tasksTotal = feature.planSpec.tasksTotal ?? 0;
      if (tasksCompleted < tasksTotal) {
        return false;
      }
    }

    return isCompleted;
  }

  private getMostRecentRunningFeature(projectPath: string): RunningFeature | null {
    let mostRecent: RunningFeature | null = null;
    let mostRecentTime = 0;

    for (const [, feature] of this.runningFeatures) {
      if (feature.projectPath === projectPath && feature.startTime) {
        if (feature.startTime > mostRecentTime) {
          mostRecentTime = feature.startTime;
          mostRecent = feature;
        }
      }
    }

    return mostRecent;
  }

  private getHeapUsagePercent(): number {
    const memoryUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    return memoryUsage.heapUsed / heapStats.heap_size_limit;
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);

      if (signal?.aborted) {
        clearTimeout(timeout);
        reject(new Error('Aborted'));
        return;
      }

      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout);
            reject(new Error('Aborted'));
          },
          { once: true }
        );
      }
    });
  }
}
