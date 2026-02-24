/**
 * Git merge detection utilities
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabs-ai/utils';

const execAsync = promisify(exec);
const logger = createLogger('GitMerge');

/**
 * Check if a branch has been merged into a target branch
 * @param repoPath - Path to git repository
 * @param branchName - Branch to check
 * @param targetBranch - Target branch (default: 'main')
 * @returns true if branch has been merged
 */
export async function isBranchMerged(
  repoPath: string,
  branchName: string,
  targetBranch: string = 'main'
): Promise<boolean> {
  try {
    // First check if the branch exists
    try {
      await execAsync(`git rev-parse --verify ${branchName}`, { cwd: repoPath });
    } catch {
      // Branch doesn't exist - could have been deleted after merge
      // Check if commits from this branch exist in target
      return false;
    }

    // Check if target branch exists
    try {
      await execAsync(`git rev-parse --verify ${targetBranch}`, { cwd: repoPath });
    } catch {
      // Target branch doesn't exist
      logger.warn(`Target branch ${targetBranch} does not exist in ${repoPath}`);
      return false;
    }

    // Use git merge-base to check if branch is an ancestor of target
    // This works even if the branch was squash-merged or deleted
    const { stdout: mergeBase } = await execAsync(`git merge-base ${branchName} ${targetBranch}`, {
      cwd: repoPath,
    });

    const { stdout: branchHead } = await execAsync(`git rev-parse ${branchName}`, {
      cwd: repoPath,
    });

    const mergeBaseHash = mergeBase.trim();
    const branchHash = branchHead.trim();

    // If merge-base equals the branch head, the branch is fully merged
    if (mergeBaseHash === branchHash) {
      return true;
    }

    // Additional check: see if all commits from branch are in target
    // This handles squash merges where commit hashes change
    const { stdout: commitsNotInTarget } = await execAsync(
      `git log ${branchName} --not ${targetBranch} --oneline`,
      { cwd: repoPath }
    );

    // If no commits from branch are missing in target, it's merged
    return commitsNotInTarget.trim() === '';
  } catch (error) {
    logger.error(`Error checking if branch ${branchName} is merged:`, error);
    return false;
  }
}

/**
 * Check if commits from a branch exist on the target branch
 * This is useful when the branch has been deleted but we want to verify
 * if the work was merged
 * @param repoPath - Path to git repository
 * @param commitSha - Commit SHA to check
 * @param targetBranch - Target branch (default: 'main')
 * @returns true if commit exists on target branch
 */
export async function isCommitOnBranch(
  repoPath: string,
  commitSha: string,
  targetBranch: string = 'main'
): Promise<boolean> {
  try {
    // Check if target branch exists
    try {
      await execAsync(`git rev-parse --verify ${targetBranch}`, { cwd: repoPath });
    } catch {
      logger.warn(`Target branch ${targetBranch} does not exist in ${repoPath}`);
      return false;
    }

    // Check if commit exists in repo
    try {
      await execAsync(`git cat-file -t ${commitSha}`, { cwd: repoPath });
    } catch {
      // Commit doesn't exist
      return false;
    }

    // Check if commit is reachable from target branch
    try {
      await execAsync(`git merge-base --is-ancestor ${commitSha} ${targetBranch}`, {
        cwd: repoPath,
      });
      return true;
    } catch {
      return false;
    }
  } catch (error) {
    logger.error(`Error checking if commit ${commitSha} is on ${targetBranch}:`, error);
    return false;
  }
}

/**
 * Get the latest commit SHA for a branch
 * @param repoPath - Path to git repository
 * @param branchName - Branch name
 * @returns Commit SHA or null if branch doesn't exist
 */
export async function getBranchHeadCommit(
  repoPath: string,
  branchName: string
): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`git rev-parse ${branchName}`, { cwd: repoPath });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Check if a branch exists locally
 * @param repoPath - Path to git repository
 * @param branchName - Branch name
 * @returns true if branch exists
 */
export async function branchExists(repoPath: string, branchName: string): Promise<boolean> {
  try {
    await execAsync(`git rev-parse --verify ${branchName}`, { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}
