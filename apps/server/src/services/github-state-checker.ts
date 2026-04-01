/**
 * GitHub State Checker - Detects drift in GitHub PR state
 *
 * Checks:
 * - PR merged but feature still in 'review'
 * - CI failures on PRs
 * - PR feedback (changes requested)
 * - PRs approved but not merged
 * - Stale PRs (no activity > 7 days)
 */

import { createLogger } from '@protolabsai/utils';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { FeatureLoader } from './feature-loader.js';
import type { Drift } from './reconciliation-service.js';
import type { EventEmitter } from '../lib/events.js';
import type {
  GitHubPRReviewSubmittedPayload,
  GitHubPRChecksUpdatedPayload,
  GitHubPRApprovedPayload,
  GitHubPRChangesRequestedPayload,
} from '@protolabsai/types';

const logger = createLogger('GitHubStateChecker');
const execAsync = promisify(exec);

interface GitHubPR {
  number: number;
  state: 'open' | 'closed';
  merged: boolean;
  merged_at: string | null;
  head: {
    ref: string; // branch name
  };
  reviews: Array<{
    state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  }>;
  updated_at: string;
}

interface CIStatus {
  state: 'success' | 'failure' | 'pending' | 'error';
  failedChecks?: Array<{
    name: string;
    conclusion: string;
  }>;
}

/**
 * Review state type that includes NONE for when no reviews exist
 */
type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'NONE';

/**
 * Tracks the last known state of a PR to detect changes
 */
interface PRState {
  /** PR number */
  prNumber: number;
  /** Last known review state */
  reviewState?: ReviewState;
  /** Last known CI status */
  ciStatus?: 'success' | 'failure' | 'pending' | 'error';
  /** Number of approvals */
  approvalCount: number;
  /** Whether changes were requested */
  hasChangesRequested: boolean;
  /** Last check timestamp */
  lastChecked: string;
}

export class GitHubStateChecker {
  /** Map of featureId -> PRState to track last known state */
  private prStateCache: Map<string, PRState> = new Map();

  constructor(
    private featureLoader: FeatureLoader,
    private eventEmitter?: EventEmitter,
    private knownProjects: Map<string, string> = new Map()
  ) {}

  /**
   * Register a project to check
   */
  registerProject(projectPath: string): void {
    this.knownProjects.set(projectPath, projectPath);
  }

  /**
   * Check all registered projects for GitHub state drifts
   */
  async checkAllProjects(): Promise<Drift[]> {
    const allDrifts: Drift[] = [];

    for (const projectPath of this.knownProjects.keys()) {
      try {
        const drifts = await this.checkProject(projectPath);
        allDrifts.push(...drifts);
      } catch (error) {
        logger.error(`Failed to check GitHub state for ${projectPath}:`, error);
      }
    }

    return allDrifts;
  }

  /**
   * Check and emit events for PR state changes
   */
  private checkAndEmitStateChanges(
    projectPath: string,
    featureId: string,
    pr: GitHubPR,
    ciStatus: CIStatus
  ): void {
    if (!this.eventEmitter) return;

    const lastState = this.prStateCache.get(featureId);
    const now = new Date().toISOString();

    // Determine current review state
    const hasApproval = pr.reviews.some((r) => r.state === 'APPROVED');
    const hasChangesRequested = pr.reviews.some((r) => r.state === 'CHANGES_REQUESTED');
    const latestReview = pr.reviews[pr.reviews.length - 1];
    const currentReviewState: ReviewState = latestReview?.state || 'NONE';
    const approvalCount = pr.reviews.filter((r) => r.state === 'APPROVED').length;

    // Create current state snapshot
    const currentState: PRState = {
      prNumber: pr.number,
      reviewState: currentReviewState,
      ciStatus: ciStatus.state,
      approvalCount,
      hasChangesRequested,
      lastChecked: now,
    };

    // If no last state, this is the first check - store and don't emit
    if (!lastState) {
      this.prStateCache.set(featureId, currentState);
      return;
    }

    // Detect review submission (review state changed)
    if (lastState.reviewState !== currentReviewState && latestReview) {
      const payload: GitHubPRReviewSubmittedPayload = {
        projectPath,
        featureId,
        prNumber: pr.number,
        branchName: pr.head.ref,
        reviewState: latestReview.state,
        timestamp: now,
      };
      this.eventEmitter.emit('github:pr:review-submitted', payload);
      logger.info(`Review submitted on PR #${pr.number}: ${latestReview.state}`);
    }

    // Detect CI status change
    if (lastState.ciStatus !== ciStatus.state) {
      const payload: GitHubPRChecksUpdatedPayload = {
        projectPath,
        featureId,
        prNumber: pr.number,
        branchName: pr.head.ref,
        ciStatus: ciStatus.state,
        failedChecks: ciStatus.failedChecks,
        timestamp: now,
      };
      this.eventEmitter.emit('github:pr:checks-updated', payload);
      logger.info(`CI checks updated on PR #${pr.number}: ${ciStatus.state}`);
    }

    // Detect approval (approval count increased)
    if (hasApproval && approvalCount > lastState.approvalCount) {
      const payload: GitHubPRApprovedPayload = {
        projectPath,
        featureId,
        prNumber: pr.number,
        branchName: pr.head.ref,
        approvalCount,
        timestamp: now,
      };
      this.eventEmitter.emit('github:pr:approved', payload);
      logger.info(`PR #${pr.number} approved (${approvalCount} approvals)`);
    }

    // Detect changes requested (newly requested)
    if (hasChangesRequested && !lastState.hasChangesRequested) {
      const payload: GitHubPRChangesRequestedPayload = {
        projectPath,
        featureId,
        prNumber: pr.number,
        branchName: pr.head.ref,
        timestamp: now,
      };
      this.eventEmitter.emit('github:pr:changes-requested', payload);
      logger.info(`Changes requested on PR #${pr.number}`);
    }

    // Update cache with current state
    this.prStateCache.set(featureId, currentState);
  }

  /**
   * Check a single project for GitHub state drifts
   */
  async checkProject(projectPath: string): Promise<Drift[]> {
    const drifts: Drift[] = [];

    try {
      // Load ALL non-done features. We need to check backlog, blocked, in_progress, and review
      // because PRs can merge while a feature is in any of these states:
      //   - backlog: webhook fired but branch-to-feature match failed
      //   - blocked: crash-recovery push failed AFTER the PR was already merged
      //   - in_progress: agent completed, PR auto-merged before status was updated
      //   - review: normal path — caught here as a safety net
      const features = await this.featureLoader.getAll(projectPath);
      const activeFeatures = features.filter((f) => f.status !== 'done');

      for (const feature of activeFeatures) {
        if (!feature.branchName && !feature.prNumber) continue;

        try {
          // Find PR: try branch name first, then fall back to prNumber.
          // Fallback is needed when the branch was rebased/renamed after the PR was created
          // (changing head.ref) so a branch-based lookup returns nothing but the prNumber is set.
          let pr = feature.branchName
            ? await this.findPRForBranch(projectPath, feature.branchName)
            : null;

          if (!pr && feature.prNumber) {
            pr = await this.findPRByNumber(projectPath, feature.prNumber);
            if (pr) {
              logger.info(
                `Feature ${feature.id} (status=${feature.status}): branch lookup missed, found PR #${feature.prNumber} by number`
              );
            }
          }

          if (!pr) continue;

          // Get CI status for open PRs
          const ciStatus =
            pr.state === 'open'
              ? await this.getCIStatus(projectPath, pr.number)
              : { state: 'pending' as const };

          // Check and emit state change events
          this.checkAndEmitStateChanges(projectPath, feature.id, pr, ciStatus);

          // Check if merged — applies to ALL non-done features regardless of current status.
          // This is the core fix: previously only 'review' and 'blocked' were checked, causing
          // features in 'backlog' or 'in_progress' to stay stuck even after their PR merged.
          if (pr.merged) {
            logger.info(
              `Feature "${feature.title}" (${feature.id}) has merged PR #${pr.number} but status is "${feature.status}" — queuing reconciliation`
            );
            drifts.push({
              type: 'pr-merged-status-stale',
              severity: 'high',
              projectPath,
              featureId: feature.id,
              prNumber: pr.number,
              details: {
                mergedAt: pr.merged_at,
                branchName: feature.branchName,
                previousStatus: feature.status,
              },
            });
          }

          // Check for drifts on open PRs
          if (pr.state === 'open') {
            if (ciStatus.state === 'failure') {
              drifts.push({
                type: 'pr-ci-failure',
                severity: 'high',
                projectPath,
                featureId: feature.id,
                prNumber: pr.number,
                details: {
                  failedChecks: ciStatus.failedChecks,
                },
              });
            }

            // Check for feedback (changes requested)
            const hasChangesRequested = pr.reviews.some((r) => r.state === 'CHANGES_REQUESTED');
            if (hasChangesRequested) {
              drifts.push({
                type: 'pr-has-feedback',
                severity: 'medium',
                projectPath,
                featureId: feature.id,
                prNumber: pr.number,
                details: {
                  reviews: pr.reviews,
                },
              });
            }

            // Check if approved but not merged
            const isApproved = pr.reviews.some((r) => r.state === 'APPROVED');
            if (isApproved && !pr.merged) {
              drifts.push({
                type: 'pr-approved-not-merged',
                severity: 'medium',
                projectPath,
                featureId: feature.id,
                prNumber: pr.number,
                details: {
                  approvedReviews: pr.reviews.filter((r) => r.state === 'APPROVED'),
                },
              });
            }

            // Check if stale (no activity > 7 days)
            const daysSinceUpdate = this.getDaysSince(pr.updated_at);
            if (daysSinceUpdate > 7) {
              drifts.push({
                type: 'pr-stale',
                severity: 'low',
                projectPath,
                featureId: feature.id,
                prNumber: pr.number,
                details: {
                  daysSinceUpdate,
                  lastUpdate: pr.updated_at,
                },
              });
            }
          }
        } catch (error) {
          logger.error(`Failed to check PR for feature ${feature.id}:`, error);
        }
      }
    } catch (error) {
      logger.error(`Failed to check project ${projectPath}:`, error);
    }

    return drifts;
  }

  /**
   * Find PR for a given branch using gh CLI
   */
  private async findPRForBranch(projectPath: string, branchName: string): Promise<GitHubPR | null> {
    try {
      const { stdout } = await execAsync(
        `gh pr list --head ${branchName} --state all --json number,state,merged,mergedAt,headRefName,updatedAt --limit 1`,
        { cwd: projectPath }
      );

      const prs = JSON.parse(stdout);
      if (!prs || prs.length === 0) {
        return null;
      }

      const pr = prs[0];

      // Get reviews separately
      const reviews = await this.getReviews(projectPath, pr.number);

      return {
        number: pr.number,
        state: pr.state,
        merged: pr.merged,
        merged_at: pr.mergedAt,
        head: { ref: pr.headRefName },
        reviews,
        updated_at: pr.updatedAt,
      };
    } catch (error) {
      // gh CLI not authenticated or repo not found
      logger.debug(`Could not find PR for branch ${branchName}:`, error);
      return null;
    }
  }

  /**
   * Find PR by number using gh CLI.
   * Used as a fallback when branch-name lookup returns nothing (e.g., after a rebase).
   */
  private async findPRByNumber(projectPath: string, prNumber: number): Promise<GitHubPR | null> {
    try {
      const { stdout } = await execAsync(
        `gh pr view ${prNumber} --json number,state,merged,mergedAt,headRefName,updatedAt`,
        { cwd: projectPath }
      );

      const pr = JSON.parse(stdout);
      if (!pr || !pr.number) {
        return null;
      }

      const reviews = await this.getReviews(projectPath, pr.number);

      return {
        number: pr.number,
        state: pr.state,
        merged: pr.merged,
        merged_at: pr.mergedAt,
        head: { ref: pr.headRefName },
        reviews,
        updated_at: pr.updatedAt,
      };
    } catch (error) {
      logger.debug(`Could not find PR #${prNumber}:`, error);
      return null;
    }
  }

  /**
   * Get PR reviews using gh CLI
   */
  private async getReviews(
    projectPath: string,
    prNumber: number
  ): Promise<Array<{ state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' }>> {
    try {
      const { stdout } = await execAsync(
        `gh pr view ${prNumber} --json reviews --jq '.reviews[] | {state: .state}'`,
        { cwd: projectPath }
      );

      if (!stdout.trim()) {
        return [];
      }

      // Parse newline-delimited JSON
      return stdout
        .trim()
        .split('\n')
        .filter((line) => line)
        .map((line) => JSON.parse(line));
    } catch (error) {
      logger.debug(`Could not get reviews for PR ${prNumber}:`, error);
      return [];
    }
  }

  /**
   * Get CI status for a PR using gh CLI
   */
  private async getCIStatus(projectPath: string, prNumber: number): Promise<CIStatus> {
    try {
      const { stdout } = await execAsync(`gh pr checks ${prNumber} --json name,state,conclusion`, {
        cwd: projectPath,
      });

      const checks = JSON.parse(stdout);

      if (!checks || checks.length === 0) {
        return { state: 'pending' };
      }

      // Check if any checks failed
      const failedChecks = checks.filter(
        (c: { conclusion: string }) => c.conclusion === 'failure' || c.conclusion === 'error'
      );

      if (failedChecks.length > 0) {
        return {
          state: 'failure',
          failedChecks: failedChecks.map((c: { name: string; conclusion: string }) => ({
            name: c.name,
            conclusion: c.conclusion,
          })),
        };
      }

      // Check if all passed
      const allPassed = checks.every((c: { conclusion: string }) => c.conclusion === 'success');
      if (allPassed) {
        return { state: 'success' };
      }

      return { state: 'pending' };
    } catch (error) {
      logger.debug(`Could not get CI status for PR ${prNumber}:`, error);
      return { state: 'pending' };
    }
  }

  /**
   * Calculate days since a given ISO timestamp
   */
  private getDaysSince(isoTimestamp: string): number {
    const date = new Date(isoTimestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}
