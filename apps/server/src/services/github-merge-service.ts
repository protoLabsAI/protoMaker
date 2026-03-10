/**
 * GitHub Merge Service - Handles PR merging via GitHub API/CLI
 *
 * Provides functionality to merge pull requests with different strategies,
 * wait for CI checks, and handle merge conflicts.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import type { PRMergeStrategy } from '@protolabsai/types';
import { createGitExecEnv } from '@protolabsai/git-utils';

const execAsync = promisify(exec);
const logger = createLogger('GitHubMerge');

const execEnv = createGitExecEnv();

/**
 * Check if gh CLI is available on the system
 */
async function isGhCliAvailable(): Promise<boolean> {
  try {
    const checkCommand = process.platform === 'win32' ? 'where gh' : 'command -v gh';
    await execAsync(checkCommand, { env: execEnv });
    return true;
  } catch {
    return false;
  }
}

/**
 * PR check status information
 */
interface PRCheckStatus {
  /** Whether all required checks have passed */
  allChecksPassed: boolean;
  /** Number of checks that passed */
  passedCount: number;
  /** Number of checks that failed */
  failedCount: number;
  /** Number of checks still pending */
  pendingCount: number;
  /** List of failed check names */
  failedChecks: string[];
}

/**
 * PR merge result
 */
export interface PRMergeResult {
  /** Whether the PR was successfully merged (or auto-merge enabled) */
  success: boolean;
  /** Commit SHA of the merge commit (if successful) */
  mergeCommitSha?: string;
  /** Error message if merge failed */
  error?: string;
  /** Whether auto-merge was enabled (waiting for CI to pass) */
  autoMergeEnabled?: boolean;
  /** Whether merge failed due to pending CI checks */
  checksPending?: boolean;
  /** Whether merge failed due to failed CI checks */
  checksFailed?: boolean;
  /** List of failed check names */
  failedChecks?: string[];
}

export class GitHubMergeService {
  /**
   * Check the status of CI checks for a PR
   */
  async checkPRStatus(workDir: string, prNumber: number): Promise<PRCheckStatus> {
    try {
      // Use gh CLI to get PR check status
      const { stdout } = await execAsync(`gh pr view ${prNumber} --json statusCheckRollup`, {
        cwd: workDir,
        env: execEnv,
      });

      const data = JSON.parse(stdout);
      const checks = data.statusCheckRollup || [];

      let passedCount = 0;
      let failedCount = 0;
      let pendingCount = 0;
      const failedChecks: string[] = [];

      for (const check of checks) {
        const status = check.status?.toLowerCase();
        const conclusion = check.conclusion?.toLowerCase();

        if (status === 'completed') {
          // Detect CodeRabbit FAILURE — treat as transient pending rather than a hard failure.
          // CodeRabbit commonly sets commit status to FAILURE when rate-limited by simultaneous
          // batch PRs. Counting it as a real failure would block merge unnecessarily.
          const checkIdentifier = (check.name ?? check.context ?? '').toLowerCase();
          if (checkIdentifier.includes('coderabbit') && conclusion === 'failure') {
            logger.warn(
              `[CodeRabbit] FAILURE status on '${check.name ?? check.context}' — ` +
                `treating as transient pending (possible rate-limit). Will not count as hard failure.`
            );
            pendingCount++;
            continue;
          }

          if (conclusion === 'success' || conclusion === 'neutral' || conclusion === 'skipped') {
            passedCount++;
          } else {
            failedCount++;
            failedChecks.push(check.name || 'Unknown check');
          }
        } else {
          pendingCount++;
        }
      }

      const allChecksPassed = failedCount === 0 && pendingCount === 0;

      return {
        allChecksPassed,
        passedCount,
        failedCount,
        pendingCount,
        failedChecks,
      };
    } catch (error) {
      logger.error(`Failed to check PR status: ${error}`);
      // Return default status if check fails
      return {
        allChecksPassed: false,
        passedCount: 0,
        failedCount: 0,
        pendingCount: 0,
        failedChecks: [],
      };
    }
  }

  /**
   * Merge a pull request using gh CLI
   *
   * @param workDir - Working directory (worktree or project path)
   * @param prNumber - PR number to merge
   * @param strategy - Merge strategy (merge, squash, rebase)
   * @param waitForCI - Whether to wait for CI checks to pass
   * @returns Merge result with success status and merge commit SHA
   */
  async mergePR(
    workDir: string,
    prNumber: number,
    strategy: PRMergeStrategy = 'squash',
    waitForCI: boolean = true
  ): Promise<PRMergeResult> {
    // Check if gh CLI is available
    const ghAvailable = await isGhCliAvailable();
    if (!ghAvailable) {
      logger.warn('gh CLI not available, cannot merge PR');
      return {
        success: false,
        error: 'gh CLI not available',
      };
    }

    // Check CI status first if required
    if (waitForCI) {
      const checkStatus = await this.checkPRStatus(workDir, prNumber);

      if (checkStatus.pendingCount > 0) {
        // CI is still running — enable auto-merge so GitHub merges once checks pass
        logger.info(
          `PR #${prNumber} has ${checkStatus.pendingCount} pending checks, enabling auto-merge`
        );
        try {
          let autoMergeCmd = `gh pr merge ${prNumber}`;
          switch (strategy) {
            case 'merge':
              autoMergeCmd += ' --merge';
              break;
            case 'squash':
              autoMergeCmd += ' --squash';
              break;
            case 'rebase':
              autoMergeCmd += ' --rebase';
              break;
          }
          autoMergeCmd += ' --auto';
          await execAsync(autoMergeCmd, { cwd: workDir, env: execEnv });
          logger.info(`Auto-merge enabled for PR #${prNumber}, will merge when checks pass`);
          return {
            success: true,
            autoMergeEnabled: true,
            checksPending: true,
          };
        } catch (autoMergeError) {
          const errMsg =
            autoMergeError instanceof Error ? autoMergeError.message : String(autoMergeError);
          logger.warn(`Failed to enable auto-merge for PR #${prNumber}: ${errMsg}`);
          return {
            success: false,
            error: `${checkStatus.pendingCount} checks still pending, auto-merge failed: ${errMsg}`,
            checksPending: true,
          };
        }
      }

      if (checkStatus.failedCount > 0) {
        logger.warn(
          `PR #${prNumber} has ${checkStatus.failedCount} failed checks: ${checkStatus.failedChecks.join(', ')}`
        );
        return {
          success: false,
          error: `${checkStatus.failedCount} checks failed: ${checkStatus.failedChecks.join(', ')}`,
          checksFailed: true,
          failedChecks: checkStatus.failedChecks,
        };
      }

      logger.info(`All CI checks passed for PR #${prNumber}, proceeding with merge`);
    }

    try {
      // Build merge command based on strategy
      let mergeCmd = `gh pr merge ${prNumber}`;

      // Add strategy flag
      switch (strategy) {
        case 'merge':
          mergeCmd += ' --merge';
          break;
        case 'squash':
          mergeCmd += ' --squash';
          break;
        case 'rebase':
          mergeCmd += ' --rebase';
          break;
      }

      // Auto-confirm the merge
      mergeCmd += ' --auto';

      logger.info(`Merging PR #${prNumber} with strategy: ${strategy}`);
      const { stdout } = await execAsync(mergeCmd, {
        cwd: workDir,
        env: execEnv,
      });

      // Extract merge commit SHA from output if available
      // gh CLI output typically includes the merge commit SHA
      const shaMatch = stdout.match(/[0-9a-f]{40}/i);
      const mergeCommitSha = shaMatch ? shaMatch[0].substring(0, 8) : undefined;

      // Verify the PR is actually merged by checking its state
      // The --auto flag can enable auto-merge without immediately merging
      logger.debug(`Verifying PR #${prNumber} state after merge command`);
      const { stdout: prStateJson } = await execAsync(`gh pr view ${prNumber} --json state`, {
        cwd: workDir,
        env: execEnv,
      });

      const prData = JSON.parse(prStateJson);
      const prState = prData.state?.toUpperCase();

      if (prState === 'MERGED') {
        logger.info(`Successfully merged PR #${prNumber}`);
        return {
          success: true,
          mergeCommitSha,
        };
      } else if (prState === 'OPEN') {
        // PR is still open - auto-merge was enabled but not merged yet
        // Return success: false to prevent false confidence that the PR landed
        logger.warn(
          `PR #${prNumber} is still OPEN after merge command - auto-merge may be enabled but PR is not merged`
        );
        return {
          success: false,
          error:
            'PR merge command succeeded but PR is still OPEN. Auto-merge may be enabled, waiting for checks to pass.',
          autoMergeEnabled: true,
        };
      } else {
        // Unexpected state (CLOSED without merge?)
        logger.warn(`PR #${prNumber} is in unexpected state: ${prState}`);
        return {
          success: false,
          error: `PR is in unexpected state: ${prState}`,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to merge PR #${prNumber}: ${errorMsg}`);

      // Check if error is due to merge conflicts
      if (errorMsg.toLowerCase().includes('conflict')) {
        return {
          success: false,
          error: 'Merge conflict detected - manual resolution required',
        };
      }

      // Check if error is due to not mergeable
      if (errorMsg.toLowerCase().includes('not mergeable')) {
        return {
          success: false,
          error: 'PR is not in a mergeable state',
        };
      }

      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Check if a PR can be merged (no conflicts, CI passed if required)
   *
   * @param workDir - Working directory
   * @param prNumber - PR number to check
   * @param waitForCI - Whether to check CI status
   * @returns Whether the PR can be merged
   */
  async canMergePR(
    workDir: string,
    prNumber: number,
    waitForCI: boolean = true
  ): Promise<{ canMerge: boolean; reason?: string }> {
    try {
      // Get PR status
      const { stdout } = await execAsync(
        `gh pr view ${prNumber} --json mergeable,statusCheckRollup`,
        {
          cwd: workDir,
          env: execEnv,
        }
      );

      const data = JSON.parse(stdout);

      // Check if mergeable
      if (data.mergeable !== 'MERGEABLE') {
        return {
          canMerge: false,
          reason: 'PR has merge conflicts or is not in a mergeable state',
        };
      }

      // Check CI status if required
      if (waitForCI) {
        const checks = data.statusCheckRollup || [];
        const pendingChecks = checks.filter(
          (c: { status: string }) => c.status?.toLowerCase() !== 'completed'
        );
        const failedChecks = checks.filter(
          (c: { conclusion: string }) =>
            c.conclusion?.toLowerCase() !== 'success' &&
            c.conclusion?.toLowerCase() !== 'neutral' &&
            c.conclusion?.toLowerCase() !== 'skipped'
        );

        if (pendingChecks.length > 0) {
          return {
            canMerge: false,
            reason: `${pendingChecks.length} CI checks still pending`,
          };
        }

        if (failedChecks.length > 0) {
          return {
            canMerge: false,
            reason: `${failedChecks.length} CI checks failed`,
          };
        }
      }

      return { canMerge: true };
    } catch (error) {
      logger.error(`Failed to check if PR #${prNumber} can be merged: ${error}`);
      return {
        canMerge: false,
        reason: 'Failed to check PR status',
      };
    }
  }
}

// Export singleton instance
export const githubMergeService = new GitHubMergeService();
