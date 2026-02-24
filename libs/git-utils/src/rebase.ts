/**
 * Git rebase utilities
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabs-ai/utils';

const execAsync = promisify(exec);
const logger = createLogger('GitRebase');

/**
 * Result of a rebase operation
 */
export interface RebaseResult {
  /** Whether the rebase was successful */
  success: boolean;
  /** Error message if rebase failed */
  error?: string;
  /** Whether conflicts were detected */
  hasConflicts?: boolean;
}

/**
 * Rebase a worktree onto the latest origin/main
 * This ensures agents execute against up-to-date code when PRs merge in quick succession
 *
 * @param worktreePath - Path to the worktree to rebase
 * @param targetBranch - Target branch to rebase onto (default: 'origin/main')
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
      // Fetch failure is non-critical - we'll try to rebase anyway
      const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      logger.warn(`git fetch failed (continuing anyway): ${errorMsg}`);
    }

    // Step 2: Attempt rebase onto target branch
    logger.info(`Rebasing worktree onto ${targetBranch}: ${worktreePath}`);
    try {
      const { stdout, stderr } = await execAsync(`git rebase ${targetBranch}`, {
        cwd: worktreePath,
        timeout: 60_000,
      });

      // Check if rebase output indicates "Already up to date"
      const output = stdout + stderr;
      if (output.includes('is up to date') || output.includes('Current branch')) {
        logger.info(`Worktree already up to date: ${worktreePath}`);
      } else {
        logger.info(`Successfully rebased worktree onto ${targetBranch}: ${worktreePath}`);
      }

      return { success: true };
    } catch (rebaseError) {
      const errorMsg = rebaseError instanceof Error ? rebaseError.message : String(rebaseError);

      // Check if this is a conflict error
      const hasConflicts =
        errorMsg.includes('conflict') ||
        errorMsg.includes('CONFLICT') ||
        errorMsg.includes('needs merge');

      if (hasConflicts) {
        logger.warn(
          `Rebase conflicts detected in ${worktreePath}, aborting rebase. Agent will proceed on stale base.`
        );

        // Abort the rebase to return worktree to clean state
        try {
          await execAsync('git rebase --abort', {
            cwd: worktreePath,
            timeout: 30_000,
          });
          logger.info(`Aborted rebase cleanly for ${worktreePath}`);
        } catch (abortError) {
          logger.error(
            `Failed to abort rebase for ${worktreePath}:`,
            abortError instanceof Error ? abortError.message : String(abortError)
          );
        }

        return {
          success: false,
          error: 'Rebase conflicts detected',
          hasConflicts: true,
        };
      }

      // Other rebase errors (not conflicts)
      logger.warn(`Rebase failed for ${worktreePath}: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        hasConflicts: false,
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Unexpected error during rebase for ${worktreePath}:`, errorMsg);
    return {
      success: false,
      error: errorMsg,
      hasConflicts: false,
    };
  }
}
