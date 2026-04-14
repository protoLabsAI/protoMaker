/**
 * Startup Recovery Service
 *
 * Safety-checks in-progress features before auto-resuming them on server restart.
 * Prevents duplicate commits, double PR creation, and conflicting git state by
 * classifying each in-progress feature into one of five restart outcomes:
 *
 *   1. SKIP_HAS_PR     – feature has a live open PR → leave as in_progress, do not spawn agent
 *   2. SAFE_TO_RESUME  – worktree exists with commits ahead of base → safe to continue
 *   3. AUTO_RECOVERED  – dirty worktree was auto-recovered: WIP committed to recovery/ branch
 *   4. RESET_DIRTY     – unrecoverable (merge conflicts or no branch) → escalate to HITL
 *   5. RESTART_FRESH   – no worktree and no commits → safe to start fresh
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';

const execAsync = promisify(exec);
const logger = createLogger('StartupRecoveryService');

export type RestartOutcome =
  | 'SKIP_HAS_PR'
  | 'SAFE_TO_RESUME'
  | 'AUTO_RECOVERED'
  | 'RESET_DIRTY'
  | 'RESTART_FRESH';

export interface RestartCheckResult {
  featureId: string;
  outcome: RestartOutcome;
  /** Human-readable reason, used as statusChangeReason when resetting to blocked */
  reason: string;
  /** Worktree path (if it exists) */
  worktreePath?: string;
  /** Recovery branch created when outcome is AUTO_RECOVERED */
  recoveryBranch?: string;
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
export async function isWorktreeDirty(worktreePath: string): Promise<boolean> {
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
 * Check whether the worktree has unresolved merge conflicts.
 * Returns true if any conflict markers (UU, AA, DD, etc.) are present.
 */
async function hasMergeConflicts(worktreePath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`git -C "${worktreePath}" status --porcelain`, {
      timeout: 5_000,
    });
    const conflictPrefixes = ['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD'];
    return stdout
      .split('\n')
      .filter(Boolean)
      .some((line) => conflictPrefixes.some((prefix) => line.startsWith(prefix)));
  } catch {
    // Cannot read status — assume conflicts to be safe
    return true;
  }
}

/**
 * Attempt to auto-recover a dirty worktree by committing all WIP to a
 * timestamped `recovery/` branch, then returning to the original branch.
 *
 * Steps:
 * 1. Stash uncommitted changes
 * 2. Create a new `recovery/<featureId>-<ts>` branch from current HEAD
 * 3. Pop the stash onto the recovery branch
 * 4. Stage + commit all changes (no-verify to bypass pre-commit hooks in worktrees)
 * 5. Push the recovery branch to origin (non-fatal)
 * 6. Return to the original branch (worktree is now clean)
 *
 * Returns the recovery branch name on success, or throws on failure.
 */
export async function recoverDirtyWorktree(
  worktreePath: string,
  branchName: string,
  featureId: string
): Promise<string> {
  const sanitized = featureId.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-');
  const recoveryBranch = `recovery/${sanitized}-${Date.now()}`;

  // Step 1: Stash uncommitted changes
  await execAsync(`git -C "${worktreePath}" stash --include-untracked`, { timeout: 15_000 });

  try {
    // Step 2: Create recovery branch from current HEAD
    await execAsync(`git -C "${worktreePath}" checkout -b "${recoveryBranch}"`, {
      timeout: 10_000,
    });

    // Step 3: Pop stash onto recovery branch
    await execAsync(`git -C "${worktreePath}" stash pop`, { timeout: 10_000 });

    // Step 4: Stage + commit
    await execAsync(`git -C "${worktreePath}" add -A`, { timeout: 10_000 });
    await execAsync(
      `git -C "${worktreePath}" commit --no-verify -m "recovery: WIP preserved on server restart"`,
      { timeout: 15_000 }
    );

    // Step 5: Push recovery branch (non-fatal)
    try {
      await execAsync(`git -C "${worktreePath}" push --no-verify origin "${recoveryBranch}"`, {
        timeout: 30_000,
      });
      logger.info(`[STARTUP-RECOVERY] Pushed recovery branch ${recoveryBranch} to origin`);
    } catch {
      // Non-fatal: remote may not be configured
      logger.warn(
        `[STARTUP-RECOVERY] Could not push recovery branch ${recoveryBranch} — continuing without remote backup`
      );
    }

    // Step 6: Return to original branch (worktree is now clean)
    await execAsync(`git -C "${worktreePath}" checkout "${branchName}"`, { timeout: 10_000 });

    logger.info(
      `[STARTUP-RECOVERY] Recovered dirty worktree for feature ${featureId}: WIP saved to ${recoveryBranch}`
    );
    return recoveryBranch;
  } catch (err) {
    // Best-effort: try to restore original branch state
    try {
      await execAsync(`git -C "${worktreePath}" checkout "${branchName}"`, { timeout: 10_000 });
    } catch {
      // Ignore — best-effort cleanup only
    }
    throw err;
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
    // 3. Dirty/conflicted worktree — attempt auto-recovery; escalate only if unrecoverable
    const dirty = await isWorktreeDirty(wtPath);
    if (dirty) {
      const branchName = feature.branchName;

      // Unrecoverable: no branch name → cannot safely commit WIP
      if (!branchName) {
        logger.warn(
          `[STARTUP-RECOVERY] Feature ${featureId} has a dirty worktree at ${wtPath} but no branchName — cannot auto-recover`
        );
        return {
          featureId,
          outcome: 'RESET_DIRTY',
          reason: 'Dirty worktree detected on restart — no branch name, cannot auto-recover',
          worktreePath: wtPath,
        };
      }

      // Unrecoverable: merge conflicts → cannot safely commit WIP
      const conflicts = await hasMergeConflicts(wtPath);
      if (conflicts) {
        logger.warn(
          `[STARTUP-RECOVERY] Feature ${featureId} has merge conflicts at ${wtPath} — cannot auto-recover`
        );
        return {
          featureId,
          outcome: 'RESET_DIRTY',
          reason: 'Dirty worktree detected on restart — merge conflicts require manual resolution',
          worktreePath: wtPath,
        };
      }

      // Recoverable: commit WIP to a recovery/ branch and return to original branch
      logger.info(
        `[STARTUP-RECOVERY] Feature ${featureId} has uncommitted changes at ${wtPath} — attempting auto-recovery`
      );
      try {
        const recoveryBranch = await recoverDirtyWorktree(wtPath, branchName, featureId);
        logger.info(
          `[STARTUP-RECOVERY] Feature ${featureId} auto-recovered: WIP saved to ${recoveryBranch}`
        );
        return {
          featureId,
          outcome: 'AUTO_RECOVERED',
          reason: `Uncommitted WIP preserved to ${recoveryBranch} — resuming on original branch`,
          worktreePath: wtPath,
          recoveryBranch,
        };
      } catch (recoveryErr) {
        const msg = recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr);
        logger.error(
          `[STARTUP-RECOVERY] Auto-recovery failed for feature ${featureId}: ${msg} — blocking`
        );
        return {
          featureId,
          outcome: 'RESET_DIRTY',
          reason: `Dirty worktree detected on restart — auto-recovery failed: ${msg}`,
          worktreePath: wtPath,
        };
      }
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
