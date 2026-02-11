/**
 * PR Feedback Service - Monitors open PRs for review feedback
 *
 * Polls GitHub for review comments on features that have open PRs.
 * When changes are requested, emits events for the EM agent to handle
 * reassignment back to a dev agent for fixes.
 *
 * Flow:
 * 1. Listens for 'auto_mode_git_workflow' events to track created PRs
 * 2. Periodically polls GitHub for review status on tracked PRs
 * 3. Detects: changes requested, comments, CodeRabbit feedback, approvals
 * 4. Emits 'pr:feedback-received' / 'pr:changes-requested' / 'pr:approved'
 * 5. EM agent picks up and handles reassignment or merge
 */

import { createLogger } from '@automaker/utils';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { GitHubComment } from '@automaker/types';
import { codeRabbitParserService } from './coderabbit-parser-service.js';

const execFileAsync = promisify(execFile);

const logger = createLogger('PRFeedbackService');

/** How often to poll for PR reviews */
const POLL_INTERVAL_MS = 60_000; // 1 minute

/** Max iterations before escalating to CTO - prevents infinite feedback loops */
const MAX_PR_ITERATIONS = 2;

interface TrackedPR {
  featureId: string;
  projectPath: string;
  prNumber: number;
  prUrl: string;
  branchName: string;
  lastCheckedAt: number;
  reviewState: 'pending' | 'changes_requested' | 'approved' | 'commented';
  iterationCount: number;
}

interface PRReviewInfo {
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING';
  reviews: Array<{
    author: string;
    state: string;
    body: string;
    submittedAt: string;
  }>;
  comments: Array<{
    author: string;
    body: string;
    createdAt: string;
  }>;
}

export class PRFeedbackService {
  private readonly events: EventEmitter;
  private readonly featureLoader: FeatureLoader;
  private autoModeService: AutoModeService | null = null;

  /** PRs we're actively monitoring, keyed by featureId */
  private trackedPRs = new Map<string, TrackedPR>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(events: EventEmitter, featureLoader: FeatureLoader) {
    this.events = events;
    this.featureLoader = featureLoader;
  }

  /**
   * Set the AutoModeService reference for automatic agent restart on PR feedback.
   * This enables the service to directly restart dev agents when changes are requested.
   */
  setAutoModeService(service: AutoModeService): void {
    this.autoModeService = service;
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Listen for new PRs being created
    this.events.subscribe((type, payload) => {
      if (type === 'auto-mode:event') {
        const data = payload as Record<string, unknown>;
        if (data.type === 'auto_mode_git_workflow' && data.prUrl && data.prNumber) {
          this.trackPR(data);
        }
      }

      // Listen for PR merges to stop tracking
      if (type === 'feature:pr-merged') {
        const data = payload as Record<string, unknown>;
        const featureId = data.featureId as string;
        if (featureId && this.trackedPRs.has(featureId)) {
          logger.info(`PR merged for feature ${featureId}, stopping tracking`);
          this.trackedPRs.delete(featureId);
        }
      }
    });

    // Start polling
    this.pollTimer = setInterval(() => {
      void this.pollAllPRs();
    }, POLL_INTERVAL_MS);

    logger.info('PR Feedback Service initialized');
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.initialized = false;
  }

  /**
   * Start tracking a newly created PR.
   */
  private trackPR(data: Record<string, unknown>): void {
    const featureId = data.featureId as string;
    const projectPath = data.projectPath as string;
    const prNumber = data.prNumber as number;
    const prUrl = data.prUrl as string;

    if (!featureId || !prNumber) return;

    // Check if we're already tracking this feature's PR
    const existing = this.trackedPRs.get(featureId);

    this.trackedPRs.set(featureId, {
      featureId,
      projectPath,
      prNumber,
      prUrl,
      branchName: (data.branchName as string) || '',
      lastCheckedAt: 0,
      reviewState: 'pending',
      iterationCount: existing?.iterationCount || 0,
    });

    // Save PR info to feature
    void this.featureLoader.update(projectPath, featureId, {
      prUrl,
      prNumber,
    });

    logger.info(`Tracking PR #${prNumber} for feature ${featureId}`);
  }

  /**
   * Poll all tracked PRs for review status.
   */
  private async pollAllPRs(): Promise<void> {
    for (const [featureId, pr] of this.trackedPRs) {
      // Don't poll too frequently per PR
      if (Date.now() - pr.lastCheckedAt < POLL_INTERVAL_MS * 0.8) continue;

      try {
        const reviewInfo = await this.fetchPRReviewStatus(pr);
        pr.lastCheckedAt = Date.now();

        if (!reviewInfo) continue;

        await this.processReviewStatus(featureId, pr, reviewInfo);
      } catch (error) {
        logger.error(`Failed to check PR #${pr.prNumber} for feature ${featureId}:`, error);
      }
    }
  }

  /**
   * Fetch PR review status from GitHub using gh CLI.
   * Uses execFileAsync with argument array to prevent command injection.
   */
  private async fetchPRReviewStatus(pr: TrackedPR): Promise<PRReviewInfo | null> {
    try {
      // Get PR review decision using argument array (no shell interpolation)
      const { stdout: reviewJson } = await execFileAsync(
        'gh',
        ['pr', 'view', String(pr.prNumber), '--json', 'reviewDecision,reviews,comments'],
        {
          cwd: pr.projectPath,
          timeout: 15_000,
          encoding: 'utf-8',
        }
      );

      const data = JSON.parse(reviewJson) as {
        reviewDecision: string;
        reviews: Array<{
          author: { login: string };
          state: string;
          body: string;
          submittedAt: string;
        }>;
        comments: Array<{
          author: { login: string };
          body: string;
          createdAt: string;
        }>;
      };

      return {
        state: (data.reviewDecision || 'PENDING') as PRReviewInfo['state'],
        reviews: (data.reviews || []).map((r) => ({
          author: r.author?.login || 'unknown',
          state: r.state,
          body: r.body || '',
          submittedAt: r.submittedAt,
        })),
        comments: (data.comments || []).map((c) => ({
          author: c.author?.login || 'unknown',
          body: c.body || '',
          createdAt: c.createdAt,
        })),
      };
    } catch (error) {
      logger.debug(`gh pr view failed for PR #${pr.prNumber}: ${error}`);
      return null;
    }
  }

  /**
   * Process review status and emit appropriate events.
   */
  private async processReviewStatus(
    featureId: string,
    pr: TrackedPR,
    reviewInfo: PRReviewInfo
  ): Promise<void> {
    const previousState = pr.reviewState;

    // Map GitHub review decision to our state
    switch (reviewInfo.state) {
      case 'CHANGES_REQUESTED': {
        if (previousState === 'changes_requested') return; // Already handled

        pr.reviewState = 'changes_requested';
        pr.iterationCount++;

        // Extract feedback summary from human reviews
        const feedbackSummary = reviewInfo.reviews
          .filter((r) => r.state === 'CHANGES_REQUESTED')
          .map((r) => `${r.author}: ${r.body}`)
          .join('\n');

        // Parse CodeRabbit comments using structured parser for severity/category
        const ghComments: GitHubComment[] = reviewInfo.comments.map((c, idx) => ({
          id: `${pr.prNumber}-${c.createdAt}-${idx}`,
          author: { login: c.author },
          body: c.body,
          createdAt: c.createdAt,
        }));

        const codeRabbitResult = codeRabbitParserService.parseReview(
          pr.prNumber,
          pr.prUrl,
          ghComments
        );

        let coderabbitFeedback = '';
        if (codeRabbitResult.success && codeRabbitResult.review) {
          // Format structured CodeRabbit feedback with severity levels
          const formattedComments = codeRabbitResult.review.comments
            .map((c) => {
              const location = c.location?.path
                ? ` (${c.location.path}${c.location.line ? `:${c.location.line}` : ''})`
                : '';
              const severity = c.severity ? `[${c.severity.toUpperCase()}]` : '';
              const suggestion = c.suggestion ? `\n  Suggestion: ${c.suggestion}` : '';
              return `- ${severity}${location} ${c.message}${suggestion}`;
            })
            .join('\n');
          coderabbitFeedback = `### CodeRabbit Review (${codeRabbitResult.review.comments.length} items)\n${formattedComments}`;
          logger.info(
            `Parsed ${codeRabbitResult.review.comments.length} structured CodeRabbit comments for PR #${pr.prNumber}`
          );
        }

        const fullFeedback = [feedbackSummary, coderabbitFeedback].filter(Boolean).join('\n---\n');

        // Update feature with feedback info
        await this.featureLoader.update(pr.projectPath, featureId, {
          lastReviewFeedback: fullFeedback.slice(0, 2000), // Truncate for storage
          prIterationCount: pr.iterationCount,
        });

        if (pr.iterationCount > MAX_PR_ITERATIONS) {
          // Too many iterations - escalate to CTO
          logger.warn(
            `PR #${pr.prNumber} for ${featureId} has ${pr.iterationCount} iterations, escalating`
          );
          this.events.emit('authority:awaiting-approval', {
            projectPath: pr.projectPath,
            proposal: {
              who: 'em-agent',
              what: 'escalate',
              target: featureId,
              justification: `PR #${pr.prNumber} has had ${pr.iterationCount} review iterations without approval. Latest feedback: ${fullFeedback.slice(0, 500)}`,
              risk: 'medium',
            },
            decision: {
              verdict: 'require_approval',
              reason: `PR exceeded ${MAX_PR_ITERATIONS} review iterations`,
            },
            blockerType: 'pr_feedback_loop',
            featureTitle: `PR #${pr.prNumber}`,
          });

          // Mark feature as blocked so it doesn't get stuck in limbo
          await this.featureLoader.update(pr.projectPath, featureId, {
            workItemState: 'blocked',
            error: `PR exceeded ${MAX_PR_ITERATIONS} review iterations. Escalated to CTO.`,
          });
        } else {
          // Normal feedback - auto-restart the dev agent with feedback context
          // This enables automatic PR fix cycles without manual intervention

          // First emit the event for EM and other listeners
          this.events.emit('pr:changes-requested', {
            projectPath: pr.projectPath,
            featureId,
            prNumber: pr.prNumber,
            prUrl: pr.prUrl,
            branchName: pr.branchName,
            iterationCount: pr.iterationCount,
            feedback: fullFeedback,
            reviewers: reviewInfo.reviews
              .filter((r) => r.state === 'CHANGES_REQUESTED')
              .map((r) => r.author),
          });

          // Auto-restart dev agent with feedback if AutoModeService is available
          if (this.autoModeService) {
            logger.info(
              `Auto-restarting dev agent for ${featureId} with PR feedback (iteration ${pr.iterationCount})`
            );

            try {
              // Build continuation prompt with PR feedback
              const continuationPrompt = this.buildFeedbackPrompt(
                fullFeedback,
                pr.prNumber,
                pr.iterationCount
              );

              // Update feature status to backlog so it's picked up by auto-loop
              // Keep the PR info so the agent can push to the same branch
              await this.featureLoader.update(pr.projectPath, featureId, {
                status: 'backlog',
                workItemState: 'in_progress',
                prIterationCount: pr.iterationCount,
                error: undefined, // Clear previous errors
              });

              // Restart the agent execution with the feedback as a continuation prompt
              // This will pick up the existing worktree and push new commits to the same PR
              void this.autoModeService.executeFeature(
                pr.projectPath,
                featureId,
                true, // useWorktrees
                true, // isAutoMode
                undefined, // providedWorktreePath (will find existing)
                {
                  continuationPrompt,
                  retryCount: pr.iterationCount,
                  previousErrors: [], // PR feedback isn't an error, it's requested changes
                  recoveryContext: `PR #${pr.prNumber} review feedback (iteration ${pr.iterationCount})`,
                }
              );

              logger.info(
                `Dev agent restarted for ${featureId} to address PR #${pr.prNumber} feedback`
              );
            } catch (error) {
              logger.error(`Failed to restart dev agent for ${featureId}:`, error);
              // Emit error event but don't block - EM agent will handle reassignment as fallback
              this.events.emit('pr:agent-restart-failed', {
                projectPath: pr.projectPath,
                featureId,
                prNumber: pr.prNumber,
                error: String(error),
              });
            }
          } else {
            logger.warn(
              `AutoModeService not available, falling back to EM agent reassignment for ${featureId}`
            );
          }
        }

        this.events.emit('pr:feedback-received', {
          projectPath: pr.projectPath,
          featureId,
          prNumber: pr.prNumber,
          type: 'changes_requested',
          iterationCount: pr.iterationCount,
        });

        logger.info(`PR #${pr.prNumber}: Changes requested (iteration ${pr.iterationCount})`);
        break;
      }

      case 'APPROVED': {
        if (previousState === 'approved') return; // Already handled

        pr.reviewState = 'approved';

        this.events.emit('pr:approved', {
          projectPath: pr.projectPath,
          featureId,
          prNumber: pr.prNumber,
          prUrl: pr.prUrl,
          branchName: pr.branchName,
          approvers: reviewInfo.reviews.filter((r) => r.state === 'APPROVED').map((r) => r.author),
        });

        logger.info(`PR #${pr.prNumber}: Approved!`);

        // Stop tracking - merge will be handled by auto-merge or webhook
        this.trackedPRs.delete(featureId);
        break;
      }

      case 'COMMENTED': {
        // Track comments but don't reassign - might be discussion, not blocking
        if (previousState !== 'commented') {
          pr.reviewState = 'commented';
          this.events.emit('pr:feedback-received', {
            projectPath: pr.projectPath,
            featureId,
            prNumber: pr.prNumber,
            type: 'commented',
            iterationCount: pr.iterationCount,
          });
        }
        break;
      }
    }
  }

  /**
   * Build a continuation prompt that injects PR feedback into the agent's context.
   * This prompt guides the agent to fix the specific issues raised in the review.
   *
   * @param feedback - The formatted PR feedback (human reviews + CodeRabbit comments)
   * @param prNumber - The PR number
   * @param iterationCount - How many times we've iterated on this PR
   * @returns A continuation prompt for the agent
   */
  private buildFeedbackPrompt(feedback: string, prNumber: number, iterationCount: number): string {
    return `## PR Review Feedback - Iteration ${iterationCount}

Your pull request #${prNumber} has received review feedback. Please address the following issues:

${feedback}

**Important Instructions:**
- Only fix the issues mentioned in the review above
- Do not refactor or change unrelated code
- Commit your fixes to the same branch (the worktree is already set up)
- The fixes will be pushed to the existing PR #${prNumber}
- After fixing, verify the changes work correctly

This is iteration ${iterationCount} of the review cycle. Focus on addressing the feedback precisely.`;
  }

  /**
   * Get all currently tracked PRs (for debugging/dashboard).
   */
  getTrackedPRs(): TrackedPR[] {
    return Array.from(this.trackedPRs.values());
  }
}
