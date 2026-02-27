/**
 * Worktree Guard - Ensures worktree is in a clean state before verification
 *
 * This utility checks for uncommitted changes in a worktree and auto-commits them
 * before marking a feature as verified. This prevents loss of agent progress and
 * ensures all work is properly tracked in git history.
 */

import { exec } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { createLogger } from '@protolabs-ai/utils';

const execAsync = promisify(exec);
const logger = createLogger('WorktreeGuard');

/**
 * Builds a git add command that stages all changes except .automaker/,
 * then re-includes .automaker/memory/ and .automaker/skills/ only if those
 * directories exist in the working tree. This prevents a fatal pathspec error
 * when a directory is absent (e.g. in a fresh worktree).
 */
function buildGitAddCommand(workDir: string): string {
  const parts = ["git add -A -- ':!.automaker/'"];
  if (existsSync(join(workDir, '.automaker/memory'))) {
    parts.push("'.automaker/memory/'");
  }
  if (existsSync(join(workDir, '.automaker/skills'))) {
    parts.push("'.automaker/skills/'");
  }
  return parts.join(' ');
}

/**
 * Result of worktree cleanup operation
 */
export interface WorktreeGuardResult {
  /** Whether changes were committed */
  committed: boolean;
  /** Whether commits were pushed to remote */
  pushed: boolean;
  /** Error message if operation failed (non-blocking) */
  error?: string;
}

/**
 * Ensure worktree is clean by auto-committing and pushing any changes
 *
 * @param worktreePath - Absolute path to the worktree
 * @param featureId - Feature ID for logging context
 * @param branchName - Branch name to push to remote
 * @returns Promise that resolves with result indicating what happened.
 *          Best-effort: logs errors but doesn't throw, allowing verification to proceed.
 */
export async function ensureCleanWorktree(
  worktreePath: string,
  featureId: string,
  branchName: string
): Promise<WorktreeGuardResult> {
  const result: WorktreeGuardResult = {
    committed: false,
    pushed: false,
  };

  try {
    // Check for uncommitted changes using git status --porcelain
    const { stdout: statusOutput } = await execAsync('git status --porcelain', {
      cwd: worktreePath,
    });

    // If there are uncommitted changes, commit them
    if (statusOutput.trim()) {
      // Uncommitted changes detected - log and auto-commit
      logger.warn(
        `Uncommitted changes detected in worktree for feature ${featureId}, auto-committing...`
      );
      logger.debug(`Uncommitted changes:\n${statusOutput}`);

      // Stage all changes - exclude .automaker/ except memory/ and skills/ (if they exist).
      const guardEnv = { ...process.env, HUSKY: '0' };
      await execAsync(buildGitAddCommand(worktreePath), {
        cwd: worktreePath,
        env: guardEnv,
      });

      // Skip commit if nothing was staged (e.g. only non-committable files changed)
      const { stdout: cachedDiff } = await execAsync('git diff --cached --name-only', {
        cwd: worktreePath,
        env: guardEnv,
      });
      if (!cachedDiff.trim()) {
        logger.info(`Nothing staged after add for feature ${featureId}, skipping commit`);
        return result;
      }

      // Commit with --no-verify to bypass husky hooks in the worktree
      await execAsync(
        'git commit --no-verify -m "chore: auto-commit agent progress before verification"',
        { cwd: worktreePath, env: guardEnv }
      );

      result.committed = true;
      logger.info(`Successfully auto-committed changes for feature ${featureId}`);
    }

    // Check for unpushed commits
    const { stdout: unpushedOutput } = await execAsync(
      `git log origin/${branchName}..HEAD --oneline`,
      {
        cwd: worktreePath,
      }
    );

    // If there are unpushed commits, push them
    if (unpushedOutput.trim()) {
      logger.info(
        `Unpushed commits detected for feature ${featureId}, pushing to origin/${branchName}...`
      );
      logger.debug(`Unpushed commits:\n${unpushedOutput}`);

      try {
        await execAsync(`git push origin ${branchName}`, {
          cwd: worktreePath,
        });

        result.pushed = true;
        logger.info(`Successfully pushed commits for feature ${featureId}`);
      } catch (pushError) {
        const pushErrorMessage = pushError instanceof Error ? pushError.message : String(pushError);
        // Push failures are visible but non-blocking
        logger.error(
          `Failed to push commits for feature ${featureId}: ${pushErrorMessage}. Verification will proceed anyway.`
        );
        result.error = `Push failed: ${pushErrorMessage}`;
      }
    }

    // If nothing was committed or pushed, log that worktree was already clean
    if (!result.committed && !result.pushed) {
      logger.info(`Worktree is clean for feature ${featureId}`);
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Don't throw — the guard is best-effort. Failing here should not block
    // the verified transition (e.g. in test/mock environments without real git repos).
    logger.warn(`Could not ensure clean worktree for feature ${featureId}: ${errorMessage}`);
    result.error = errorMessage;
    return result;
  }
}
