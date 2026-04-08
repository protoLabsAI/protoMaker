/**
 * Git merge utilities for pre-flight worktree synchronization
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';

const execAsync = promisify(exec);
const logger = createLogger('GitMerge');

/**
 * Ensure the worktree is not stuck in an in-progress merge state.
 *
 * When a previous `git merge` fails with conflicts and `git merge --abort` is not
 * called (or fails silently), the worktree is left with MERGE_HEAD present and
 * unmerged index entries. Any subsequent `git merge` attempt will immediately fail
 * with "Merging is not possible because you have unmerged files." — producing a
 * recurring merge_conflict failure that is impossible to auto-recover from without
 * clearing the leftover state first.
 *
 * This function detects and resolves that stuck state before the caller proceeds
 * with a new merge attempt. It must be called before any `git stash` or `git merge`
 * operation, because `git stash` also refuses to operate on an index with unmerged
 * entries.
 *
 * @param worktreePath - Path to the worktree to check and clean
 */
export async function ensureCleanMergeState(worktreePath: string): Promise<void> {
  // `git rev-parse --verify MERGE_HEAD` exits 0 when MERGE_HEAD exists (merge in progress),
  // non-zero when it does not.  We only act when exit code is 0.
  try {
    await execAsync('git rev-parse --verify MERGE_HEAD', {
      cwd: worktreePath,
      timeout: 5_000,
    });
  } catch {
    // MERGE_HEAD does not exist — worktree is clean, nothing to do.
    return;
  }

  // MERGE_HEAD exists: a previous merge was left incomplete.
  logger.warn(
    `[ensureCleanMergeState] Detected in-progress merge in ${worktreePath} — attempting cleanup before next merge`
  );

  // First attempt: git merge --abort (cleans up MERGE_HEAD and restores the index)
  try {
    await execAsync('git merge --abort', { cwd: worktreePath, timeout: 15_000 });
    logger.info(`[ensureCleanMergeState] Aborted in-progress merge cleanly in ${worktreePath}`);
    return;
  } catch (abortError) {
    logger.warn(
      `[ensureCleanMergeState] git merge --abort failed in ${worktreePath}: ${abortError instanceof Error ? abortError.message : String(abortError)} — trying git reset --merge`
    );
  }

  // Second attempt: git reset --merge (resets index to HEAD, clears merge state,
  // preserves working-tree changes that are not involved in the merge)
  try {
    await execAsync('git reset --merge', { cwd: worktreePath, timeout: 15_000 });
    logger.info(
      `[ensureCleanMergeState] Cleared merge state via git reset --merge in ${worktreePath}`
    );
  } catch (resetError) {
    logger.error(
      `[ensureCleanMergeState] Failed to clear merge state in ${worktreePath}: ${resetError instanceof Error ? resetError.message : String(resetError)}`
    );
    // Surface the failure — callers may still attempt the merge, but they now know about it.
  }
}

/**
 * Result of a merge operation
 */
export interface RebaseResult {
  /** Whether the merge was successful */
  success: boolean;
  /** Error message if merge failed */
  error?: string;
  /** Whether conflicts were detected */
  hasConflicts?: boolean;
  /** List of files with merge conflicts (populated when hasConflicts is true) */
  conflictingFiles?: string[];
}

/**
 * Merge a worktree with the latest origin/main
 * This ensures agents execute against up-to-date code when PRs merge in quick succession.
 * Uses merge instead of rebase to handle concurrent .automaker/ modifications gracefully.
 *
 * @param worktreePath - Path to the worktree to merge
 * @param targetBranch - Target branch to merge from (default: 'origin/main')
 * @returns RebaseResult indicating success/failure
 */
export async function rebaseWorktreeOnMain(
  worktreePath: string,
  targetBranch: string = 'origin/main'
): Promise<RebaseResult> {
  try {
    // Step 0: Ensure no in-progress merge is left over from a previous failed attempt.
    // Must run before stash and before the merge itself — git stash refuses to operate
    // on an index with unmerged entries.
    await ensureCleanMergeState(worktreePath);

    // Step 1: Fetch latest remote state
    logger.info(`Fetching latest remote state for worktree: ${worktreePath}`);
    try {
      await execAsync('git fetch origin', {
        cwd: worktreePath,
        timeout: 30_000,
      });
    } catch (fetchError) {
      // Fetch failure is non-critical - we'll try to merge anyway
      const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      logger.warn(`git fetch failed (continuing anyway): ${errorMsg}`);
    }

    // Step 1b: Stash any uncommitted changes before merging.
    // git merge refuses to run when there are unstaged/uncommitted changes, producing
    // "cannot merge: You have unstaged changes." — which caused spurious merge_conflict
    // failures in the friction tracker.  Stashing before and popping after is the
    // standard git idiom for this situation.
    let stashRef: string | null = null;
    try {
      const { stdout: statusOut } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
        timeout: 10_000,
      });
      if (statusOut.trim()) {
        const fileCount = statusOut.trim().split('\n').length;
        logger.info(`Stashing ${fileCount} uncommitted file(s) before merge in ${worktreePath}`);
        const { stdout: stashOut } = await execAsync(
          'git stash push -m "automaker: pre-merge stash"',
          { cwd: worktreePath, timeout: 30_000 }
        );
        // git stash push prints "No local changes to save" when there is nothing to stash
        // (can happen for untracked-only trees).  Only record a ref when it actually stashed.
        if (!stashOut.includes('No local changes to save')) {
          const { stdout: listOut } = await execAsync('git stash list --format="%gd" -1', {
            cwd: worktreePath,
            timeout: 10_000,
          });
          stashRef = listOut.trim() || 'stash@{0}';
          logger.info(`Stashed uncommitted changes at ${stashRef} in ${worktreePath}`);
        }
      }
    } catch (stashError) {
      // Non-critical — proceed without stashing; the merge may still succeed or
      // produce an informative conflict error.
      const errorMsg = stashError instanceof Error ? stashError.message : String(stashError);
      logger.warn(`git stash failed (continuing anyway): ${errorMsg}`);
    }

    // Step 2: Attempt merge with target branch
    logger.info(`Merging worktree with ${targetBranch}: ${worktreePath}`);
    let mergeSuccess = false;
    let mergeResult: RebaseResult;

    try {
      const { stdout, stderr } = await execAsync(`git merge ${targetBranch}`, {
        cwd: worktreePath,
        timeout: 60_000,
      });

      // Check if merge output indicates "Already up to date"
      const output = stdout + stderr;
      if (output.includes('Already up to date') || output.includes('is up to date')) {
        logger.info(`Worktree already up to date: ${worktreePath}`);
      } else {
        logger.info(`Successfully merged worktree with ${targetBranch}: ${worktreePath}`);
      }

      mergeSuccess = true;
      mergeResult = { success: true };
    } catch (mergeError) {
      const errorMsg = mergeError instanceof Error ? mergeError.message : String(mergeError);

      // Check if this is a conflict error
      const hasConflicts =
        errorMsg.includes('conflict') ||
        errorMsg.includes('CONFLICT') ||
        errorMsg.includes('needs merge');

      if (hasConflicts) {
        logger.warn(
          `Merge conflicts detected in ${worktreePath}, aborting merge. Agent will proceed on stale base.`
        );

        // Capture conflicting files before aborting so callers can include them in diagnostics
        let conflictingFiles: string[] = [];
        try {
          const { stdout: conflictOutput } = await execAsync(
            'git diff --name-only --diff-filter=U',
            { cwd: worktreePath, timeout: 10_000 }
          );
          conflictingFiles = conflictOutput
            .split('\n')
            .map((f) => f.trim())
            .filter(Boolean);
        } catch {
          // Non-critical — best-effort file list
        }

        // Abort the merge to return worktree to clean state
        try {
          await execAsync('git merge --abort', {
            cwd: worktreePath,
            timeout: 30_000,
          });
          logger.info(`Aborted merge cleanly for ${worktreePath}`);
        } catch (abortError) {
          logger.error(
            `Failed to abort merge for ${worktreePath}:`,
            abortError instanceof Error ? abortError.message : String(abortError)
          );
        }

        mergeResult = {
          success: false,
          error: 'Merge conflicts detected',
          hasConflicts: true,
          conflictingFiles,
        };
      } else {
        // Other merge errors (not conflicts)
        logger.warn(`Merge failed for ${worktreePath}: ${errorMsg}`);
        mergeResult = {
          success: false,
          error: errorMsg,
          hasConflicts: false,
        };
      }
    }

    // Step 3: Restore stashed changes (if any were stashed)
    if (stashRef) {
      try {
        await execAsync(`git stash pop ${stashRef}`, {
          cwd: worktreePath,
          timeout: 30_000,
        });
        logger.info(`Restored stashed changes from ${stashRef} in ${worktreePath}`);
      } catch (popError) {
        // If the stash pop conflicts (stashed changes conflict with merge result),
        // log a warning but don't override the merge result — the merge itself succeeded.
        const errorMsg = popError instanceof Error ? popError.message : String(popError);
        logger.warn(
          `git stash pop failed after merge in ${worktreePath} (stash preserved at ${stashRef}): ${errorMsg}`
        );
        if (mergeSuccess) {
          // Surface the stash-pop conflict so callers are aware
          mergeResult = {
            success: true,
            error: `Merge succeeded but stash pop conflicted — stash preserved at ${stashRef}: ${errorMsg}`,
          };
        }
      }
    }

    return mergeResult;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Unexpected error during merge for ${worktreePath}:`, errorMsg);
    return {
      success: false,
      error: errorMsg,
      hasConflicts: false,
    };
  }
}
