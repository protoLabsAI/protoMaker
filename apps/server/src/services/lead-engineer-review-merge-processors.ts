/**
 * Lead Engineer — Review and Merge State Processors
 *
 * ReviewProcessor: Queries PR status, handles changes-requested, waits for approval.
 * MergeProcessor:  Merges approved PR via gh CLI, updates board, emits merge event.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabs-ai/utils';
import type { EventType } from '@protolabs-ai/types';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
} from './lead-engineer-types.js';
import {
  MERGE_RETRY_DELAY_MS,
  REVIEW_POLL_DELAY_MS,
  MAX_TOTAL_REMEDIATION_CYCLES,
  MAX_PR_ITERATIONS,
} from './lead-engineer-types.js';

const execAsync = promisify(exec);
const logger = createLogger('LeadEngineerService');

/**
 * Validate and sanitize a PR number to prevent shell injection.
 * Returns the validated integer or throws if invalid.
 */
function sanitizePrNumber(prNumber: unknown): number {
  const parsed = parseInt(String(prNumber), 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid PR number: ${String(prNumber)}`);
  }
  return parsed;
}

// ────────────────────────── ReviewProcessor ──────────────────────────

/**
 * REVIEW State: PR created. CI runs. If fails → back to EXECUTE (bounded). If passes → MERGE.
 *
 * Queries PRFeedbackService for tracked PR state. Falls back to gh CLI if needed.
 */
export class ReviewProcessor implements StateProcessor {
  constructor(private serviceContext: ProcessorServiceContext) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[REVIEW] PR review started for feature: ${ctx.feature.id}`, {
      prNumber: ctx.prNumber,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    // Reload feature to get latest prNumber
    const fresh = await this.serviceContext.featureLoader.get(ctx.projectPath, ctx.feature.id);
    if (fresh) {
      ctx.feature = fresh;
      if (fresh.prNumber) ctx.prNumber = fresh.prNumber;
    }

    // No PR means something is wrong
    if (!ctx.prNumber) {
      ctx.escalationReason = 'No PR number found after execution';
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    // Validate PR number before any shell interpolation
    try {
      ctx.prNumber = sanitizePrNumber(ctx.prNumber);
    } catch {
      ctx.escalationReason = `Invalid PR number: ${ctx.prNumber}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    // Query PRFeedbackService for tracked PR state (falls back to gh CLI)
    const reviewState = await this.getPRReviewState(ctx);

    logger.info('[REVIEW] PR status check', {
      featureId: ctx.feature.id,
      prNumber: ctx.prNumber,
      reviewState,
      remediationAttempts: ctx.remediationAttempts,
    });

    if (reviewState === 'approved') {
      // Save REVIEW handoff before transitioning to MERGE
      if (this.serviceContext.leadHandoffService) {
        await this.serviceContext.leadHandoffService.saveHandoff(ctx.projectPath, ctx.feature.id, {
          phase: 'REVIEW',
          summary: `PR #${ctx.prNumber} approved and CI passing. Ready to merge.`,
          discoveries: [],
          modifiedFiles: [],
          outstandingQuestions: [],
          scopeLimits: [],
          testCoverage: 'CI passed',
          verdict: 'APPROVE',
          createdAt: new Date().toISOString(),
        });
      }
      return {
        nextState: 'MERGE',
        shouldContinue: true,
        reason: 'PR approved, CI passing',
      };
    }

    if (reviewState === 'changes_requested') {
      // Concurrency guard: if PRFeedbackService is already remediating this feature,
      // defer to it — wait and re-check instead of launching a competing agent.
      if (this.serviceContext.prFeedbackService?.isFeatureRemediating(ctx.feature.id)) {
        logger.info('[REVIEW] PRFeedbackService is already remediating this feature, deferring', {
          featureId: ctx.feature.id,
        });
        await new Promise((r) => setTimeout(r, REVIEW_POLL_DELAY_MS));
        return {
          nextState: 'REVIEW',
          shouldContinue: true,
          reason: 'Deferring to PRFeedbackService remediation',
        };
      }

      // Check remediation budget
      if (ctx.remediationAttempts >= MAX_TOTAL_REMEDIATION_CYCLES) {
        ctx.escalationReason = `Max remediation cycles exceeded (${MAX_TOTAL_REMEDIATION_CYCLES})`;
        return {
          nextState: 'ESCALATE',
          shouldContinue: true,
          reason: ctx.escalationReason,
        };
      }

      // Check iteration budget (use >= for consistent boundary semantics)
      const trackedPR = this.getTrackedPR(ctx);
      if (trackedPR && trackedPR.iterationCount >= MAX_PR_ITERATIONS) {
        ctx.escalationReason = `Max PR iterations exceeded (${MAX_PR_ITERATIONS})`;
        return {
          nextState: 'ESCALATE',
          shouldContinue: true,
          reason: ctx.escalationReason,
        };
      }

      // Fetch review comments so the agent knows what to fix
      try {
        const { stdout } = await execAsync(
          `gh pr view ${ctx.prNumber} --json reviews --jq '[.reviews[] | select(.state == "CHANGES_REQUESTED") | .body] | join("\\n---\\n")'`,
          { cwd: ctx.projectPath, timeout: 15000 }
        );
        const feedback = stdout.trim();
        if (feedback) {
          ctx.reviewFeedback = feedback;
          logger.info(`[REVIEW] Captured review feedback (${feedback.length} chars)`);
        }
      } catch (err) {
        logger.warn('[REVIEW] Failed to fetch review comments:', err);
      }

      ctx.remediationAttempts++;
      return {
        nextState: 'EXECUTE',
        shouldContinue: true,
        reason: 'Changes requested, remediating',
        context: { remediation: true },
      };
    }

    // CLI/API error — escalate instead of polling forever
    if (reviewState === 'error') {
      ctx.escalationReason = `Unable to determine PR review state for PR #${ctx.prNumber}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    // Status is 'pending' or 'commented' — wait and re-check
    logger.info(`[REVIEW] PR pending review, waiting ${REVIEW_POLL_DELAY_MS / 1000}s`, {
      prNumber: ctx.prNumber,
    });
    await new Promise((r) => setTimeout(r, REVIEW_POLL_DELAY_MS));

    return {
      nextState: 'REVIEW',
      shouldContinue: true,
      reason: 'PR pending, re-checking',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[REVIEW] Review phase completed');
  }

  private async getPRReviewState(ctx: StateContext): Promise<string> {
    const trackedPR = this.getTrackedPR(ctx);
    if (trackedPR?.reviewState) return trackedPR.reviewState;

    // Fallback: query gh CLI when PRFeedbackService hasn't tracked the PR yet
    if (!ctx.prNumber) return 'pending';

    try {
      const { stdout } = await execAsync(
        `gh pr view ${ctx.prNumber} --json reviewDecision,statusCheckRollup,reviews --jq '{decision: .reviewDecision, checks: [(.statusCheckRollup // [])[] | .conclusion], approvedCount: ([(.reviews // [])[] | select(.state == "APPROVED")] | length)}'`,
        { cwd: ctx.projectPath, timeout: 15000 }
      );

      const data = JSON.parse(stdout.trim());

      if (data.decision === 'APPROVED') return 'approved';
      if (data.decision === 'CHANGES_REQUESTED') return 'changes_requested';

      // Require at least one human APPROVED review — CI passing alone is not sufficient
      const checks = (data.checks || []) as string[];
      const approvedCount = (data.approvedCount as number) ?? 0;
      if (
        approvedCount > 0 &&
        (checks.length === 0 || checks.every((c: string) => c === 'SUCCESS'))
      ) {
        return 'approved';
      }

      return 'pending';
    } catch (err) {
      logger.error(`[REVIEW] gh CLI fallback failed for PR #${ctx.prNumber}:`, err);
      return 'error';
    }
  }

  private getTrackedPR(ctx: StateContext) {
    if (!this.serviceContext.prFeedbackService) return undefined;
    const prs = this.serviceContext.prFeedbackService.getTrackedPRs();
    return prs.find((pr) => pr.featureId === ctx.feature.id || pr.prNumber === ctx.prNumber);
  }
}

// ────────────────────────── MergeProcessor ──────────────────────────

/**
 * MERGE State: Auto-merge via gh CLI. Update board. GH→Linear sync.
 */
export class MergeProcessor implements StateProcessor {
  constructor(private serviceContext: ProcessorServiceContext) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[MERGE] Starting merge for feature: ${ctx.feature.id}`, {
      prNumber: ctx.prNumber,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    const MAX_MERGE_RETRIES = 5;

    if (!ctx.prNumber) {
      ctx.escalationReason = 'No PR number available for merge';
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    // Validate PR number before any shell interpolation
    try {
      ctx.prNumber = sanitizePrNumber(ctx.prNumber);
    } catch {
      ctx.escalationReason = `Invalid PR number: ${ctx.prNumber}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    if (ctx.mergeRetryCount >= MAX_MERGE_RETRIES) {
      ctx.escalationReason = `Merge failed after ${MAX_MERGE_RETRIES} retries for PR #${ctx.prNumber}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    logger.info(
      `[MERGE] Attempting to merge PR #${ctx.prNumber} (attempt ${ctx.mergeRetryCount + 1}/${MAX_MERGE_RETRIES})`
    );

    try {
      // Use --squash without --auto: we're in MERGE state after REVIEW approved,
      // so checks should have passed. This ensures merge completes immediately.
      await execAsync(`gh pr merge ${ctx.prNumber} --squash`, {
        cwd: ctx.projectPath,
        timeout: 60000,
      });

      // Verify merge actually completed
      const { stdout: mergeCheck } = await execAsync(
        `gh pr view ${ctx.prNumber} --json merged --jq '.merged'`,
        { cwd: ctx.projectPath, timeout: 15000 }
      );

      if (mergeCheck.trim() !== 'true') {
        ctx.mergeRetryCount++;
        logger.warn(`[MERGE] PR #${ctx.prNumber} merge command succeeded but PR not yet merged`);
        await new Promise((r) => setTimeout(r, MERGE_RETRY_DELAY_MS));
        return {
          nextState: 'MERGE',
          shouldContinue: true,
          reason: 'Merge queued but not yet completed, retrying',
        };
      }

      // Update feature status
      await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
        status: 'done',
      });

      // Emit merge event
      this.serviceContext.events.emit('feature:pr-merged' as EventType, {
        featureId: ctx.feature.id,
        prNumber: ctx.prNumber,
        projectPath: ctx.projectPath,
      });

      logger.info(`[MERGE] PR #${ctx.prNumber} merged successfully`);

      return {
        nextState: 'DEPLOY',
        shouldContinue: true,
        reason: 'PR merged successfully',
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // If checks are still pending, wait and retry
      if (errMsg.includes('check') || errMsg.includes('pending') || errMsg.includes('required')) {
        ctx.mergeRetryCount++;
        logger.info(
          `[MERGE] Checks pending on PR #${ctx.prNumber}, waiting ${MERGE_RETRY_DELAY_MS / 1000}s`
        );
        await new Promise((r) => setTimeout(r, MERGE_RETRY_DELAY_MS));
        return {
          nextState: 'MERGE',
          shouldContinue: true,
          reason: 'Checks pending, retrying merge',
        };
      }

      ctx.escalationReason = `Merge failed: ${errMsg}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[MERGE] Merge completed');
  }
}
