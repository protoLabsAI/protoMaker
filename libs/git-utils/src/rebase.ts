/**
 * Git merge utilities for pre-flight worktree synchronization
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';

const execAsync = promisify(exec);
const logger = createLogger('GitMerge');

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

    // Step 2: Attempt merge with target branch
    logger.info(`Merging worktree with ${targetBranch}: ${worktreePath}`);
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

      return { success: true };
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

        return {
          success: false,
          error: 'Merge conflicts detected',
          hasConflicts: true,
          conflictingFiles,
        };
      }

      // Other merge errors (not conflicts)
      logger.warn(`Merge failed for ${worktreePath}: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        hasConflicts: false,
      };
    }
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
