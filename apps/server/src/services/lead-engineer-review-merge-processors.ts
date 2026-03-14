/**
 * Lead Engineer — Review and Merge State Processors
 *
 * ReviewProcessor: Queries PR status, handles changes-requested, waits for approval.
 * MergeProcessor:  Merges approved PR via gh CLI, updates board, emits merge event.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import type { EventType, PRMergeStrategy } from '@protolabsai/types';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
} from './lead-engineer-types.js';
import {
  MERGE_RETRY_DELAY_MS,
  REVIEW_POLL_DELAY_MS,
  REVIEW_PENDING_TIMEOUT_MS,
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

  /**
   * Tracks when each feature first entered REVIEW state (epoch ms).
   * Used to enforce REVIEW_PENDING_TIMEOUT_MS — features cannot stay in REVIEW
   * indefinitely waiting for CI that may never trigger (e.g., workflows misconfigured).
   */
  private readonly reviewStartedAt = new Map<string, number>();

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[REVIEW] PR review started for feature: ${ctx.feature.id}`, {
      prNumber: ctx.prNumber,
    });
    // Stamp entry time only once — prevent reset if REVIEW re-enters due to re-checks
    if (!this.reviewStartedAt.has(ctx.feature.id)) {
      this.reviewStartedAt.set(ctx.feature.id, Date.now());
    }
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    // Reload feature to get latest prNumber
    const fresh = await this.serviceContext.featureLoader.get(ctx.projectPath, ctx.feature.id);
    if (fresh) {
      ctx.feature = fresh;
      if (fresh.prNumber) ctx.prNumber = fresh.prNumber;
    }

    // Early exit: feature is already done (PR merged externally or by another path)
    if (ctx.feature.status === 'done') {
      logger.info('[REVIEW] Feature already done, skipping REVIEW processing', {
        featureId: ctx.feature.id,
      });
      return {
        nextState: null,
        shouldContinue: false,
        reason: 'Feature already done',
      };
    }

    // Check if the feature branch has a merged PR (external merge detection)
    if (ctx.feature.branchName) {
      const externallyMerged = await this.checkBranchMerged(ctx);
      if (externallyMerged) {
        logger.info('[REVIEW] Externally merged PR detected for branch, transitioning to DONE', {
          featureId: ctx.feature.id,
          branchName: ctx.feature.branchName,
        });
        await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
          status: 'done',
        });
        this.serviceContext.events.emit('feature:pr-merged' as EventType, {
          featureId: ctx.feature.id,
          prNumber: ctx.prNumber,
          projectPath: ctx.projectPath,
        });
        return {
          nextState: null,
          shouldContinue: false,
          reason: 'PR merged externally via branch detection',
        };
      }
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

    // Status is 'pending' or 'commented' — enforce timeout before waiting
    const reviewStartMs = this.reviewStartedAt.get(ctx.feature.id) ?? Date.now();
    const reviewElapsedMs = Date.now() - reviewStartMs;

    if (reviewElapsedMs > REVIEW_PENDING_TIMEOUT_MS) {
      const elapsedMin = Math.round(reviewElapsedMs / 60000);
      const limitMin = Math.round(REVIEW_PENDING_TIMEOUT_MS / 60000);
      ctx.escalationReason =
        `PR #${ctx.prNumber} has been pending CI/review for ${elapsedMin} minute(s) ` +
        `(configured timeout: ${limitMin} min). Possible causes: ` +
        `(1) CI workflow triggers do not include the PR base branch — check .github/workflows/ ` +
        `and ensure the 'branches:' list includes your configured prBaseBranch; ` +
        `(2) CodeRabbit was rate-limited — check the PR for a CodeRabbit FAILURE commit status; ` +
        `(3) Required reviewers have not been assigned. ` +
        `Adjust the timeout via the REVIEW_PENDING_TIMEOUT_MINUTES environment variable.`;
      this.reviewStartedAt.delete(ctx.feature.id);
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    logger.info(`[REVIEW] PR pending review, waiting ${REVIEW_POLL_DELAY_MS / 1000}s`, {
      prNumber: ctx.prNumber,
      elapsedMinutes: Math.round(reviewElapsedMs / 60000),
      timeoutMinutes: Math.round(REVIEW_PENDING_TIMEOUT_MS / 60000),
    });
    await new Promise((r) => setTimeout(r, REVIEW_POLL_DELAY_MS));

    return {
      nextState: 'REVIEW',
      shouldContinue: true,
      reason: 'PR pending, re-checking',
    };
  }

  async exit(ctx: StateContext): Promise<void> {
    logger.info('[REVIEW] Review phase completed');
    // Clean up review start timestamp when leaving REVIEW state
    this.reviewStartedAt.delete(ctx.feature.id);
  }

  private async getPRReviewState(ctx: StateContext): Promise<string> {
    const trackedPR = this.getTrackedPR(ctx);
    if (trackedPR?.reviewState) return trackedPR.reviewState;

    // Fallback: query gh CLI when PRFeedbackService hasn't tracked the PR yet
    if (!ctx.prNumber) return 'pending';

    try {
      const { stdout } = await execAsync(
        `gh pr view ${ctx.prNumber} --json reviewDecision,statusCheckRollup,reviews --jq '{decision: .reviewDecision, checks: [(.statusCheckRollup // [])[] | {name: .context, conclusion: .conclusion}], approvedCount: ([(.reviews // [])[] | select(.state == "APPROVED")] | length)}'`,
        { cwd: ctx.projectPath, timeout: 15000 }
      );

      const data = JSON.parse(stdout.trim());

      if (data.decision === 'APPROVED') return 'approved';
      if (data.decision === 'CHANGES_REQUESTED') return 'changes_requested';

      // Separate CodeRabbit checks from real CI checks.
      // CodeRabbit rate-limit sets commit status to FAILURE, but this is transient
      // and should not block the approval flow.
      const checks = (data.checks || []) as Array<{ name: string; conclusion: string }>;
      const codeRabbitChecks = checks.filter(
        (c) =>
          c.name?.toLowerCase().includes('coderabbit') ||
          c.name?.toLowerCase().includes('code-rabbit')
      );
      const ciChecks = checks.filter(
        (c) =>
          !c.name?.toLowerCase().includes('coderabbit') &&
          !c.name?.toLowerCase().includes('code-rabbit')
      );

      // Log transient CodeRabbit failures so operators can diagnose
      const codeRabbitFailures = codeRabbitChecks.filter(
        (c) => c.conclusion && c.conclusion !== 'SUCCESS'
      );
      if (codeRabbitFailures.length > 0) {
        logger.info(
          `[REVIEW] CodeRabbit check(s) not passing (likely rate-limited), treating as transient`,
          {
            prNumber: ctx.prNumber,
            codeRabbitChecks: codeRabbitFailures.map((c) => `${c.name}=${c.conclusion}`),
          }
        );
      }

      // Require at least one human APPROVED review — CI passing alone is not sufficient.
      // Only real CI checks (non-CodeRabbit) block approval.
      const approvedCount = (data.approvedCount as number) ?? 0;
      if (
        approvedCount > 0 &&
        (ciChecks.length === 0 || ciChecks.every((c) => c.conclusion === 'SUCCESS'))
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

  /**
   * Check if the feature's branch has a merged PR on GitHub.
   * This catches PRs merged externally (via gh pr merge, auto-merge, or GitHub UI).
   */
  private async checkBranchMerged(ctx: StateContext): Promise<boolean> {
    const branchName = ctx.feature.branchName;
    if (!branchName) return false;

    // Sanitize branch name to prevent shell injection
    if (!/^[a-zA-Z0-9._\-/]+$/.test(branchName)) {
      logger.warn(
        '[REVIEW] Branch name contains unsafe characters, skipping external merge check',
        {
          featureId: ctx.feature.id,
        }
      );
      return false;
    }

    try {
      const { stdout } = await execAsync(
        `gh pr list --head "${branchName}" --state merged --json number,mergedAt --jq '.[0].mergedAt // ""'`,
        { cwd: ctx.projectPath, timeout: 15000 }
      );
      const result = stdout.trim();
      if (result !== '' && result !== 'null') {
        // Also store the PR number if we don't have one yet
        if (!ctx.prNumber) {
          try {
            const { stdout: prNumOut } = await execAsync(
              `gh pr list --head "${branchName}" --state merged --json number --jq '.[0].number // 0'`,
              { cwd: ctx.projectPath, timeout: 15000 }
            );
            const prNum = parseInt(prNumOut.trim(), 10);
            if (prNum > 0) ctx.prNumber = prNum;
          } catch {
            // Non-critical: we already know it's merged
          }
        }
        return true;
      }
      return false;
    } catch (err) {
      logger.warn('[REVIEW] External merge check via branch name failed:', err);
      return false;
    }
  }
}

// ────────────────────────── MergeProcessor ──────────────────────────

/**
 * MERGE State: Auto-merge via gh CLI. Update board.
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

    // Resolve merge strategy: promotion PRs always use --merge
    const mergeFlag = await this.resolveMergeFlag(ctx);

    logger.info(
      `[MERGE] Attempting to merge PR #${ctx.prNumber} with ${mergeFlag} (attempt ${ctx.mergeRetryCount + 1}/${MAX_MERGE_RETRIES})`
    );

    try {
      await execAsync(`gh pr merge ${ctx.prNumber} ${mergeFlag}`, {
        cwd: ctx.projectPath,
        timeout: 60000,
      });

      // Verify merge actually completed
      const { stdout: mergeCheck } = await execAsync(
        `gh pr view ${ctx.prNumber} --json mergedAt --jq '.mergedAt // ""'`,
        { cwd: ctx.projectPath, timeout: 15000 }
      );

      const mergeCheckResult = mergeCheck.trim();
      if (mergeCheckResult === '' || mergeCheckResult === 'null') {
        ctx.mergeRetryCount++;
        logger.warn(`[MERGE] PR #${ctx.prNumber} merge command succeeded but PR not yet merged`);
        await new Promise((r) => setTimeout(r, MERGE_RETRY_DELAY_MS));
        return {
          nextState: 'MERGE',
          shouldContinue: true,
          reason: 'Merge queued but not yet completed, retrying',
        };
      }

      // Update feature status with merge timestamps
      const now = new Date().toISOString();
      const prReviewDurationMs =
        ctx.feature.prCreatedAt != null
          ? Date.now() - new Date(ctx.feature.prCreatedAt).getTime()
          : undefined;

      await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
        status: 'done',
        prMergedAt: now,
        completedAt: now,
        ...(prReviewDurationMs !== undefined ? { prReviewDurationMs } : {}),
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

  /**
   * Resolve the gh CLI merge flag based on workflow settings and PR base branch.
   * Promotion PRs (base is staging or main) always use --merge regardless of setting.
   */
  private async resolveMergeFlag(ctx: StateContext): Promise<string> {
    // Check if this is a promotion PR — those must always use --merge
    if (ctx.prNumber) {
      try {
        const { stdout } = await execAsync(
          `gh pr view ${ctx.prNumber} --json baseRefName --jq '.baseRefName'`,
          { cwd: ctx.projectPath, timeout: 15000 }
        );
        const baseBranch = stdout.trim();
        if (baseBranch === 'staging' || baseBranch === 'main') {
          logger.info(
            `[MERGE] PR #${ctx.prNumber} targets ${baseBranch} — forcing --merge strategy`
          );
          return '--merge';
        }
      } catch (err) {
        logger.warn(
          '[MERGE] Failed to detect PR base branch, falling back to configured strategy:',
          err
        );
      }
    }

    // Read prMergeStrategy from global settings
    let strategy: PRMergeStrategy = 'squash';
    if (this.serviceContext.settingsService) {
      try {
        const globalSettings = await this.serviceContext.settingsService.getGlobalSettings();
        strategy = globalSettings.gitWorkflow?.prMergeStrategy ?? 'squash';
      } catch (err) {
        logger.warn(
          '[MERGE] Failed to read global settings for merge strategy, defaulting to squash:',
          err
        );
      }
    }

    const flagMap: Record<PRMergeStrategy, string> = {
      squash: '--squash',
      merge: '--merge',
      rebase: '--rebase',
    };
    return flagMap[strategy] ?? '--squash';
  }
}
