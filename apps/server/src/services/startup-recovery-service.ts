/**
 * Startup Recovery Service
 *
 * Safety-checks in-progress features before auto-resuming them on server restart.
 * Prevents duplicate commits, double PR creation, and conflicting git state by
 * classifying each in-progress feature into one of four restart outcomes:
 *
 *   1. SKIP_HAS_PR     – feature has a live open PR → leave as in_progress, do not spawn agent
 *   2. SAFE_TO_RESUME  – worktree exists with commits ahead of base → safe to continue
 *   3. RESET_DIRTY     – worktree is dirty/conflicted → reset to blocked, manual intervention
 *   4. RESTART_FRESH   – no worktree and no commits → safe to start fresh
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';

const execAsync = promisify(exec);
const logger = createLogger('StartupRecoveryService');

export type RestartOutcome = 'SKIP_HAS_PR' | 'SAFE_TO_RESUME' | 'RESET_DIRTY' | 'RESTART_FRESH';

export interface RestartCheckResult {
  featureId: string;
  outcome: RestartOutcome;
  /** Human-readable reason, used as statusChangeReason when resetting to blocked */
  reason: string;
  /** Worktree path (if it exists) */
  worktreePath?: string;
}

/**
 * Derive the expected worktree path from a feature.
 * Mirrors the sanitisation logic used in AutoModeService.
 */
function deriveWorktreePath(projectPath: string, feature: Feature): string {
  // Prefer branchName-based path (mirrors createWorktreeForBranch)
  const name = feature.branchName || feature.id;
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${projectPath}/.worktrees/${sanitized}`;
}

/**
 * Check whether a GitHub PR number is still open.
 * Returns true if the PR is open, false otherwise (closed/merged/not found).
 * Silently returns false if gh CLI is unavailable or not authenticated.
 */
async function isPROpen(projectPath: string, prNumber: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`gh pr view ${prNumber} --json state --jq '.state'`, {
      cwd: projectPath,
      timeout: 10_000,
    });
    return stdout.trim().toUpperCase() === 'OPEN';
  } catch {
    // gh CLI not available or not authenticated — treat as unknown, don't block resumption
    logger.debug(`[STARTUP-RECOVERY] Could not check PR #${prNumber} state via gh CLI`);
    return false;
  }
}

/**
 * Check whether a worktree path exists on disk.
 */
async function worktreeExists(worktreePath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`git -C "${worktreePath}" rev-parse --is-inside-work-tree`, {
      timeout: 5_000,
    });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Count commits in worktree that are ahead of the given base branch.
 * Uses `git -C <path>` — never cd into the worktree.
 */
async function commitsAheadOfBase(worktreePath: string, baseBranch: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `git -C "${worktreePath}" rev-list --count HEAD ^${baseBranch}`,
      { timeout: 5_000 }
    );
    return parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Check whether the worktree has uncommitted changes or merge conflicts.
 * Returns true if dirty/conflicted.
 */
async function isWorktreeDirty(worktreePath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`git -C "${worktreePath}" status --porcelain`, {
      timeout: 5_000,
    });
    return stdout.trim().length > 0;
  } catch {
    // Cannot read status — assume dirty to be safe
    return true;
  }
}

/**
 * Run the full safety check for a single in-progress feature and return the
 * appropriate RestartOutcome.
 *
 * @param projectPath  Absolute path to the project root
 * @param feature      The Feature record in in_progress / interrupted status
 * @param baseBranch   The branch name to compare commits against (e.g. "dev" or "main")
 */
export async function checkFeatureRestartOutcome(
  projectPath: string,
  feature: Feature,
  baseBranch = 'main'
): Promise<RestartCheckResult> {
  const featureId = feature.id;

  // 1. Feature has a live PR → do NOT re-run the agent
  if (feature.prNumber) {
    const open = await isPROpen(projectPath, feature.prNumber);
    if (open) {
      logger.info(
        `[STARTUP-RECOVERY] Feature ${featureId} has open PR #${feature.prNumber} — skipping agent spawn`
      );
      return {
        featureId,
        outcome: 'SKIP_HAS_PR',
        reason: `PR #${feature.prNumber} is still open — agent will not be re-spawned`,
      };
    }
  }

  // Resolve the worktree path
  const wtPath = deriveWorktreePath(projectPath, feature);
  const wtExists = await worktreeExists(wtPath);

  if (wtExists) {
    // 3. Dirty/conflicted worktree → block, require manual intervention
    const dirty = await isWorktreeDirty(wtPath);
    if (dirty) {
      logger.warn(
        `[STARTUP-RECOVERY] Feature ${featureId} has a dirty worktree at ${wtPath} — blocking`
      );
      return {
        featureId,
        outcome: 'RESET_DIRTY',
        reason: 'Dirty worktree detected on restart — manual intervention required',
        worktreePath: wtPath,
      };
    }

    // 2. Worktree exists and is clean — check for commits ahead of base
    const ahead = await commitsAheadOfBase(wtPath, baseBranch);
    if (ahead > 0) {
      logger.info(
        `[STARTUP-RECOVERY] Feature ${featureId} has ${ahead} commit(s) ahead of ${baseBranch} — safe to resume`
      );
      return {
        featureId,
        outcome: 'SAFE_TO_RESUME',
        reason: `Worktree has ${ahead} commit(s) ahead of ${baseBranch}`,
        worktreePath: wtPath,
      };
    }

    // Worktree exists but is clean and has no commits ahead — treat as fresh start
    logger.info(
      `[STARTUP-RECOVERY] Feature ${featureId} worktree exists but has no commits ahead — restarting fresh`
    );
    return {
      featureId,
      outcome: 'RESTART_FRESH',
      reason: 'Worktree exists but has no commits ahead of base — starting fresh',
      worktreePath: wtPath,
    };
  }

  // 4. No worktree on disk → safe to start fresh
  logger.info(`[STARTUP-RECOVERY] Feature ${featureId} has no worktree — will restart fresh`);
  return {
    featureId,
    outcome: 'RESTART_FRESH',
    reason: 'No worktree found — starting fresh',
  };
}
