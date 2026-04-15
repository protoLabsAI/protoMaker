/**
 * Lead Engineer — Review and Merge State Processors
 *
 * ReviewProcessor: Queries PR status, handles changes-requested, waits for approval.
 * MergeProcessor:  Merges approved PR via gh CLI, updates board, emits merge event.
 */

import { exec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import type { EventType, PRMergeStrategy } from '@protolabsai/types';
import {
  buildFreshEyesReviewPrompt,
  parseFreshEyesVerdict,
  FRESH_EYES_REVIEW_SYSTEM_PROMPT,
} from '@protolabsai/prompts';
import { resolveModelString } from '@protolabsai/model-resolver';
import { resolveMergeStrategy } from '../lib/merge-strategy.js';
import {
  parsePROwnershipWatermark,
  buildPROwnershipWatermark,
} from '../routes/github/utils/pr-ownership.js';
import { simpleQuery } from '../providers/simple-query-service.js';
import { getWorkflowSettings } from '../lib/settings-helpers.js';
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
  MAX_PR_ITERATIONS,
} from './lead-engineer-types.js';
import {
  RemediationBudgetEnforcer,
  DEFAULT_CI_REACTION_SETTINGS,
} from './remediation-budget-enforcer.js';

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

/**
 * Returns true if the file path is metadata-only (lock files, .automaker dir, markdown)
 * and therefore should NOT count as source-code for the lock-only PR gate.
 * Files explicitly listed in `filesToModify` are never considered metadata.
 */
function isMergeOnlyMetadata(filePath: string, filesToModify?: string[]): boolean {
  if (filesToModify?.includes(filePath)) return false;
  const basename = filePath.split('/').pop() ?? filePath;
  if (['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].includes(basename)) return true;
  if (basename === '.automaker-lock') return true;
  if (filePath.startsWith('.automaker/')) return true;
  if (basename === '.gitignore') return true;
  if (basename.endsWith('.md')) return true;
  return false;
}

// ────────────────────────── Scope Budget Enforcement ──────────────────────────

/** Returns true if the file is a test file by name or path convention. */
function isTestFile(filePath: string): boolean {
  return (
    /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(filePath) ||
    filePath.includes('/tests/') ||
    filePath.includes('/test/') ||
    filePath.includes('/__tests__/')
  );
}

/**
 * Returns true if filePath falls within the declared scope.
 * Handles both exact matches and directory prefix matches.
 */
function isWithinDeclaredScope(filePath: string, filesToModify: string[]): boolean {
  for (const declared of filesToModify) {
    if (filePath === declared) return true;
    if (filePath.startsWith(declared + '/')) return true;
  }
  return false;
}

/**
 * Returns true if filePath is a test file whose directory matches or is under
 * the directory of any declared file (adjacent test heuristic).
 */
function isAdjacentTestFile(filePath: string, filesToModify: string[]): boolean {
  if (!isTestFile(filePath)) return false;
  const fileDir = filePath.split('/').slice(0, -1).join('/');
  return filesToModify.some((declared) => {
    const declaredDir = declared.split('/').slice(0, -1).join('/');
    return fileDir === declaredDir || fileDir.startsWith(declaredDir + '/');
  });
}

export interface ScopeBudgetResult {
  withinBudget: boolean;
  outOfScopeFiles: string[];
  toleratedFiles: string[];
  outOfScopePercent: number;
  totalSourceFiles: number;
}

const SCOPE_TEST_FILE_TOLERANCE = 2;
const SCOPE_OUT_OF_BUDGET_PERCENT = 20;

/**
 * Analyzes whether a PR's changed files stay within the declared scope.
 *
 * Rules:
 * - Metadata files (lock files, .automaker, .md, etc.) are excluded from analysis.
 *   Files explicitly in filesToModify are never treated as metadata.
 * - Up to SCOPE_TEST_FILE_TOLERANCE test files adjacent to declared files are tolerated
 *   without counting against the budget.
 * - If out-of-scope non-tolerated files exceed SCOPE_OUT_OF_BUDGET_PERCENT of total
 *   source files, withinBudget is false.
 */
export function analyzeScopeBudget(
  changedFiles: string[],
  filesToModify: string[]
): ScopeBudgetResult {
  // Exclude metadata-only files (lock files, .automaker dir, .md) but preserve declared files.
  const sourceFiles = changedFiles.filter((f) => !isMergeOnlyMetadata(f, filesToModify));

  if (sourceFiles.length === 0 || filesToModify.length === 0) {
    return {
      withinBudget: true,
      outOfScopeFiles: [],
      toleratedFiles: [],
      outOfScopePercent: 0,
      totalSourceFiles: sourceFiles.length,
    };
  }

  const outOfScope: string[] = [];
  const tolerated: string[] = [];
  let toleranceUsed = 0;

  for (const file of sourceFiles) {
    if (isWithinDeclaredScope(file, filesToModify)) continue;

    // Adjacent test files are tolerated up to SCOPE_TEST_FILE_TOLERANCE
    if (toleranceUsed < SCOPE_TEST_FILE_TOLERANCE && isAdjacentTestFile(file, filesToModify)) {
      tolerated.push(file);
      toleranceUsed++;
    } else {
      outOfScope.push(file);
    }
  }

  const outOfScopePercent =
    sourceFiles.length > 0 ? (outOfScope.length / sourceFiles.length) * 100 : 0;

  return {
    withinBudget: outOfScopePercent <= SCOPE_OUT_OF_BUDGET_PERCENT,
    outOfScopeFiles: outOfScope,
    toleratedFiles: tolerated,
    outOfScopePercent,
    totalSourceFiles: sourceFiles.length,
  };
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
      // Restore from persisted feature data if available (survives server restart)
      const persisted = ctx.feature.reviewStartedAt
        ? new Date(ctx.feature.reviewStartedAt).getTime()
        : Date.now();
      this.reviewStartedAt.set(ctx.feature.id, persisted);
    }
    // Persist to feature JSON if not already set
    if (!ctx.feature.reviewStartedAt) {
      const now = new Date().toISOString();
      await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
        reviewStartedAt: now,
      });
      ctx.feature.reviewStartedAt = now;
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

    // Detect merge conflicts before normalizing or evaluating review state.
    // A CONFLICTING PR can never be auto-merged. Retrying fix_ci or update_branch
    // wastes budget and fires false-positive HITL alerts. Instead, close and re-queue.
    const mergeableState = await this.getMergeableState(ctx);
    if (mergeableState === 'CONFLICTING') {
      return this.handleConflictingPR(ctx);
    }

    // Normalize PR: patch ownership watermark and enable auto-merge if missing
    await this.normalizePR(ctx);

    // Query PRFeedbackService for tracked PR state (falls back to gh CLI)
    const reviewState = await this.getPRReviewState(ctx);

    logger.info('[REVIEW] PR status check', {
      featureId: ctx.feature.id,
      prNumber: ctx.prNumber,
      reviewState,
      remediationAttempts: ctx.remediationAttempts,
    });

    if (reviewState === 'approved') {
      // Check scope budget: warn if PR contains files outside declared filesToModify.
      // Non-blocking — warning only per deviation rule (auto-rollback risks losing legitimate changes).
      await this.checkScopeBudget(ctx);

      // Run fresh-eyes review if enabled in workflow settings
      const freshEyesResult = await this.runFreshEyesReview(ctx);
      if (freshEyesResult === 'blocked') {
        ctx.escalationReason = `Fresh-eyes review BLOCK: PR #${ctx.prNumber} blocked by automated review`;
        return {
          nextState: 'ESCALATE',
          shouldContinue: true,
          reason: ctx.escalationReason,
        };
      }

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

      // Check remediation budget using split budget enforcer
      const reviewWorkflowSettings = await getWorkflowSettings(
        ctx.projectPath,
        this.serviceContext.settingsService,
        '[ReviewProcessor]'
      );
      const reviewCiReactionSettings =
        reviewWorkflowSettings.ciReactionSettings ?? DEFAULT_CI_REACTION_SETTINGS;

      // Use persisted split counters from feature, falling back to in-memory remediationAttempts
      const persistedCiCount = (ctx.feature.ciRemediationCount as number | undefined) ?? 0;
      const persistedReviewCount =
        (ctx.feature.reviewRemediationCount as number | undefined) ?? ctx.remediationAttempts;
      const legacyCount = (ctx.feature.remediationCycleCount as number | undefined) ?? 0;

      const reviewEnforcer = new RemediationBudgetEnforcer(reviewCiReactionSettings);
      const reviewBudgetResult = reviewEnforcer.checkAndIncrement({
        type: 'review',
        ciRemediationCount: persistedCiCount,
        reviewRemediationCount: persistedReviewCount,
        remediationCycleCount: legacyCount,
        settings: reviewCiReactionSettings,
      });

      if (!reviewBudgetResult.allowed) {
        ctx.escalationReason = reviewBudgetResult.message;
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

    if (reviewState === 'ci_failed') {
      // Concurrency guard: defer if PRFeedbackService is already remediating this feature
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

      // Check CI remediation budget
      const ciWorkflowSettings = await getWorkflowSettings(
        ctx.projectPath,
        this.serviceContext.settingsService,
        '[ReviewProcessor]'
      );
      const ciReactionSettings =
        ciWorkflowSettings.ciReactionSettings ?? DEFAULT_CI_REACTION_SETTINGS;

      const persistedCiCount = (ctx.feature.ciRemediationCount as number | undefined) ?? 0;
      const persistedReviewCount =
        (ctx.feature.reviewRemediationCount as number | undefined) ?? ctx.remediationAttempts;
      const legacyCount = (ctx.feature.remediationCycleCount as number | undefined) ?? 0;

      const ciEnforcer = new RemediationBudgetEnforcer(ciReactionSettings);
      const ciBudgetResult = ciEnforcer.checkAndIncrement({
        type: 'ci',
        ciRemediationCount: persistedCiCount,
        reviewRemediationCount: persistedReviewCount,
        remediationCycleCount: legacyCount,
        settings: ciReactionSettings,
      });

      if (!ciBudgetResult.allowed) {
        ctx.escalationReason = ciBudgetResult.message;
        return {
          nextState: 'ESCALATE',
          shouldContinue: true,
          reason: ctx.escalationReason,
        };
      }

      // Check iteration budget
      const ciTrackedPR = this.getTrackedPR(ctx);
      if (ciTrackedPR && ciTrackedPR.iterationCount >= MAX_PR_ITERATIONS) {
        ctx.escalationReason = `Max PR iterations exceeded (${MAX_PR_ITERATIONS})`;
        return {
          nextState: 'ESCALATE',
          shouldContinue: true,
          reason: ctx.escalationReason,
        };
      }

      // Fetch failing CI check names for remediation context
      let ciFailureNames: string[] = [];
      try {
        const { stdout } = await execAsync(
          `gh pr view ${ctx.prNumber} --json statusCheckRollup --jq '[(.statusCheckRollup // [])[] | select(.conclusion == "FAILURE") | .context] | join(", ")'`,
          { cwd: ctx.projectPath, timeout: 15000 }
        );
        const names = stdout.trim();
        if (names) {
          ciFailureNames = names.split(', ').filter(Boolean);
          ctx.reviewFeedback = `CI checks failed: ${names}`;
          logger.info(`[REVIEW] CI check failures: ${names}`);
        }
      } catch (err) {
        logger.warn('[REVIEW] Failed to fetch CI check failure names:', err);
      }

      ctx.remediationAttempts++;
      return {
        nextState: 'EXECUTE',
        shouldContinue: true,
        reason: `CI checks failed${ciFailureNames.length > 0 ? ': ' + ciFailureNames.join(', ') : ''}, remediating`,
        context: { remediation: true, ciFailures: ciFailureNames },
      };
    }

    // CLI/API error — check if PR is already merged before escalating.
    // Merged PRs can return 'error' review state when the GitHub API returns
    // unclear status on closed PRs. The merged check in getPRReviewState handles
    // most cases, but this is a safety net for edge cases.
    if (reviewState === 'error') {
      const isMerged = await this.checkBranchMerged(ctx);
      if (isMerged) {
        logger.info(
          `[REVIEW] PR #${ctx.prNumber} review state errored but PR is merged — transitioning to MERGE`
        );
        return {
          nextState: 'MERGE',
          shouldContinue: true,
          reason: 'PR already merged (detected during error recovery)',
        };
      }
      ctx.escalationReason = `Unable to determine PR review state for PR #${ctx.prNumber}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    // Status is 'pending' or 'commented' — enforce timeout before waiting
    const reviewStartMs =
      this.reviewStartedAt.get(ctx.feature.id) ??
      (ctx.feature.reviewStartedAt ? new Date(ctx.feature.reviewStartedAt).getTime() : Date.now());
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

  /**
   * Run a fresh-eyes Haiku review after CI passes, before auto-merge.
   *
   * Returns:
   * - 'pass'    → no issues, proceed to merge
   * - 'concern' → comment posted, proceed to merge
   * - 'blocked' → comment posted, block merge (caller should escalate)
   * - 'skipped' → feature disabled or error, proceed to merge
   */
  private async runFreshEyesReview(
    ctx: StateContext
  ): Promise<'pass' | 'concern' | 'blocked' | 'skipped'> {
    // Check if fresh-eyes review is enabled
    const workflowSettings = await getWorkflowSettings(
      ctx.projectPath,
      this.serviceContext.settingsService,
      '[ReviewProcessor]'
    );
    const freshEyesConfig = workflowSettings.freshEyesReview;
    if (!freshEyesConfig?.enabled) {
      return 'skipped';
    }

    logger.info('[REVIEW] Running fresh-eyes review', {
      featureId: ctx.feature.id,
      prNumber: ctx.prNumber,
    });

    try {
      // Fetch PR diff via gh CLI
      let prDiff = '';
      try {
        const { stdout } = await execAsync(`gh pr diff ${ctx.prNumber}`, {
          cwd: ctx.projectPath,
          timeout: 30000,
        });
        prDiff = stdout;
      } catch (err) {
        logger.warn('[REVIEW] Fresh-eyes: failed to fetch PR diff, skipping review', err);
        return 'skipped';
      }

      // Build acceptance criteria from feature (stored as untyped extra fields in some feature formats)
      const feature = ctx.feature;
      const featureAny = feature as unknown as Record<string, unknown>;
      const acceptanceCriteria: string[] = [];
      const rawCriteria = featureAny['acceptanceCriteria'];
      if (Array.isArray(rawCriteria)) {
        for (const c of rawCriteria) {
          if (typeof c === 'string') acceptanceCriteria.push(c);
          else if (typeof c === 'object' && c !== null && 'description' in c) {
            acceptanceCriteria.push((c as { description: string }).description);
          }
        }
      }

      const model = resolveModelString(freshEyesConfig.model ?? 'haiku');
      const prompt = buildFreshEyesReviewPrompt({
        prDiff,
        featureTitle: feature.title || 'Untitled',
        featureDescription: feature.description || 'No description provided.',
        acceptanceCriteria,
      });

      const result = await simpleQuery({
        prompt,
        model,
        cwd: ctx.projectPath,
        systemPrompt: FRESH_EYES_REVIEW_SYSTEM_PROMPT,
        maxTurns: 1,
        allowedTools: [],
      });

      const reviewed = parseFreshEyesVerdict(result.text);

      logger.info('[REVIEW] Fresh-eyes verdict', {
        featureId: feature.id,
        prNumber: ctx.prNumber,
        verdict: reviewed.verdict,
        reasoning: reviewed.reasoning,
      });

      // Track estimated cost in feature.costUsd (Haiku single call estimate)
      const estimatedCostUsd = 0.001;
      try {
        const currentFeature = await this.serviceContext.featureLoader.get(
          ctx.projectPath,
          feature.id
        );
        const previousCost: number = currentFeature?.costUsd ?? 0;
        await this.serviceContext.featureLoader.update(ctx.projectPath, feature.id, {
          costUsd: previousCost + estimatedCostUsd,
        });
      } catch (costErr) {
        logger.warn('[REVIEW] Fresh-eyes: failed to update costUsd', costErr);
      }

      if (reviewed.verdict === 'PASS') {
        return 'pass';
      }

      // Post comment for CONCERN and BLOCK
      const commentBody =
        reviewed.verdict === 'BLOCK'
          ? `**Fresh-Eyes Review: BLOCK**\n\n${reviewed.reasoning}\n\nThis PR has been flagged by automated review and will not be auto-merged. Please address the issue above.`
          : `**Fresh-Eyes Review: CONCERN**\n\n${reviewed.reasoning}\n\nThis is a non-blocking concern. The PR will proceed to merge.`;

      try {
        await execAsync(`gh pr comment ${ctx.prNumber} --body ${JSON.stringify(commentBody)}`, {
          cwd: ctx.projectPath,
          timeout: 15000,
        });
        logger.info(
          `[REVIEW] Fresh-eyes: posted ${reviewed.verdict} comment on PR #${ctx.prNumber}`
        );
      } catch (commentErr) {
        logger.warn('[REVIEW] Fresh-eyes: failed to post PR comment', commentErr);
      }

      return reviewed.verdict === 'BLOCK' ? 'blocked' : 'concern';
    } catch (err) {
      // Review failure must not block the pipeline — log and skip
      logger.warn('[REVIEW] Fresh-eyes review failed, proceeding without review', err);
      return 'skipped';
    }
  }

  /**
   * Checks whether the PR's changed files stay within the feature's declared filesToModify.
   *
   * Warning mode: logs violations and posts a PR comment but never blocks the pipeline.
   * Returns 'within_budget' | 'over_budget' | 'skipped'.
   *
   * Per deviation rule: auto-rollback at REVIEW phase can lose legitimate cross-cutting
   * changes, so this check is intentionally non-blocking.
   */
  private async checkScopeBudget(
    ctx: StateContext
  ): Promise<'within_budget' | 'over_budget' | 'skipped'> {
    const { filesToModify } = ctx.feature;
    if (!filesToModify || filesToModify.length === 0) {
      return 'skipped';
    }

    try {
      const { stdout } = await execAsync(
        `gh pr view ${ctx.prNumber} --json files --jq '[.files[].path]'`,
        { cwd: ctx.projectPath, timeout: 15000 }
      );

      let changedFiles: string[] = [];
      try {
        changedFiles = JSON.parse(stdout.trim()) as string[];
      } catch {
        logger.warn('[REVIEW] Scope budget: failed to parse PR files JSON, skipping');
        return 'skipped';
      }

      const result = analyzeScopeBudget(changedFiles, filesToModify);

      if (!result.withinBudget) {
        logger.warn('[REVIEW] Scope budget exceeded — PR contains out-of-scope files', {
          featureId: ctx.feature.id,
          prNumber: ctx.prNumber,
          outOfScopeFiles: result.outOfScopeFiles,
          outOfScopePercent: result.outOfScopePercent.toFixed(1),
          toleratedFiles: result.toleratedFiles,
          declaredScope: filesToModify,
        });

        const fileLines = result.outOfScopeFiles.map((f) => `- \`${f}\``).join('\n');
        const scopeLines = filesToModify.map((f) => `- \`${f}\``).join('\n');
        const commentBody =
          `**Scope Budget Warning**\n\n` +
          `This PR modifies ${result.outOfScopeFiles.length} file(s) outside the declared \`filesToModify\` scope ` +
          `(${result.outOfScopePercent.toFixed(1)}% out-of-scope, threshold: 20%).\n\n` +
          `Out-of-scope files:\n${fileLines}\n\n` +
          `Declared scope:\n${scopeLines}\n\n` +
          `This is a warning only — the PR will proceed to merge. ` +
          `If these changes are intentional, update \`filesToModify\` in the feature spec.`;

        try {
          await execAsync(`gh pr comment ${ctx.prNumber} --body ${JSON.stringify(commentBody)}`, {
            cwd: ctx.projectPath,
            timeout: 15000,
          });
        } catch (commentErr) {
          logger.warn('[REVIEW] Scope budget: failed to post warning comment', commentErr);
        }

        return 'over_budget';
      }

      logger.info('[REVIEW] Scope budget check passed', {
        featureId: ctx.feature.id,
        prNumber: ctx.prNumber,
        totalSourceFiles: result.totalSourceFiles,
        toleratedFiles: result.toleratedFiles,
      });
      return 'within_budget';
    } catch (err) {
      logger.warn('[REVIEW] Scope budget check failed, proceeding without enforcement', err);
      return 'skipped';
    }
  }

  /**
   * Query GitHub for the PR's mergeable state.
   * Returns 'CONFLICTING', 'MERGEABLE', 'UNKNOWN', or null on error.
   */
  private async getMergeableState(ctx: StateContext): Promise<string | null> {
    if (!ctx.prNumber) return null;
    try {
      const { stdout } = await execAsync(
        `gh pr view ${ctx.prNumber} --json mergeable --jq '.mergeable'`,
        { cwd: ctx.projectPath, timeout: 10000 }
      );
      // GitHub returns a quoted JSON string — strip quotes and whitespace
      return stdout.trim().replace(/^"|"$/g, '') || null;
    } catch (err) {
      logger.debug('[REVIEW] getMergeableState: gh CLI failed, skipping conflict check', err);
      return null;
    }
  }

  /**
   * Handle a PR that has unresolvable merge conflicts (mergeable: CONFLICTING).
   *
   * 1. Post an explanatory comment on the PR.
   * 2. Close the PR.
   * 3. If the feature's branch already has a merged PR (race: both agents landed),
   *    mark the feature done.
   * 4. Otherwise, reset the feature to backlog so the next auto-mode cycle re-cuts
   *    a fresh branch from the current base branch. No HITL escalation.
   */
  private async handleConflictingPR(ctx: StateContext): Promise<StateTransitionResult> {
    logger.info('[REVIEW] PR has merge conflicts — closing and re-queuing to backlog', {
      featureId: ctx.feature.id,
      prNumber: ctx.prNumber,
    });

    const comment =
      `This PR has merge conflicts with the base branch and cannot be auto-merged.\n\n` +
      `Closing and re-queuing the feature to backlog so it will be re-cut from the ` +
      `current base branch on the next auto-mode cycle.`;

    try {
      await execAsync(`gh pr comment ${ctx.prNumber} --body ${JSON.stringify(comment)}`, {
        cwd: ctx.projectPath,
        timeout: 15000,
      });
    } catch (err) {
      logger.warn('[REVIEW] handleConflictingPR: failed to post conflict comment', err);
    }

    try {
      await execAsync(`gh pr close ${ctx.prNumber}`, {
        cwd: ctx.projectPath,
        timeout: 15000,
      });
      logger.info(`[REVIEW] Closed conflicting PR #${ctx.prNumber}`);
    } catch (err) {
      logger.warn('[REVIEW] handleConflictingPR: failed to close PR', err);
    }

    // If the branch already has a merged PR (e.g. a parallel agent landed the same fix),
    // mark the feature done instead of re-filing.
    const alreadyMerged = await this.checkBranchMerged(ctx);
    if (alreadyMerged) {
      logger.info('[REVIEW] Branch already merged — marking feature done (superseded)', {
        featureId: ctx.feature.id,
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
        reason: 'PR conflicting but branch already merged — marked done (superseded)',
      };
    }

    // Reset to backlog for re-cut — no HITL escalation
    await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
      status: 'backlog',
    });
    logger.info('[REVIEW] Feature reset to backlog for re-cut from fresh base', {
      featureId: ctx.feature.id,
      prNumber: ctx.prNumber,
    });

    return {
      nextState: null,
      shouldContinue: false,
      reason: 'PR closed due to merge conflicts — feature re-queued to backlog',
    };
  }

  /**
   * Reconcile a PR into the expected managed state regardless of how it was created.
   *
   * 1. Appends the ownership watermark to the PR body if it is missing.
   * 2. Enables auto-merge if it is not already enabled.
   *
   * This is idempotent — running it multiple times on the same PR is safe.
   */
  private async normalizePR(ctx: StateContext): Promise<void> {
    if (!ctx.prNumber) return;

    // Fetch current PR body and auto-merge status in one call
    let body = '';
    let autoMergeEnabled = false;
    try {
      const { stdout } = await execAsync(
        `gh pr view ${ctx.prNumber} --json body,autoMergeRequest --jq '{body: .body, autoMerge: (.autoMergeRequest != null)}'`,
        { cwd: ctx.projectPath, timeout: 15000 }
      );
      const data = JSON.parse(stdout.trim()) as { body: string; autoMerge: boolean };
      body = data.body ?? '';
      autoMergeEnabled = data.autoMerge ?? false;
    } catch (err) {
      logger.warn('[REVIEW] normalizePR: failed to fetch PR body/auto-merge status:', err);
      return;
    }

    // 1. Patch ownership watermark if absent
    const ownership = parsePROwnershipWatermark(body);
    if (!ownership.instanceId) {
      try {
        let instanceId = `transient-${randomUUID().slice(0, 8)}`;
        let teamId = '';
        if (this.serviceContext.settingsService) {
          const globalSettings = await this.serviceContext.settingsService.getGlobalSettings();
          instanceId = globalSettings.instanceId ?? instanceId;
          teamId = globalSettings.teamId ?? '';
        }
        const watermark = buildPROwnershipWatermark(instanceId, teamId);
        const patchedBody = body ? `${body}\n\n${watermark}` : watermark;
        // Write body via a temp file to avoid shell quoting issues with PR body content
        const { writeFileSync, unlinkSync } = await import('node:fs');
        const tmpFile = `/tmp/pr-body-${ctx.prNumber}-${Date.now()}.txt`;
        writeFileSync(tmpFile, patchedBody, 'utf8');
        try {
          await execAsync(`gh pr edit ${ctx.prNumber} --body-file "${tmpFile}"`, {
            cwd: ctx.projectPath,
            timeout: 15000,
          });
        } finally {
          try {
            unlinkSync(tmpFile);
          } catch {
            /* ignore */
          }
        }
        logger.info(
          `[REVIEW] normalizePR: patched ownership watermark on PR #${ctx.prNumber} (instance=${instanceId})`
        );
      } catch (err) {
        logger.warn('[REVIEW] normalizePR: failed to patch PR ownership watermark:', err);
      }
    }

    // 2. Enable auto-merge if not already enabled
    if (!autoMergeEnabled) {
      try {
        const mergeFlag = await this.resolveNormalizeMergeFlag(ctx);
        await execAsync(`gh pr merge ${ctx.prNumber} --auto ${mergeFlag}`, {
          cwd: ctx.projectPath,
          timeout: 30000,
        });
        logger.info(
          `[REVIEW] normalizePR: enabled auto-merge on PR #${ctx.prNumber} (${mergeFlag})`
        );
      } catch (err) {
        logger.warn('[REVIEW] normalizePR: failed to enable auto-merge:', err);
      }
    }
  }

  /**
   * Resolve merge flag for normalization (same logic as MergeProcessor.resolveMergeFlag).
   * Promotion PRs always use --merge. Feature PRs use the configured prMergeStrategy.
   */
  private async resolveNormalizeMergeFlag(ctx: StateContext): Promise<string> {
    if (ctx.prNumber) {
      const baseBranchFlag = await resolveMergeStrategy(ctx.prNumber, ctx.projectPath);
      if (baseBranchFlag === '--merge') return '--merge';
    }

    let strategy: PRMergeStrategy = 'squash';
    if (this.serviceContext.settingsService) {
      try {
        const globalSettings = await this.serviceContext.settingsService.getGlobalSettings();
        strategy = globalSettings.gitWorkflow?.prMergeStrategy ?? 'squash';
      } catch (err) {
        logger.warn('[REVIEW] normalizePR: failed to read merge strategy from settings:', err);
      }
    }

    const flagMap: Record<PRMergeStrategy, string> = {
      squash: '--squash',
      merge: '--merge',
      rebase: '--rebase',
    };
    return flagMap[strategy] ?? '--squash';
  }

  private async getPRReviewState(ctx: StateContext): Promise<string> {
    const trackedPR = this.getTrackedPR(ctx);
    if (trackedPR?.reviewState) return trackedPR.reviewState;

    // Fallback: query gh CLI when PRFeedbackService hasn't tracked the PR yet
    if (!ctx.prNumber) return 'pending';

    // Fast path: if the PR is already merged, skip review state resolution entirely.
    // This prevents "Unable to determine PR review state" errors for merged PRs
    // when the GitHub API returns unclear review status on closed/merged PRs.
    try {
      const { stdout: mergeCheck } = await execAsync(
        `gh pr view ${ctx.prNumber} --json state,mergedAt --jq '{state: .state, mergedAt: .mergedAt}'`,
        { cwd: ctx.projectPath, timeout: 10000 }
      );
      const mergeData = JSON.parse(mergeCheck.trim());
      if (mergeData.state === 'MERGED' && mergeData.mergedAt) {
        logger.info(
          `[REVIEW] PR #${ctx.prNumber} already merged at ${mergeData.mergedAt}, fast-pathing to approved`
        );
        return 'approved';
      }
    } catch (mergeErr) {
      logger.debug(
        `[REVIEW] Merge check failed for PR #${ctx.prNumber}, continuing with review state check`
      );
    }

    try {
      const { stdout } = await execAsync(
        `gh pr view ${ctx.prNumber} --json reviewDecision,statusCheckRollup,reviews --jq '{decision: .reviewDecision, checks: [(.statusCheckRollup // [])[] | {name: .context, conclusion: .conclusion}], approvedCount: ([(.reviews // [])[] | select(.state == "APPROVED")] | length)}'`,
        { cwd: ctx.projectPath, timeout: 15000 }
      );

      const data = JSON.parse(stdout.trim());

      if (data.decision === 'APPROVED') return 'approved';
      if (data.decision === 'CHANGES_REQUESTED') return 'changes_requested';

      // Read soft checks from settings (failures logged but don't block approval)
      let softChecks: string[] = [];
      if (this.serviceContext.settingsService) {
        try {
          const globalSettings = await this.serviceContext.settingsService.getGlobalSettings();
          softChecks = globalSettings.gitWorkflow?.softChecks ?? [];
        } catch {
          // Settings unavailable — all checks treated as hard
        }
      }

      // Separate CodeRabbit checks and soft checks from real CI checks.
      // CodeRabbit rate-limit sets commit status to FAILURE, but this is transient
      // and should not block the approval flow.
      const checks = (data.checks || []) as Array<{ name: string; conclusion: string }>;
      const codeRabbitChecks = checks.filter(
        (c) =>
          c.name?.toLowerCase().includes('coderabbit') ||
          c.name?.toLowerCase().includes('code-rabbit')
      );
      const ciChecks = checks.filter((c) => {
        const nameLower = c.name?.toLowerCase() ?? '';
        if (nameLower.includes('coderabbit') || nameLower.includes('code-rabbit')) return false;
        // Exclude soft checks from blocking CI evaluation
        if (softChecks.some((soft) => nameLower.includes(soft.toLowerCase()))) return false;
        return true;
      });

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

      // Log soft check failures for visibility
      const softCheckFailures = checks.filter(
        (c) =>
          !codeRabbitChecks.includes(c) &&
          !ciChecks.includes(c) &&
          c.conclusion &&
          c.conclusion !== 'SUCCESS'
      );
      if (softCheckFailures.length > 0) {
        logger.info(`[REVIEW] Soft check(s) failed — not blocking approval`, {
          prNumber: ctx.prNumber,
          softChecks: softCheckFailures.map((c) => `${c.name}=${c.conclusion}`),
        });
      }

      // Check for hard CI failures before evaluating approval.
      // Any CI check (non-CodeRabbit, non-soft) with conclusion FAILURE triggers
      // a transition back to EXECUTE so the agent can fix the issue.
      const ciFailures = ciChecks.filter((c) => c.conclusion === 'FAILURE');
      if (ciFailures.length > 0) {
        logger.info(`[REVIEW] CI check(s) failed — transitioning to ci_failed`, {
          prNumber: ctx.prNumber,
          ciFailures: ciFailures.map((c) => `${c.name}=${c.conclusion}`),
        });
        return 'ci_failed';
      }

      // Require at least one human APPROVED review — CI passing alone is not sufficient.
      // Only real CI checks (non-CodeRabbit, non-soft) block approval.
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

      // Source-code gate: verify the PR contains non-metadata changes.
      // A PR containing only .automaker-lock or lock files indicates the agent ran in
      // the wrong context (e.g. base-branch failure). Block and escalate instead of
      // marking done, so the failure is visible on the board.
      let hasSourceChanges = true; // default true so failures are non-fatal
      try {
        const { stdout: filesJson } = await execAsync(
          `gh pr view ${ctx.prNumber} --json files --jq '[.files[].path]'`,
          { cwd: ctx.projectPath, timeout: 15000 }
        );
        const changedFiles: string[] = JSON.parse(filesJson.trim());
        // An empty diff (no files) is unusual but allowed through — treat as source change
        if (changedFiles.length > 0) {
          const sourceFiles = changedFiles.filter(
            (f) => !isMergeOnlyMetadata(f, ctx.feature.filesToModify)
          );
          hasSourceChanges = sourceFiles.length > 0;
          if (!hasSourceChanges) {
            logger.warn(
              `[MERGE] PR #${ctx.prNumber} contains only metadata files ` +
                `(${changedFiles.length} file(s): ${changedFiles.slice(0, 5).join(', ')}). ` +
                `Escalating — no source code landed.`
            );
          }
        }
      } catch (diffErr) {
        // Non-fatal: if diff inspection fails, proceed as normal done.
        logger.warn(
          `[MERGE] PR #${ctx.prNumber} diff inspection failed — proceeding as done:`,
          diffErr
        );
      }

      // Update feature status with merge timestamps
      const now = new Date().toISOString();
      const prReviewDurationMs =
        ctx.feature.prCreatedAt != null
          ? Date.now() - new Date(ctx.feature.prCreatedAt).getTime()
          : undefined;

      if (!hasSourceChanges) {
        // Lock-only merge: block the feature and escalate for human review.
        const reason = `PR merged with lock-only changes — no source code landed (PR #${ctx.prNumber})`;
        await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
          status: 'blocked',
          statusChangeReason: reason,
          prMergedAt: now,
          ...(prReviewDurationMs !== undefined ? { prReviewDurationMs } : {}),
        });
        this.serviceContext.events.emit('feature:pr-merged' as EventType, {
          featureId: ctx.feature.id,
          prNumber: ctx.prNumber,
          projectPath: ctx.projectPath,
        });
        logger.info(`[MERGE] PR #${ctx.prNumber} escalated — lock-only merge`);
        ctx.escalationReason = reason;
        return {
          nextState: 'ESCALATE',
          shouldContinue: true,
          reason,
        };
      }

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
      if (
        errMsg.includes('required status check') ||
        errMsg.includes('waiting for status') ||
        errMsg.includes('pull request is not mergeable') ||
        errMsg.includes('not yet mergeable')
      ) {
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
    // Check if this is a promotion/epic PR — those must always use --merge
    if (ctx.prNumber) {
      const baseBranchFlag = await resolveMergeStrategy(ctx.prNumber, ctx.projectPath);
      if (baseBranchFlag === '--merge') {
        logger.info(
          `[MERGE] PR #${ctx.prNumber} targets a protected branch — forcing --merge strategy`
        );
        return '--merge';
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
