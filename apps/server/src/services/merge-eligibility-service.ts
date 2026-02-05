/**
 * Merge Eligibility Service - Evaluates if a PR can be auto-merged
 *
 * Checks GitHub PR status against configured auto-merge settings to determine
 * if a PR is ready for automatic merging.
 */

import { createLogger } from '@automaker/utils';
import type { AutoMergeSettings, AutoMergeCheckType } from '@automaker/types';
import { DEFAULT_AUTO_MERGE_SETTINGS } from '@automaker/types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const logger = createLogger('MergeEligibility');

// Extended PATH for finding gh CLI (same pattern as git-workflow-service)
const pathSeparator = process.platform === 'win32' ? ';' : ':';
const additionalPaths: string[] = [];

if (process.platform === 'win32') {
  if (process.env.LOCALAPPDATA) {
    additionalPaths.push(`${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`);
  }
  if (process.env.PROGRAMFILES) {
    additionalPaths.push(`${process.env.PROGRAMFILES}\\Git\\cmd`);
  }
  if (process.env['ProgramFiles(x86)']) {
    additionalPaths.push(`${process.env['ProgramFiles(x86)']}\\Git\\cmd`);
  }
} else {
  additionalPaths.push(
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/home/linuxbrew/.linuxbrew/bin',
    `${process.env.HOME}/.local/bin`
  );
}

const extendedPath = [process.env.PATH, ...additionalPaths.filter(Boolean)]
  .filter(Boolean)
  .join(pathSeparator);

const execEnv = {
  ...process.env,
  PATH: extendedPath,
};

/**
 * PRCheckStatus - Status of a single PR check
 */
export interface PRCheckStatus {
  /** Type of check */
  checkType: AutoMergeCheckType;
  /** Whether the check passed */
  passed: boolean;
  /** Details about the check result */
  details?: string;
}

/**
 * MergeEligibilityResult - Result of checking PR merge eligibility
 */
export interface MergeEligibilityResult {
  /** Whether the PR is eligible for auto-merge */
  eligible: boolean;
  /** Status of each required check */
  checks: PRCheckStatus[];
  /** Summary message explaining the result */
  summary: string;
  /** PR number that was evaluated */
  prNumber: number;
  /** Error message if evaluation failed */
  error?: string;
}

/**
 * PRDetails - Detailed PR information from GitHub API
 */
interface PRDetails {
  number: number;
  state: string;
  mergeable: boolean | null;
  mergeable_state: string;
  merged: boolean;
  statusCheckRollup?: Array<{
    context: string;
    state: string;
    conclusion?: string;
  }>;
  reviews?: Array<{
    state: string;
    author: { login: string };
  }>;
  reviewThreads?: {
    totalCount: number;
    nodes: Array<{
      isResolved: boolean;
    }>;
  };
  commits?: {
    nodes: Array<{
      commit: {
        statusCheckRollup?: {
          contexts: {
            nodes: Array<{
              context?: string;
              state?: string;
              conclusion?: string;
            }>;
          };
        };
      };
    }>;
  };
}

export class MergeEligibilityService {
  /**
   * Check if gh CLI is available
   */
  private async isGhCliAvailable(): Promise<boolean> {
    try {
      const checkCommand = process.platform === 'win32' ? 'where gh' : 'command -v gh';
      await execAsync(checkCommand, { env: execEnv });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get detailed PR information using GitHub GraphQL API via gh CLI
   */
  private async getPRDetails(
    workDir: string,
    prNumber: number,
    repo?: string
  ): Promise<PRDetails | null> {
    try {
      const repoFlag = repo ? ` --repo "${repo}"` : '';

      // Use gh pr view with JSON output to get comprehensive PR data
      const cmd = `gh pr view ${prNumber}${repoFlag} --json number,state,mergeable,mergeStateStatus,merged,statusCheckRollup,reviews,reviewThreads,commits`;

      const { stdout } = await execAsync(cmd, {
        cwd: workDir,
        env: execEnv,
      });

      const data = JSON.parse(stdout);

      return {
        number: data.number,
        state: data.state,
        mergeable: data.mergeable,
        mergeable_state: data.mergeStateStatus,
        merged: data.merged,
        statusCheckRollup: data.statusCheckRollup,
        reviews: data.reviews,
        reviewThreads: data.reviewThreads,
        commits: data.commits,
      };
    } catch (error) {
      logger.error(`Failed to get PR details for #${prNumber}:`, error);
      return null;
    }
  }

  /**
   * Check if CI/CD checks are passing
   */
  private checkCIPassing(prDetails: PRDetails): PRCheckStatus {
    const checkType: AutoMergeCheckType = 'ci_passing';

    // Check status check rollup
    if (prDetails.statusCheckRollup) {
      const failedChecks = prDetails.statusCheckRollup.filter(
        (check) =>
          check.state === 'FAILURE' ||
          check.state === 'ERROR' ||
          check.conclusion === 'FAILURE' ||
          check.conclusion === 'TIMED_OUT' ||
          check.conclusion === 'CANCELLED'
      );

      if (failedChecks.length > 0) {
        return {
          checkType,
          passed: false,
          details: `${failedChecks.length} CI check(s) failed: ${failedChecks.map((c) => c.context).join(', ')}`,
        };
      }

      const pendingChecks = prDetails.statusCheckRollup.filter(
        (check) => check.state === 'PENDING' || check.state === 'IN_PROGRESS'
      );

      if (pendingChecks.length > 0) {
        return {
          checkType,
          passed: false,
          details: `${pendingChecks.length} CI check(s) still pending`,
        };
      }
    }

    // Also check commits for status checks (more detailed)
    if (prDetails.commits?.nodes && prDetails.commits.nodes.length > 0) {
      const lastCommit = prDetails.commits.nodes[prDetails.commits.nodes.length - 1];
      const contexts = lastCommit.commit?.statusCheckRollup?.contexts?.nodes;

      if (contexts && contexts.length > 0) {
        const failedContexts = contexts.filter(
          (ctx) =>
            ctx.state === 'FAILURE' ||
            ctx.state === 'ERROR' ||
            ctx.conclusion === 'FAILURE' ||
            ctx.conclusion === 'TIMED_OUT'
        );

        if (failedContexts.length > 0) {
          return {
            checkType,
            passed: false,
            details: `CI checks failed on latest commit`,
          };
        }
      }
    }

    return {
      checkType,
      passed: true,
      details: 'All CI checks passed',
    };
  }

  /**
   * Check if PR has enough approving reviews
   */
  private checkReviewsApproved(
    prDetails: PRDetails,
    minApprovals: number
  ): PRCheckStatus {
    const checkType: AutoMergeCheckType = 'reviews_approved';

    if (!prDetails.reviews) {
      return {
        checkType,
        passed: minApprovals === 0,
        details: minApprovals === 0 ? 'No reviews required' : 'Review data not available',
      };
    }

    // Count unique approving reviewers (latest review per author)
    const latestReviewByAuthor = new Map<string, string>();
    for (const review of prDetails.reviews) {
      latestReviewByAuthor.set(review.author.login, review.state);
    }

    const approvalCount = Array.from(latestReviewByAuthor.values()).filter(
      (state) => state === 'APPROVED'
    ).length;

    return {
      checkType,
      passed: approvalCount >= minApprovals,
      details: `${approvalCount}/${minApprovals} required approvals`,
    };
  }

  /**
   * Check if PR has no outstanding change requests
   */
  private checkNoRequestedChanges(prDetails: PRDetails): PRCheckStatus {
    const checkType: AutoMergeCheckType = 'no_requested_changes';

    if (!prDetails.reviews) {
      return {
        checkType,
        passed: true,
        details: 'No change requests found',
      };
    }

    // Check for any CHANGES_REQUESTED reviews (latest per author)
    const latestReviewByAuthor = new Map<string, string>();
    for (const review of prDetails.reviews) {
      latestReviewByAuthor.set(review.author.login, review.state);
    }

    const changesRequestedCount = Array.from(latestReviewByAuthor.values()).filter(
      (state) => state === 'CHANGES_REQUESTED'
    ).length;

    return {
      checkType,
      passed: changesRequestedCount === 0,
      details:
        changesRequestedCount > 0
          ? `${changesRequestedCount} reviewer(s) requested changes`
          : 'No change requests',
    };
  }

  /**
   * Check if all review conversations are resolved
   */
  private checkConversationsResolved(prDetails: PRDetails): PRCheckStatus {
    const checkType: AutoMergeCheckType = 'conversations_resolved';

    if (!prDetails.reviewThreads) {
      return {
        checkType,
        passed: true,
        details: 'No review threads found',
      };
    }

    const totalThreads = prDetails.reviewThreads.totalCount;
    const unresolvedThreads = prDetails.reviewThreads.nodes.filter(
      (thread) => !thread.isResolved
    ).length;

    return {
      checkType,
      passed: unresolvedThreads === 0,
      details:
        unresolvedThreads > 0
          ? `${unresolvedThreads}/${totalThreads} review threads unresolved`
          : 'All review threads resolved',
    };
  }

  /**
   * Check if branch is up to date with base
   */
  private checkUpToDate(prDetails: PRDetails): PRCheckStatus {
    const checkType: AutoMergeCheckType = 'up_to_date';

    // GitHub's mergeable_state indicates if branch is behind base
    // Possible values: BEHIND, BLOCKED, CLEAN, DIRTY, DRAFT, HAS_HOOKS, UNKNOWN, UNSTABLE
    const state = prDetails.mergeable_state;

    if (state === 'BEHIND') {
      return {
        checkType,
        passed: false,
        details: 'Branch is behind base branch',
      };
    }

    if (state === 'CLEAN') {
      return {
        checkType,
        passed: true,
        details: 'Branch is up to date',
      };
    }

    // For other states, consider it up to date if mergeable
    return {
      checkType,
      passed: prDetails.mergeable === true,
      details: `Branch status: ${state}`,
    };
  }

  /**
   * Evaluate if a PR is eligible for auto-merge based on settings
   *
   * @param workDir - Working directory containing the repository
   * @param prNumber - PR number to check
   * @param settings - Auto-merge settings to evaluate against
   * @param repo - Optional repository in owner/repo format (for fork workflows)
   * @returns MergeEligibilityResult with eligibility status and check details
   */
  async evaluatePR(
    workDir: string,
    prNumber: number,
    settings: AutoMergeSettings = DEFAULT_AUTO_MERGE_SETTINGS,
    repo?: string
  ): Promise<MergeEligibilityResult> {
    // Check if gh CLI is available
    const ghAvailable = await this.isGhCliAvailable();
    if (!ghAvailable) {
      return {
        eligible: false,
        checks: [],
        summary: 'GitHub CLI (gh) not available',
        prNumber,
        error: 'gh CLI not installed or not in PATH',
      };
    }

    // Get PR details from GitHub
    const prDetails = await this.getPRDetails(workDir, prNumber, repo);
    if (!prDetails) {
      return {
        eligible: false,
        checks: [],
        summary: 'Failed to fetch PR details',
        prNumber,
        error: 'Could not retrieve PR information from GitHub',
      };
    }

    // Check if PR is already merged or closed
    if (prDetails.merged) {
      return {
        eligible: false,
        checks: [],
        summary: 'PR is already merged',
        prNumber,
      };
    }

    if (prDetails.state !== 'OPEN') {
      return {
        eligible: false,
        checks: [],
        summary: `PR is ${prDetails.state.toLowerCase()}`,
        prNumber,
      };
    }

    // Resolve settings with defaults
    const minApprovals = settings.minApprovals ?? DEFAULT_AUTO_MERGE_SETTINGS.minApprovals;
    const requiredChecks = settings.requiredChecks ?? DEFAULT_AUTO_MERGE_SETTINGS.requiredChecks;

    // Run all required checks
    const checks: PRCheckStatus[] = [];

    for (const checkType of requiredChecks) {
      let checkResult: PRCheckStatus;

      switch (checkType) {
        case 'ci_passing':
          checkResult = this.checkCIPassing(prDetails);
          break;
        case 'reviews_approved':
          checkResult = this.checkReviewsApproved(prDetails, minApprovals);
          break;
        case 'no_requested_changes':
          checkResult = this.checkNoRequestedChanges(prDetails);
          break;
        case 'conversations_resolved':
          checkResult = this.checkConversationsResolved(prDetails);
          break;
        case 'up_to_date':
          checkResult = this.checkUpToDate(prDetails);
          break;
        default:
          checkResult = {
            checkType,
            passed: false,
            details: `Unknown check type: ${checkType}`,
          };
      }

      checks.push(checkResult);
    }

    // Determine eligibility (all checks must pass)
    const eligible = checks.every((check) => check.passed);
    const failedChecks = checks.filter((check) => !check.passed);

    const summary = eligible
      ? `PR #${prNumber} is eligible for auto-merge (${checks.length}/${checks.length} checks passed)`
      : `PR #${prNumber} is not eligible for auto-merge (${failedChecks.length} check(s) failed: ${failedChecks.map((c) => c.checkType).join(', ')})`;

    logger.info(summary);

    return {
      eligible,
      checks,
      summary,
      prNumber,
    };
  }
}

/**
 * Singleton instance
 */
export const mergeEligibilityService = new MergeEligibilityService();
