/**
 * PR Remediation Service
 *
 * Integrates conflict-type classification into the update_branch retry loop.
 * Before the 2nd retry, classifies the conflict nature and dispatches to an
 * appropriate remediation path instead of blindly retrying.
 *
 * Verdict → Action mapping:
 *   redundant     → auto-close PR with comment linking superseding commits
 *   rebasable     → attempt git merge -X ours (keep PR semantics, accept base formatting)
 *   decomposable  → propose PR split to user via HITL comment
 *   genuine       → escalate to HITL exactly once with specific hunks
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import Anthropic from '@anthropic-ai/sdk';
import {
  PRConflictClassifier,
  type ConflictClassification,
  type ConflictVerdict,
} from './pr-conflict-classifier.js';

const execAsync = promisify(exec);
const logger = createLogger('PRRemediationService');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RemediationActionType =
  | 'auto-closed'
  | 'merged'
  | 'decompose-proposed'
  | 'hitl-escalated'
  | 'budget-exhausted'
  | 'classification-failed'
  | 'retry-allowed';

export interface RemediationResult {
  verdict: ConflictVerdict | null;
  actionType: RemediationActionType;
  prNumber: number;
  remediationCount: number;
  reasoning: string;
  details: Record<string, unknown>;
}

export interface PRRemediationInput {
  projectPath: string;
  prNumber: number;
  /** Current retry attempt number (1-based). Classification triggers on attempt >= 2. */
  retryAttempt: number;
  anthropic: Anthropic;
  /** Maximum total remediation attempts before budget exhaustion (default: 3). */
  maxRetries?: number;
}

// ---------------------------------------------------------------------------
// Per-PR budget tracking (in-memory)
// ---------------------------------------------------------------------------

/** Map of `${projectPath}:${prNumber}` → remediation attempt count. */
const remediationCounts = new Map<string, number>();

function getBudgetKey(projectPath: string, prNumber: number): string {
  return `${projectPath}:${prNumber}`;
}

function getRemediationCount(projectPath: string, prNumber: number): number {
  return remediationCounts.get(getBudgetKey(projectPath, prNumber)) ?? 0;
}

function incrementRemediationCount(projectPath: string, prNumber: number): number {
  const key = getBudgetKey(projectPath, prNumber);
  const next = (remediationCounts.get(key) ?? 0) + 1;
  remediationCounts.set(key, next);
  return next;
}

/** Reset the budget counter for a PR (e.g., after a successful merge). */
export function resetRemediationCount(projectPath: string, prNumber: number): void {
  remediationCounts.delete(getBudgetKey(projectPath, prNumber));
}

// ---------------------------------------------------------------------------
// PR shell injection guard
// ---------------------------------------------------------------------------

function sanitizePrNumber(prNumber: unknown): number {
  const parsed = parseInt(String(prNumber), 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid PR number: ${String(prNumber)}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Diagnose a PR conflict and take the appropriate remediation action.
 *
 * On the 1st retry (retryAttempt === 1) this is a no-op — the caller
 * should just attempt update_branch normally.
 *
 * On retryAttempt >= 2 this classifies the conflict type and dispatches
 * to the correct remediation path, logging the verdict and outcome for
 * observability.
 */
export async function classifyAndRemediate(input: PRRemediationInput): Promise<RemediationResult> {
  const { projectPath, anthropic, maxRetries = 3 } = input;
  const prNumber = sanitizePrNumber(input.prNumber);
  const retryAttempt = input.retryAttempt;

  const remediationCount = incrementRemediationCount(projectPath, prNumber);

  logger.info('[PRRemediation] Remediation invoked', {
    prNumber,
    retryAttempt,
    remediationCount,
    maxRetries,
  });

  // Budget exhaustion check
  if (remediationCount > maxRetries) {
    logger.warn('[PRRemediation] Budget exhausted', { prNumber, remediationCount, maxRetries });
    return {
      verdict: null,
      actionType: 'budget-exhausted',
      prNumber,
      remediationCount,
      reasoning: `Remediation budget exhausted after ${remediationCount - 1} attempts (max: ${maxRetries}).`,
      details: { remediationCount, maxRetries },
    };
  }

  // On the first retry, allow normal update_branch to proceed
  if (retryAttempt <= 1) {
    logger.info('[PRRemediation] First retry — deferring to normal update_branch', { prNumber });
    return {
      verdict: null,
      actionType: 'retry-allowed',
      prNumber,
      remediationCount,
      reasoning: 'First retry — classifier not invoked yet.',
      details: { retryAttempt },
    };
  }

  // Classify the conflict
  let classification: ConflictClassification;
  try {
    const classifier = new PRConflictClassifier({ projectPath, prNumber, anthropic });
    classification = await classifier.classify();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[PRRemediation] Classifier threw unexpectedly', { prNumber, error: msg });
    return {
      verdict: null,
      actionType: 'classification-failed',
      prNumber,
      remediationCount,
      reasoning: `Classifier failed: ${msg}`,
      details: { error: msg },
    };
  }

  logger.info('[PRRemediation] Conflict classified', {
    prNumber,
    verdict: classification.verdict,
    confidence: classification.confidence,
    remediationCount,
  });

  // Dispatch to verdict-specific handler
  switch (classification.verdict) {
    case 'redundant':
      return handleRedundant(projectPath, prNumber, classification, remediationCount);

    case 'rebasable':
      return handleRebasable(projectPath, prNumber, classification, remediationCount);

    case 'decomposable':
      return handleDecomposable(projectPath, prNumber, classification, remediationCount);

    case 'genuine':
      return handleGenuine(projectPath, prNumber, classification, remediationCount);

    default:
      // Should not happen — type system enforces this, but be safe
      return handleGenuine(projectPath, prNumber, classification, remediationCount);
  }
}

// ---------------------------------------------------------------------------
// Verdict handlers
// ---------------------------------------------------------------------------

/**
 * redundant: Auto-close the PR with a comment linking the superseding commits.
 * No further retries.
 */
async function handleRedundant(
  projectPath: string,
  prNumber: number,
  classification: ConflictClassification,
  remediationCount: number
): Promise<RemediationResult> {
  const superseding = classification.supersedingCommits ?? [];
  const commitLinks =
    superseding.length > 0
      ? superseding.map((c) => `- ${c}`).join('\n')
      : '(see recent commits on base branch)';

  const comment =
    `**Conflict classifier verdict: redundant**\n\n` +
    `This PR's intent has already been satisfied by commits on the base branch.\n\n` +
    `**Superseding commits:**\n${commitLinks}\n\n` +
    `**Reasoning:** ${classification.reasoning}\n\n` +
    `Closing this PR automatically — no further retries needed. ` +
    `If you believe this is incorrect, reopen the PR and reassign it for manual review.`;

  try {
    await execAsync(`gh pr comment ${prNumber} --body ${JSON.stringify(comment)}`, {
      cwd: projectPath,
      timeout: 15000,
    });
    await execAsync(`gh pr close ${prNumber}`, {
      cwd: projectPath,
      timeout: 15000,
    });
    logger.info('[PRRemediation] Auto-closed redundant PR', { prNumber, superseding });
  } catch (err) {
    logger.warn('[PRRemediation] Failed to auto-close redundant PR', { prNumber, err });
  }

  resetRemediationCount(projectPath, prNumber);

  return {
    verdict: 'redundant',
    actionType: 'auto-closed',
    prNumber,
    remediationCount,
    reasoning: classification.reasoning,
    details: {
      supersedingCommits: superseding,
      comment,
    },
  };
}

/**
 * rebasable: Attempt git merge -X ours to keep the PR's semantic content while
 * accepting base branch changes in the non-conflicting regions. Pushes if successful.
 */
async function handleRebasable(
  projectPath: string,
  prNumber: number,
  classification: ConflictClassification,
  remediationCount: number
): Promise<RemediationResult> {
  const prBranch = classification.evidence.prBranch;
  const baseBranch = classification.evidence.baseBranch;

  if (!prBranch || !baseBranch) {
    logger.warn('[PRRemediation] Missing branch info for rebasable merge', { prNumber });
    return handleGenuine(projectPath, prNumber, classification, remediationCount);
  }

  // Determine the worktree path to operate in
  const worktreePath = `${projectPath}/.worktrees/${prBranch}`;

  let mergeSucceeded = false;
  let mergeError = '';

  try {
    // Fetch latest base
    await execAsync(`git fetch origin ${baseBranch}`, { cwd: worktreePath, timeout: 30000 });

    // Attempt the merge preferring our (PR branch) changes for conflicts
    await execAsync(`git merge -X ours origin/${baseBranch} --no-edit`, {
      cwd: worktreePath,
      timeout: 60000,
    });
    mergeSucceeded = true;

    logger.info('[PRRemediation] Rebasable merge succeeded', { prNumber, prBranch });

    // Push the resolved branch
    await execAsync(`git push origin ${prBranch}`, { cwd: worktreePath, timeout: 30000 });

    logger.info('[PRRemediation] Pushed resolved branch', { prNumber, prBranch });

    const successComment =
      `**Conflict classifier verdict: rebasable**\n\n` +
      `Textual conflicts were resolved automatically using the PR branch's content as the source of truth.\n\n` +
      `**Reasoning:** ${classification.reasoning}\n\n` +
      `The branch has been updated. CI checks are re-running.`;

    await execAsync(`gh pr comment ${prNumber} --body ${JSON.stringify(successComment)}`, {
      cwd: projectPath,
      timeout: 15000,
    }).catch(() => {
      /* comment is informational only */
    });
  } catch (err) {
    mergeError = err instanceof Error ? err.message : String(err);
    logger.warn('[PRRemediation] Rebasable merge failed', { prNumber, error: mergeError });

    // Abort any in-progress merge
    try {
      await execAsync('git merge --abort', { cwd: worktreePath, timeout: 10000 });
    } catch {
      try {
        await execAsync('git reset --merge', { cwd: worktreePath, timeout: 10000 });
      } catch {
        logger.warn('[PRRemediation] Could not abort failed merge in worktree', { worktreePath });
      }
    }
  }

  if (mergeSucceeded) {
    return {
      verdict: 'rebasable',
      actionType: 'merged',
      prNumber,
      remediationCount,
      reasoning: classification.reasoning,
      details: {
        prBranch,
        baseBranch,
        mergeStrategy: 'ours',
        resolvedFiles: classification.evidence.conflictingFiles,
      },
    };
  }

  // Merge failed — escalate as genuine
  logger.info('[PRRemediation] Rebasable merge failed, escalating to genuine HITL', { prNumber });
  const degradedClassification = {
    ...classification,
    verdict: 'genuine' as const,
    reasoning: `${classification.reasoning}\n\nNote: A rebasable merge was attempted but failed: ${mergeError}`,
    conflictingHunks: classification.evidence.conflictingFiles.map(
      (f) => `Conflict in ${f} (rebasable merge failed)`
    ),
  };
  return handleGenuine(projectPath, prNumber, degradedClassification, remediationCount);
}

/**
 * decomposable: Post a proposal to split the PR into smaller pieces.
 * Does not close — presents recommendation to user.
 */
async function handleDecomposable(
  projectPath: string,
  prNumber: number,
  classification: ConflictClassification,
  remediationCount: number
): Promise<RemediationResult> {
  const decompositionFiles = classification.decompositionFiles ?? [];
  const conflictingFiles = classification.evidence.conflictingFiles;
  const allPRFiles = classification.evidence.totalPRFiles;

  const fileList =
    decompositionFiles.length > 0
      ? decompositionFiles.map((f) => `- ${f}`).join('\n')
      : conflictingFiles.map((f) => `- ${f}`).join('\n') || '(see conflicting files above)';

  const comment =
    `**Conflict classifier verdict: decomposable**\n\n` +
    `This PR changes ${allPRFiles} files but conflicts are limited to ${conflictingFiles.length} of them. ` +
    `The remaining ${allPRFiles - conflictingFiles.length} files could be merged cleanly as a smaller PR.\n\n` +
    `**Suggested split:**\n` +
    `1. Extract the following conflicting files into a separate PR to resolve manually:\n${fileList}\n` +
    `2. Create a new PR with the remaining (non-conflicting) files and merge it first.\n\n` +
    `**Reasoning:** ${classification.reasoning}\n\n` +
    `This PR has been left open for manual review. Use the suggestion above to unblock incremental progress.`;

  try {
    await execAsync(`gh pr comment ${prNumber} --body ${JSON.stringify(comment)}`, {
      cwd: projectPath,
      timeout: 15000,
    });
    logger.info('[PRRemediation] Posted decomposition proposal', {
      prNumber,
      conflictingFiles: conflictingFiles.length,
      totalFiles: allPRFiles,
    });
  } catch (err) {
    logger.warn('[PRRemediation] Failed to post decomposition comment', { prNumber, err });
  }

  return {
    verdict: 'decomposable',
    actionType: 'decompose-proposed',
    prNumber,
    remediationCount,
    reasoning: classification.reasoning,
    details: {
      conflictingFiles,
      decompositionFiles,
      totalPRFiles: allPRFiles,
      comment,
    },
  };
}

/**
 * genuine: Escalate to HITL exactly once with specific conflicting hunks and context.
 * Posts a detailed diagnostic comment on the PR and does not retry.
 */
async function handleGenuine(
  projectPath: string,
  prNumber: number,
  classification: ConflictClassification,
  remediationCount: number
): Promise<RemediationResult> {
  const conflictingHunks = classification.conflictingHunks ?? [];
  const conflictingFiles = classification.evidence.conflictingFiles;

  const hunkSection =
    conflictingHunks.length > 0
      ? conflictingHunks.map((h) => `- ${h}`).join('\n')
      : conflictingFiles.map((f) => `- Conflict in \`${f}\``).join('\n') ||
        '(no specific hunks identified)';

  const sampleSection =
    classification.evidence.conflictingSample.slice(0, 1500) || '(conflict sample not available)';

  const comment =
    `**Conflict classifier verdict: genuine — human review required**\n\n` +
    `This PR has semantic conflicts with the base branch that cannot be resolved automatically.\n\n` +
    `**Conflicting areas:**\n${hunkSection}\n\n` +
    `**Conflict sample:**\n\`\`\`diff\n${sampleSection}\n\`\`\`\n\n` +
    `**Classifier reasoning:** ${classification.reasoning}\n\n` +
    `**Files with conflicts (${conflictingFiles.length}):**\n` +
    conflictingFiles.map((f) => `- \`${f}\``).join('\n') +
    '\n\n' +
    `No further automatic retries will be made. Please resolve the conflicts manually, ` +
    `push the resolved branch, and reopen this PR if needed.`;

  try {
    await execAsync(`gh pr comment ${prNumber} --body ${JSON.stringify(comment)}`, {
      cwd: projectPath,
      timeout: 15000,
    });
    logger.info('[PRRemediation] Posted genuine conflict HITL escalation', {
      prNumber,
      conflictingFiles: conflictingFiles.length,
    });
  } catch (err) {
    logger.warn('[PRRemediation] Failed to post HITL escalation comment', { prNumber, err });
  }

  return {
    verdict: 'genuine',
    actionType: 'hitl-escalated',
    prNumber,
    remediationCount,
    reasoning: classification.reasoning,
    details: {
      conflictingFiles,
      conflictingHunks,
      confidence: classification.confidence,
      comment,
    },
  };
}

// ---------------------------------------------------------------------------
// Observability helpers
// ---------------------------------------------------------------------------

/** Log a structured remediation outcome for monitoring dashboards. */
export function logRemediationOutcome(result: RemediationResult, featureId?: string): void {
  logger.info('[PRRemediation:outcome]', {
    featureId,
    prNumber: result.prNumber,
    verdict: result.verdict,
    actionType: result.actionType,
    remediationCount: result.remediationCount,
    reasoning: result.reasoning.slice(0, 200),
  });
}

/** Get the current remediation count for a PR (for observability/metrics). */
export function getRemediationCountForPR(projectPath: string, prNumber: number): number {
  return getRemediationCount(projectPath, prNumber);
}
