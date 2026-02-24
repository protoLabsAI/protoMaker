/**
 * Worktree Guard - Ensures worktree is in a clean state before verification
 *
 * This utility checks for uncommitted changes in a worktree and auto-commits them
 * before marking a feature as verified. This prevents loss of agent progress and
 * ensures all work is properly tracked in git history.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabs-ai/utils';

const execAsync = promisify(exec);
const logger = createLogger('WorktreeGuard');

/**
 * Ensure worktree is clean by auto-committing any uncommitted changes
 *
 * @param worktreePath - Absolute path to the worktree
 * @param featureId - Feature ID for logging context
 * @returns Promise that resolves when worktree is clean (or was already clean).
 *          Best-effort: logs a warning and continues if git commands fail.
 */
export async function ensureCleanWorktree(worktreePath: string, featureId: string): Promise<void> {
  try {
    // Check for uncommitted changes using git status --porcelain
    const { stdout: statusOutput } = await execAsync('git status --porcelain', {
      cwd: worktreePath,
    });

    // If output is empty, worktree is already clean
    if (!statusOutput.trim()) {
      logger.info(`Worktree is clean for feature ${featureId}`);
      return;
    }

    // Uncommitted changes detected - log and auto-commit
    logger.warn(
      `Uncommitted changes detected in worktree for feature ${featureId}, auto-committing...`
    );
    logger.debug(`Uncommitted changes:\n${statusOutput}`);

    // Stage all changes
    await execAsync('git add -A', { cwd: worktreePath });

    // Commit with standard message
    await execAsync('git commit -m "chore: auto-commit agent progress before verification"', {
      cwd: worktreePath,
    });

    logger.info(`Successfully auto-committed changes for feature ${featureId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Don't throw — the guard is best-effort. Failing here should not block
    // the verified transition (e.g. in test/mock environments without real git repos).
    logger.warn(`Could not ensure clean worktree for feature ${featureId}: ${errorMessage}`);
  }
}
