/**
 * Reconciliation Service - Corrects detected world state drifts
 *
 * Takes Drift objects from WorldStateMonitor and executes appropriate
 * corrective actions to bring actual state in line with desired state.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import type { ExecutionState } from '@protolabsai/types';
import { getExecutionStatePath } from '@protolabsai/platform';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { WorktreeLifecycleService } from './worktree-lifecycle-service.js';
import type { GitHubMergeService } from './github-merge-service.js';
import type { FailureClassifierService } from './failure-classifier-service.js';
import type { PRFeedbackService } from './pr-feedback-service.js';
import type { HITLFormService } from './hitl-form-service.js';
import * as secureFs from '../lib/secure-fs.js';

const execAsync = promisify(exec);
const logger = createLogger('ReconciliationService');

export type DriftType =
  // Automaker internal
  | 'epic-not-decomposed'
  | 'milestone-not-planned'
  | 'feature-no-agent'
  | 'feature-stuck'
  | 'orphaned-worktree'
  | 'blocked-transient-retry' // Blocked feature with transient error ready for retry
  // GitHub
  | 'pr-merged-status-stale'
  | 'pr-ci-failure'
  | 'pr-needs-review'
  | 'pr-has-feedback'
  | 'pr-approved-not-merged'
  | 'pr-stale'
  // Git
  | 'branch-merged-status-stale'
  | 'branch-deleted-feature-exists'
  | 'worktree-orphaned';

export interface Drift {
  type: DriftType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  projectPath: string;
  featureId?: string;
  prNumber?: number;
  branchName?: string;
  details: Record<string, unknown>;
}

interface ReconciliationResult {
  success: boolean;
  action: string;
  error?: string;
}

export class ReconciliationService {
  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader,
    private autoModeService: AutoModeService,
    private worktreeLifecycleService?: WorktreeLifecycleService,
    private githubMergeService?: GitHubMergeService,
    private failureClassifierService?: FailureClassifierService,
    private prFeedbackService?: PRFeedbackService,
    private hitlFormService?: HITLFormService
  ) {}

  /**
   * Reconcile a detected drift
   */
  async reconcile(drift: Drift): Promise<ReconciliationResult> {
    logger.info(`Reconciling drift: ${drift.type}`, {
      severity: drift.severity,
      projectPath: drift.projectPath,
      featureId: drift.featureId,
      prNumber: drift.prNumber,
    });

    try {
      let action: string;

      switch (drift.type) {
        // Automaker internal drifts
        case 'epic-not-decomposed':
          action = await this.reconcileEpicNotDecomposed(drift);
          break;

        case 'milestone-not-planned':
          action = await this.reconcileMilestoneNotPlanned(drift);
          break;

        case 'feature-no-agent':
          action = await this.reconcileFeatureNoAgent(drift);
          break;

        case 'feature-stuck':
          action = await this.reconcileFeatureStuck(drift);
          break;

        case 'orphaned-worktree':
          action = await this.reconcileOrphanedWorktree(drift);
          break;

        case 'blocked-transient-retry':
          action = await this.reconcileBlockedTransientRetry(drift);
          break;

        // GitHub drifts
        case 'pr-merged-status-stale':
          action = await this.reconcilePRMergedStatusStale(drift);
          break;

        case 'pr-ci-failure':
          action = await this.reconcilePRCIFailure(drift);
          break;

        case 'pr-has-feedback':
          action = await this.reconcilePRHasFeedback(drift);
          break;

        case 'pr-approved-not-merged':
          action = await this.reconcilePRApprovedNotMerged(drift);
          break;

        case 'pr-stale':
          action = await this.reconcilePRStale(drift);
          break;

        // Git drifts
        case 'branch-merged-status-stale':
          action = await this.reconcileBranchMergedStatusStale(drift);
          break;

        default:
          logger.warn(`Unknown drift type: ${drift.type}`);
          action = 'skipped-unknown-type';
      }

      // Emit event for UI notification
      this.events.emit('world-state:reconciliation', {
        driftType: drift.type,
        action,
        featureId: drift.featureId,
        prNumber: drift.prNumber,
        timestamp: Date.now(),
      });

      logger.info(`Reconciliation complete: ${action}`);

      return { success: true, action };
    } catch (error) {
      logger.error(`Reconciliation failed for ${drift.type}:`, error);

      return {
        success: false,
        action: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Epic has workItemState='approved' but ProjM never created Project
   */
  private async reconcileEpicNotDecomposed(drift: Drift): Promise<string> {
    if (!drift.featureId) {
      throw new Error('featureId required for epic-not-decomposed');
    }

    const feature = await this.featureLoader.get(drift.projectPath, drift.featureId);
    if (!feature) {
      return 'feature-not-found';
    }

    logger.info(`Re-emitting authority:pm-review-approved for epic ${drift.featureId}`);

    // Re-emit the event that ProjM should have processed
    this.events.emit('authority:pm-review-approved', {
      projectPath: drift.projectPath,
      featureId: drift.featureId,
      complexity: feature.complexity || 'medium',
      milestones: drift.details.milestones || [],
    });

    return 'event-reemitted';
  }

  /**
   * Project milestone is 'stub' but has no child features yet
   */
  private async reconcileMilestoneNotPlanned(_drift: Drift): Promise<string> {
    // TODO: Trigger ProjM to plan the milestone
    logger.info('TODO: Trigger ProjM to plan milestone');
    return 'milestone-planning-triggered';
  }

  /**
   * Feature is in-progress but no agent is running
   */
  private async reconcileFeatureNoAgent(drift: Drift): Promise<string> {
    if (!drift.featureId) {
      throw new Error('featureId required for feature-no-agent');
    }

    // Guard: verify feature is actually in-progress before resuming.
    // Prevents zombie loops where done features keep getting restarted.
    const feature = await this.featureLoader.get(drift.projectPath, drift.featureId);
    if (!feature) {
      return 'feature-not-found';
    }

    const terminalStatuses = new Set(['done', 'verified', 'completed', 'review']);
    if (terminalStatuses.has(feature.status ?? '')) {
      logger.warn(
        `Skipping resume for feature ${drift.featureId} — already in terminal status "${feature.status}"`
      );
      return 'skipped-terminal-status';
    }

    logger.info(`Resuming feature ${drift.featureId} - no agent running`);

    // Try to resume the feature
    await this.autoModeService.resumeFeature(drift.projectPath, drift.featureId, true);

    return 'feature-resumed';
  }

  /**
   * Feature has been in-progress for too long (likely stuck)
   */
  private async reconcileFeatureStuck(drift: Drift): Promise<string> {
    if (!drift.featureId) {
      throw new Error('featureId required for feature-stuck');
    }

    const feature = await this.featureLoader.get(drift.projectPath, drift.featureId);
    if (!feature) {
      return 'feature-not-found';
    }

    const failureCount = (feature.failureCount as number | undefined) ?? 0;

    if (failureCount < 3) {
      logger.info(
        `Feature ${drift.featureId} stuck with failureCount=${failureCount} (<3), resetting to backlog`
      );

      await this.featureLoader.update(drift.projectPath, drift.featureId, {
        status: 'backlog',
        failureCount: 0,
        error: undefined,
      });

      return 'reset-to-backlog';
    }

    // failureCount >= 3: move to blocked and create HITL form
    logger.warn(
      `Feature ${drift.featureId} stuck with failureCount=${failureCount} (>=3), moving to blocked`
    );

    await this.featureLoader.update(drift.projectPath, drift.featureId, {
      status: 'blocked',
      error: `Feature stuck after ${failureCount} failures — requires human intervention`,
    });

    if (this.hitlFormService) {
      const existingForm = this.hitlFormService.getByFeatureId(drift.featureId, drift.projectPath);

      if (!existingForm) {
        try {
          const form = await this.hitlFormService.create({
            title: `Feature stuck: ${feature.title ?? drift.featureId}`,
            description: `Feature has been stuck for too long with ${failureCount} failures. Manual intervention required.`,
            steps: [
              {
                title: 'How would you like to proceed?',
                schema: {
                  type: 'object',
                  properties: {
                    resolution: {
                      type: 'string',
                      title: 'Resolution',
                      oneOf: [
                        {
                          const: 'retry',
                          title: 'Retry',
                          description: 'Reset and re-run the agent',
                        },
                        {
                          const: 'provide_context',
                          title: 'Provide context',
                          description: 'Give the agent additional information',
                        },
                        {
                          const: 'close',
                          title: 'Close as blocked',
                          description: 'Keep blocked for manual handling',
                        },
                      ],
                    },
                  },
                  required: ['resolution'],
                },
              },
            ],
            callerType: 'api',
            featureId: drift.featureId,
            projectPath: drift.projectPath,
          });

          if (form) {
            logger.info(`Created HITL form ${form.id} for stuck feature ${drift.featureId}`);
          }
        } catch (err) {
          logger.error(`Failed to create HITL form for stuck feature ${drift.featureId}:`, err);
        }
      } else {
        logger.info(
          `HITL form ${existingForm.id} already pending for feature ${drift.featureId}, skipping`
        );
      }
    } else {
      logger.warn(
        `HITLFormService not available, cannot create HITL form for feature ${drift.featureId}`
      );
    }

    return 'moved-to-blocked-hitl-created';
  }

  /**
   * Worktree exists but feature is done or branch is gone
   */
  private async reconcileOrphanedWorktree(drift: Drift): Promise<string> {
    const branchName = drift.branchName ?? (drift.details.branchName as string | undefined);

    if (!branchName) {
      logger.warn('reconcileOrphanedWorktree: no branchName in drift, cannot clean up', { drift });
      return 'skipped-no-branch-name';
    }

    if (!this.worktreeLifecycleService) {
      logger.warn(
        `WorktreeLifecycleService not available, cannot clean up orphaned worktree for branch ${branchName}`
      );
      return 'skipped-service-unavailable';
    }

    logger.info(`Cleaning up orphaned worktree for branch ${branchName} in ${drift.projectPath}`);

    await this.worktreeLifecycleService.cleanupWorktree(
      drift.projectPath,
      branchName,
      drift.featureId
    );

    logger.info(`Orphaned worktree cleaned for branch ${branchName}`);
    return 'worktree-cleaned';
  }

  /**
   * PR is merged but feature status is still 'review'
   */
  private async reconcilePRMergedStatusStale(drift: Drift): Promise<string> {
    if (!drift.featureId) {
      throw new Error('featureId required for pr-merged-status-stale');
    }

    logger.info(`Moving feature ${drift.featureId} to 'done' - PR merged`);

    const feature = await this.featureLoader.get(drift.projectPath, drift.featureId);
    const prMergedAt = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: 'done',
      prMergedAt,
    };

    // Calculate review duration if prCreatedAt is available
    if (feature?.prCreatedAt) {
      const createdAt = new Date(feature.prCreatedAt);
      const mergedAt = new Date(prMergedAt);
      updates.prReviewDurationMs = mergedAt.getTime() - createdAt.getTime();
    }

    await this.featureLoader.update(drift.projectPath, drift.featureId, updates);

    return 'feature-marked-done';
  }

  /**
   * PR has CI failures
   */
  private async reconcilePRCIFailure(drift: Drift): Promise<string> {
    if (!drift.prNumber) {
      throw new Error('prNumber required for pr-ci-failure');
    }

    const failedChecksRaw = drift.details.failedChecks;
    const failedChecks = Array.isArray(failedChecksRaw) ? (failedChecksRaw as string[]) : [];
    const failureReason = failedChecks.join(', ') || String(drift.details.error ?? 'CI failure');

    // Classify the failure to determine if it is transient or persistent
    const classification = this.failureClassifierService
      ? this.failureClassifierService.classify(failureReason)
      : null;

    const isTransient = classification?.isRetryable ?? false;

    logger.info(
      `PR #${drift.prNumber} CI failure — classified as ${classification?.category ?? 'unknown'}, isTransient=${isTransient}`,
      {
        featureId: drift.featureId,
        failedChecks,
      }
    );

    if (isTransient) {
      // Re-trigger CI by emitting the existing ci-failure event with a transient marker.
      // Downstream consumers (PRFeedbackService) already handle ci-failure and will re-run
      // the agent to push an empty commit or re-run the workflow as appropriate.
      logger.info(
        `Re-triggering CI for PR #${drift.prNumber} (transient failure: ${classification?.category ?? 'unknown'})`
      );

      this.events.emit('pr:ci-failure', {
        projectPath: drift.projectPath,
        featureId: drift.featureId,
        prNumber: drift.prNumber,
        failedChecks,
        isTransient: true,
        failureCategory: classification?.category,
      });

      return 'ci-retriggered';
    }

    // Persistent failure: move feature back to in_progress so the agent can fix it
    if (drift.featureId) {
      logger.warn(
        `PR #${drift.prNumber} has persistent CI failure, moving feature ${drift.featureId} back to in_progress`
      );

      await this.featureLoader.update(drift.projectPath, drift.featureId, {
        status: 'in_progress',
        error: `CI failure: ${failureReason.slice(0, 500)}`,
      });

      return 'feature-moved-to-in-progress';
    }

    // No feature to update — emit the original event for downstream handling
    logger.warn('PR has persistent CI failures and no featureId, emitting pr:ci-failure', drift);
    this.events.emit('pr:ci-failure', {
      projectPath: drift.projectPath,
      featureId: drift.featureId,
      prNumber: drift.prNumber,
      failedChecks,
    });

    return 'ci-failure-emitted';
  }

  /**
   * PR has requested changes (feedback)
   */
  private async reconcilePRHasFeedback(drift: Drift): Promise<string> {
    if (!drift.featureId) {
      throw new Error('featureId required for pr-has-feedback');
    }

    if (!drift.prNumber) {
      throw new Error('prNumber required for pr-has-feedback');
    }

    if (!this.prFeedbackService) {
      // Fall back to emitting event for downstream handling
      logger.warn('PRFeedbackService not available, emitting pr:changes-requested event');
      this.events.emit('pr:changes-requested', {
        projectPath: drift.projectPath,
        featureId: drift.featureId,
        prNumber: drift.prNumber,
        feedback: drift.details.reviews,
      });
      return 'event-emitted-no-service';
    }

    // Check iteration cap before routing to PRFeedbackService
    const feature = await this.featureLoader.get(drift.projectPath, drift.featureId);
    const iterationCount = (feature?.prIterationCount as number | undefined) ?? 0;
    const MAX_PR_ITERATIONS = 2;

    if (iterationCount >= MAX_PR_ITERATIONS) {
      logger.warn(
        `PR #${drift.prNumber} for feature ${drift.featureId} has reached max iterations (${iterationCount}/${MAX_PR_ITERATIONS}), skipping remediation`
      );
      return 'max-iterations-reached';
    }

    logger.info(
      `Routing PR #${drift.prNumber} feedback to PRFeedbackService for remediation (iteration ${iterationCount})`
    );

    await this.prFeedbackService.processThreadFeedback(
      drift.projectPath,
      drift.featureId,
      drift.prNumber
    );

    return 'feedback-routed-to-pr-feedback-service';
  }

  /**
   * PR is approved but not merged yet
   */
  private async reconcilePRApprovedNotMerged(drift: Drift): Promise<string> {
    if (!drift.prNumber) {
      throw new Error('prNumber required for pr-approved-not-merged');
    }

    if (!this.githubMergeService) {
      logger.warn(`GitHubMergeService not available, cannot merge PR #${drift.prNumber}`);
      return 'skipped-service-unavailable';
    }

    logger.info(`Attempting to merge approved PR #${drift.prNumber}`, {
      featureId: drift.featureId,
      projectPath: drift.projectPath,
    });

    // Check for unresolved threads first via PRFeedbackService
    if (this.prFeedbackService && drift.featureId) {
      try {
        await this.prFeedbackService.processThreadFeedback(
          drift.projectPath,
          drift.featureId,
          drift.prNumber
        );
        logger.info(`Processed unresolved threads for PR #${drift.prNumber} before merge`);
      } catch (err) {
        logger.warn(
          `Failed to process threads for PR #${drift.prNumber}, proceeding with merge:`,
          err
        );
      }
    }

    const mergeResult = await this.githubMergeService.mergePR(
      drift.projectPath,
      drift.prNumber,
      'squash',
      true
    );

    if (mergeResult.success) {
      logger.info(`Successfully merged PR #${drift.prNumber}`, {
        mergeCommitSha: mergeResult.mergeCommitSha,
        autoMergeEnabled: mergeResult.autoMergeEnabled,
      });
      return mergeResult.autoMergeEnabled ? 'auto-merge-enabled' : 'merged';
    }

    logger.warn(`Failed to merge PR #${drift.prNumber}: ${mergeResult.error}`, {
      checksPending: mergeResult.checksPending,
      checksFailed: mergeResult.checksFailed,
    });

    if (mergeResult.checksPending) {
      return 'merge-blocked-checks-pending';
    }

    if (mergeResult.checksFailed) {
      return `merge-blocked-checks-failed`;
    }

    return `merge-failed: ${mergeResult.error ?? 'unknown'}`;
  }

  /**
   * PR has no activity for > 7 days
   */
  private async reconcilePRStale(drift: Drift): Promise<string> {
    if (!drift.prNumber) {
      throw new Error('prNumber required for pr-stale');
    }

    const staleForMs = typeof drift.details.staleForMs === 'number' ? drift.details.staleForMs : 0;
    const HOURS_48_MS = 48 * 60 * 60 * 1000;
    const isVeryStale = staleForMs >= HOURS_48_MS;

    logger.info(
      `PR #${drift.prNumber} is stale (staleForMs=${staleForMs}, isVeryStale=${isVeryStale})`,
      {
        featureId: drift.featureId,
        projectPath: drift.projectPath,
      }
    );

    // Add a comment to the PR requesting review
    try {
      const staleHours = Math.floor(staleForMs / (60 * 60 * 1000));
      const staleDuration = staleHours > 0 ? `${staleHours} hours` : 'some time';
      const commentBody = `This PR has had no activity for ${staleDuration}. Please review or provide an update on the status.`;

      await execAsync(`gh pr comment ${drift.prNumber} --body ${JSON.stringify(commentBody)}`, {
        cwd: drift.projectPath,
      });

      logger.info(`Added stale comment to PR #${drift.prNumber}`);
    } catch (err) {
      logger.warn(`Failed to add comment to PR #${drift.prNumber}:`, err);
    }

    // Escalate to HITL if stale > 48h
    if (isVeryStale && this.hitlFormService && drift.featureId) {
      const feature = await this.featureLoader.get(drift.projectPath, drift.featureId);
      const existingForm = this.hitlFormService.getByFeatureId(drift.featureId, drift.projectPath);

      if (!existingForm) {
        try {
          const form = await this.hitlFormService.create({
            title: `Stale PR needs attention: #${drift.prNumber}`,
            description: `PR #${drift.prNumber} has been stale for more than 48 hours. Human review or action is required.`,
            steps: [
              {
                title: 'How would you like to proceed?',
                schema: {
                  type: 'object',
                  properties: {
                    action: {
                      type: 'string',
                      title: 'Action',
                      oneOf: [
                        {
                          const: 'nudge_reviewer',
                          title: 'Nudge reviewer',
                          description: 'Ping the reviewer to take action',
                        },
                        {
                          const: 'close_pr',
                          title: 'Close PR',
                          description: 'Close this PR as abandoned',
                        },
                        {
                          const: 'merge',
                          title: 'Merge anyway',
                          description: 'Merge the PR without waiting for review',
                        },
                      ],
                    },
                  },
                  required: ['action'],
                },
              },
            ],
            callerType: 'api',
            featureId: drift.featureId,
            projectPath: drift.projectPath,
          });

          if (form) {
            logger.info(`Created HITL form ${form.id} for stale PR #${drift.prNumber}`);
          }
        } catch (err) {
          logger.error(`Failed to create HITL form for stale PR #${drift.prNumber}:`, err);
        }
      } else {
        logger.info(
          `HITL form ${existingForm.id} already pending for stale PR ${drift.prNumber}, skipping`
        );
      }

      return 'stale-pr-pinged-hitl-escalated';
    }

    return 'stale-pr-pinged';
  }

  /**
   * Branch is merged to main but feature not marked 'done'
   */
  private async reconcileBranchMergedStatusStale(drift: Drift): Promise<string> {
    if (!drift.featureId) {
      throw new Error('featureId required for branch-merged-status-stale');
    }

    logger.info(`Moving feature ${drift.featureId} to 'done' - branch merged`);

    await this.featureLoader.update(drift.projectPath, drift.featureId, {
      status: 'done',
    });

    return 'feature-marked-done';
  }

  /**
   * Called on server startup to recover features that were in-flight when the server crashed.
   * Reads .automaker/execution-state.json and resets any running features to backlog.
   * This ensures features don't get stuck in-progress after a crash/restart.
   */
  async reconcileStartupState(projectPath: string): Promise<void> {
    const statePath = getExecutionStatePath(projectPath);

    let state: ExecutionState;
    try {
      const content = (await secureFs.readFile(statePath, 'utf-8')) as string;
      state = JSON.parse(content) as ExecutionState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // No execution state file — no crash recovery needed
        return;
      }
      logger.error(`Failed to read execution state for ${projectPath}:`, error);
      return;
    }

    if (!state.runningFeatureIds || state.runningFeatureIds.length === 0) {
      logger.info(`No in-flight features to recover for ${projectPath}`);
      return;
    }

    logger.info(
      `Recovering ${state.runningFeatureIds.length} in-flight feature(s) for ${projectPath}: ` +
        `[${state.runningFeatureIds.join(', ')}]`
    );

    const IN_FLIGHT_STATUSES = new Set(['in_progress', 'running', 'interrupted', 'starting']);

    for (const featureId of state.runningFeatureIds) {
      try {
        const feature = await this.featureLoader.get(projectPath, featureId);
        if (!feature) {
          logger.warn(`Feature ${featureId} not found during startup recovery, skipping`);
          continue;
        }

        // Only reset features that were actually in-flight (not already in a terminal state)
        if (!IN_FLIGHT_STATUSES.has(feature.status ?? '')) {
          logger.info(`Skipping recovery for ${featureId} — already in status "${feature.status}"`);
          continue;
        }

        logger.info(
          `Resetting in-flight feature ${featureId} to backlog (was "${feature.status}")`
        );
        // feature:status-changed is auto-emitted by featureLoader.update()
        await this.featureLoader.update(projectPath, featureId, { status: 'backlog' });
      } catch (error) {
        logger.error(`Failed to recover feature ${featureId} during startup:`, error);
      }
    }
  }

  /**
   * Blocked feature with transient error - auto-retry after cooldown
   */
  private async reconcileBlockedTransientRetry(drift: Drift): Promise<string> {
    if (!drift.featureId) {
      throw new Error('featureId required for blocked-transient-retry');
    }

    const feature = await this.featureLoader.get(drift.projectPath, drift.featureId);
    if (!feature) {
      return 'feature-not-found';
    }

    // Get retry count (default 0)
    const currentRetryCount = feature.retryCount || 0;

    // Check if we've exceeded max retries (3)
    const MAX_RETRIES = 3;
    if (currentRetryCount >= MAX_RETRIES) {
      logger.warn(
        `Feature ${drift.featureId} has reached max retries (${MAX_RETRIES}), keeping as blocked`
      );

      // Emit permanently-blocked event for issue creation pipeline
      this.events.emit('feature:permanently-blocked', {
        projectPath: drift.projectPath,
        featureId: drift.featureId,
        retryCount: currentRetryCount,
        lastError: feature.error,
        failureCategory: drift.details.failureCategory,
      });

      return 'max-retries-exceeded';
    }

    // Increment retry count
    const newRetryCount = currentRetryCount + 1;

    // Check if we need to escalate to opus after 2nd failure
    const shouldEscalateToOpus = newRetryCount >= 2;

    logger.info(
      `Auto-retrying feature ${drift.featureId} (attempt ${newRetryCount}/${MAX_RETRIES})${shouldEscalateToOpus ? ' with opus escalation' : ''}`
    );

    // Update feature: reset to backlog, increment retry count, escalate complexity if needed
    const updates: Record<string, unknown> = {
      status: 'backlog',
      retryCount: newRetryCount,
      // Clear error so it doesn't look permanently failed
      error: undefined,
    };

    // Auto-escalate to opus after 2nd failure by setting complexity to architectural
    if (shouldEscalateToOpus && feature.complexity !== 'architectural') {
      updates.complexity = 'architectural';
      logger.info(`Escalating feature ${drift.featureId} to opus model (architectural complexity)`);
    }

    await this.featureLoader.update(drift.projectPath, drift.featureId, updates);

    // Emit event for UI notification
    this.events.emit('feature:retry', {
      projectPath: drift.projectPath,
      featureId: drift.featureId,
      retryCount: newRetryCount,
      escalatedToOpus: shouldEscalateToOpus,
      timestamp: Date.now(),
    });

    return shouldEscalateToOpus
      ? `auto-retry-scheduled-with-escalation-${newRetryCount}`
      : `auto-retry-scheduled-${newRetryCount}`;
  }
}
