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
 *
 * Format remediation:
 *   When CI's "Check formatting" step fails on an agent-authored PR, remediateFormatFailure()
 *   runs prettier on the PR's changed files, verifies scope, and pushes an auto-fix commit.
 */

import { exec } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import Anthropic from '@anthropic-ai/sdk';
import {
  PRConflictClassifier,
  type ConflictClassification,
  type ConflictVerdict,
} from './pr-conflict-classifier.js';
import { PrRemediationWorker } from './pr-remediation-worker.js';
import type {
  FormatRemediationInput,
  FormatRemediationResult,
  PRFormatRemediatedPayload,
} from '../types/pr-remediation.js';
import type { EventEmitter } from '../lib/events.js';

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

// ---------------------------------------------------------------------------
// Format failure remediation
// ---------------------------------------------------------------------------

/**
 * Protected branches that should never be touched by auto-remediation.
 * Only feature branches (feature/, fix/, chore/, etc.) are eligible.
 */
const PROTECTED_BRANCHES = new Set(['main', 'staging', 'dev']);

/**
 * Branch prefixes that identify agent-authored branches.
 * Human PRs typically don't follow these naming conventions.
 */
const AGENT_BRANCH_PREFIXES = [
  'feature/',
  'fix/',
  'chore/',
  'refactor/',
  'feat/',
  'style/',
  'docs/',
  'test/',
  'ci/',
  'perf/',
  'build/',
];

function isProtectedBranch(branch: string): boolean {
  return PROTECTED_BRANCHES.has(branch);
}

function isAgentBranch(branch: string): boolean {
  return AGENT_BRANCH_PREFIXES.some((prefix) => branch.startsWith(prefix));
}

/**
 * Auto-remediate a "Check formatting" CI failure on an agent-authored PR.
 *
 * Safety gates (any failure skips or escalates):
 * 1. Protected branch guard — never touch main/staging/dev
 * 2. Agent-author guard — only act on agent-authored branches (prefix check)
 * 3. One-remediation cap — check git log for existing auto-remediation commit
 * 4. Scope check — after prettier runs, verify only PR-diff files were modified
 *
 * On success: commits "style: prettier fix (auto-remediation)" and pushes.
 * On scope drift: escalates to HITL (does not push).
 */
export async function remediateFormatFailure(
  input: FormatRemediationInput,
  events?: EventEmitter
): Promise<FormatRemediationResult> {
  const { prNumber, headBranch, headSha, projectPath, repository } = input;

  logger.info('[FormatRemediation] Triggered', {
    prNumber,
    headBranch,
    repository,
  });

  // ------------------------------------------------------------------
  // Guard 1: Protected branch check
  // ------------------------------------------------------------------
  if (isProtectedBranch(headBranch)) {
    logger.warn('[FormatRemediation] Refusing to remediate protected branch', {
      prNumber,
      headBranch,
    });
    logger.info('[FormatRemediation:security] Skipped — protected branch target', {
      prNumber,
      headBranch,
    });
    return {
      status: 'skipped',
      prNumber,
      reason: `Skipped: branch '${headBranch}' is protected. Auto-remediation only applies to feature branches.`,
      details: { headBranch, guard: 'protected-branch' },
    };
  }

  // ------------------------------------------------------------------
  // Guard 2: Agent-author check (branch prefix)
  // ------------------------------------------------------------------
  if (!isAgentBranch(headBranch)) {
    logger.info('[FormatRemediation] Skipping non-agent branch', { prNumber, headBranch });
    return {
      status: 'skipped',
      prNumber,
      reason: `Skipped: branch '${headBranch}' does not match agent naming convention (expected prefix: ${AGENT_BRANCH_PREFIXES.slice(0, 3).join(', ')}...).`,
      details: { headBranch, guard: 'agent-author' },
    };
  }

  // ------------------------------------------------------------------
  // Find the worktree path for this branch (reuse existing checkout)
  // ------------------------------------------------------------------
  const worktreePath = path.join(projectPath, '.worktrees', headBranch);

  const worker = new PrRemediationWorker();

  // ------------------------------------------------------------------
  // Guard 3: One-remediation-per-PR cap
  // ------------------------------------------------------------------
  let baseBranch = 'dev'; // default; we'll try to detect from gh
  try {
    const { stdout: prJson } = await execAsync(
      `gh pr view ${prNumber} --repo ${repository} --json baseRefName`,
      { timeout: 15000 }
    );
    const parsed = JSON.parse(prJson) as { baseRefName?: string };
    if (parsed.baseRefName) baseBranch = parsed.baseRefName;
  } catch {
    logger.debug('[FormatRemediation] Could not detect base branch from gh, using default', {
      prNumber,
      defaultBaseBranch: baseBranch,
    });
  }

  try {
    const hasExisting = await worker.hasExistingRemediationCommit(
      worktreePath,
      baseBranch,
      headBranch
    );
    if (hasExisting) {
      logger.warn('[FormatRemediation] One-remediation cap reached — skipping', {
        prNumber,
        headBranch,
      });
      logger.warn('[FormatRemediation:security] Possible infinite-loop scenario detected', {
        prNumber,
      });
      return {
        status: 'skipped',
        prNumber,
        reason: 'Skipped: a remediation commit already exists on this PR. One-per-PR cap enforced.',
        details: { headBranch, guard: 'one-per-pr-cap' },
      };
    }
  } catch (capErr) {
    // If we can't check the worktree (branch not checked out yet), proceed cautiously
    logger.debug('[FormatRemediation] Could not check remediation cap — worktree may not exist', {
      prNumber,
      error: capErr instanceof Error ? capErr.message : String(capErr),
    });
  }

  // ------------------------------------------------------------------
  // Get changed files in the PR diff
  // ------------------------------------------------------------------
  let prChangedFiles: string[] = [];
  try {
    const { stdout: diffOut } = await execAsync(
      `gh pr diff ${prNumber} --repo ${repository} --name-only`,
      { timeout: 30000 }
    );
    prChangedFiles = diffOut.trim().split('\n').filter(Boolean);
  } catch (diffErr) {
    logger.warn('[FormatRemediation] Could not get PR diff files', {
      prNumber,
      error: diffErr instanceof Error ? diffErr.message : String(diffErr),
    });
    return {
      status: 'error',
      prNumber,
      reason: `Could not determine PR changed files: ${diffErr instanceof Error ? diffErr.message : String(diffErr)}`,
      details: { guard: 'pr-diff-fetch' },
    };
  }

  if (prChangedFiles.length === 0) {
    return {
      status: 'skipped',
      prNumber,
      reason: 'Skipped: PR has no changed files.',
    };
  }

  // ------------------------------------------------------------------
  // Find the prettier binary
  // ------------------------------------------------------------------
  const prettierBin = path.join(projectPath, 'node_modules', '.bin', 'prettier');

  // ------------------------------------------------------------------
  // Determine working directory (prefer existing worktree, else checkout)
  // ------------------------------------------------------------------
  let workDir = worktreePath;
  let scratchDir: string | null = null;

  try {
    await execAsync(`test -d ${JSON.stringify(worktreePath)}`, { timeout: 3000 });
    logger.debug('[FormatRemediation] Using existing worktree', { worktreePath });
  } catch {
    // Worktree doesn't exist — checkout the PR branch to a scratch dir
    logger.info('[FormatRemediation] Worktree not found, checking out PR branch', { prNumber });
    try {
      scratchDir = await worker.createScratchDir();
      workDir = scratchDir;

      await execAsync(`gh pr checkout ${prNumber} --repo ${repository} --force`, {
        cwd: scratchDir,
        timeout: 60000,
      });
    } catch (checkoutErr) {
      if (scratchDir) await worker.cleanup(scratchDir);
      return {
        status: 'error',
        prNumber,
        reason: `Could not checkout PR branch: ${checkoutErr instanceof Error ? checkoutErr.message : String(checkoutErr)}`,
        details: { guard: 'branch-checkout' },
      };
    }
  }

  try {
    // ------------------------------------------------------------------
    // Run prettier on changed files
    // ------------------------------------------------------------------
    logger.info('[FormatRemediation] Running prettier', {
      prNumber,
      fileCount: prChangedFiles.length,
    });

    let filesFixed: string[];
    try {
      filesFixed = await worker.runPrettier(prettierBin, prChangedFiles, workDir);
    } catch (prettierErr) {
      const msg = prettierErr instanceof Error ? prettierErr.message : String(prettierErr);
      logger.error('[FormatRemediation] Prettier execution failed — escalating to HITL', {
        prNumber,
        error: msg,
      });
      return {
        status: 'escalated',
        prNumber,
        reason: `Prettier execution failed: ${msg}. Manual intervention required.`,
        details: { error: msg, guard: 'prettier-execution' },
      };
    }

    if (filesFixed.length === 0) {
      logger.info('[FormatRemediation] Prettier made no changes — nothing to commit', { prNumber });
      return {
        status: 'skipped',
        prNumber,
        reason: 'Prettier ran but made no changes. The formatting issue may have resolved itself.',
        details: { prChangedFiles },
      };
    }

    // ------------------------------------------------------------------
    // Scope check: verify prettier only touched files within the PR diff
    // ------------------------------------------------------------------
    const allModified = await worker.getModifiedFiles(workDir);
    const outOfScope = allModified.filter((f) => !prChangedFiles.includes(f));

    if (outOfScope.length > 0) {
      logger.warn('[FormatRemediation] Scope drift detected — escalating to HITL', {
        prNumber,
        outOfScope,
        prChangedFiles: prChangedFiles.length,
      });
      return {
        status: 'escalated',
        prNumber,
        reason:
          `Scope drift: prettier modified ${outOfScope.length} file(s) outside the PR diff. ` +
          `Escalating for operator review instead of auto-pushing. ` +
          `Out-of-scope files: ${outOfScope.slice(0, 5).join(', ')}`,
        details: {
          outOfScope,
          filesFixed,
          prChangedFiles,
          guard: 'scope-check',
        },
      };
    }

    // ------------------------------------------------------------------
    // Commit and push
    // ------------------------------------------------------------------
    let commitSha: string;
    try {
      commitSha = await worker.commitRemediationFix(workDir, prNumber, filesFixed);
    } catch (commitErr) {
      const msg = commitErr instanceof Error ? commitErr.message : String(commitErr);
      logger.error('[FormatRemediation] Commit failed — escalating to HITL', {
        prNumber,
        error: msg,
      });
      return {
        status: 'escalated',
        prNumber,
        reason: `Commit failed: ${msg}. Manual intervention required.`,
        details: { error: msg, filesFixed },
      };
    }

    try {
      await worker.pushBranch(workDir, headBranch);
    } catch (pushErr) {
      const msg = pushErr instanceof Error ? pushErr.message : String(pushErr);
      logger.error('[FormatRemediation] Push failed — escalating to HITL', {
        prNumber,
        headSha,
        error: msg,
      });
      return {
        status: 'escalated',
        prNumber,
        reason: `Push failed: ${msg}. The format fix was committed locally but not pushed.`,
        details: { error: msg, commitSha, filesFixed },
      };
    }

    // ------------------------------------------------------------------
    // Emit observability event
    // ------------------------------------------------------------------
    const eventPayload: PRFormatRemediatedPayload = {
      prNumber,
      filesFixed,
      commitSha,
      timestamp: new Date().toISOString(),
      remediationType: 'format',
    };

    if (events) {
      events.emit('pr:remediation-completed', eventPayload);
    }

    logger.info('[FormatRemediation:outcome] Success', {
      prNumber,
      filesFixed: filesFixed.length,
      commitSha,
    });

    return {
      status: 'success',
      prNumber,
      filesFixed,
      commitSha,
      reason: `Auto-remediation successful: formatted ${filesFixed.length} file(s) and pushed commit ${commitSha}.`,
      details: { filesFixed, baseBranch, headBranch },
    };
  } finally {
    if (scratchDir) {
      await worker.cleanup(scratchDir);
    }
  }
}
