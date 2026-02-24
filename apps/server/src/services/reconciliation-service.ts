/**
 * Reconciliation Service - Corrects detected world state drifts
 *
 * Takes Drift objects from WorldStateMonitor and executes appropriate
 * corrective actions to bring actual state in line with desired state.
 */

import { createLogger } from '@protolabs-ai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';

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
    private autoModeService: AutoModeService
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
    // TODO: Escalate to higher complexity model or mark as needing intervention
    logger.warn('Feature stuck - needs intervention', drift);
    return 'escalated-for-intervention';
  }

  /**
   * Worktree exists but feature is done or branch is gone
   */
  private async reconcileOrphanedWorktree(drift: Drift): Promise<string> {
    // TODO: Delete orphaned worktree
    logger.info('TODO: Delete orphaned worktree', drift);
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
    // TODO: Notify EM agent to create intervention task
    logger.warn('PR has CI failures - notifying EM', drift);

    this.events.emit('pr:ci-failure', {
      projectPath: drift.projectPath,
      featureId: drift.featureId,
      prNumber: drift.prNumber,
      failedChecks: drift.details.failedChecks,
    });

    return 'em-notified';
  }

  /**
   * PR has requested changes (feedback)
   */
  private async reconcilePRHasFeedback(drift: Drift): Promise<string> {
    // TODO: Trigger EM agent to address feedback
    logger.info('PR has feedback - triggering EM', drift);

    this.events.emit('pr:changes-requested', {
      projectPath: drift.projectPath,
      featureId: drift.featureId,
      prNumber: drift.prNumber,
      feedback: drift.details.reviews,
    });

    return 'em-triggered';
  }

  /**
   * PR is approved but not merged yet
   */
  private async reconcilePRApprovedNotMerged(drift: Drift): Promise<string> {
    // TODO: Auto-merge if configured, otherwise notify
    logger.info('PR approved but not merged', drift);
    return 'auto-merge-pending';
  }

  /**
   * PR has no activity for > 7 days
   */
  private async reconcilePRStale(drift: Drift): Promise<string> {
    // TODO: Ping author or close if abandoned
    logger.info('PR is stale', drift);
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
