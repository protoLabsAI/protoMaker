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
import type { GitHubComment, ReviewThreadFeedback, ReviewThreadStatus } from '@automaker/types';
import { codeRabbitParserService } from './coderabbit-parser-service.js';
import { codeRabbitResolverService } from './coderabbit-resolver-service.js';

const execFileAsync = promisify(execFile);

const logger = createLogger('PRFeedbackRemediation');

/** How often to poll for PR reviews */
const POLL_INTERVAL_MS = 60_000; // 1 minute

/** Max iterations before escalating to CTO - prevents infinite feedback loops */
const MAX_PR_ITERATIONS = 2;

/** Max total remediation cycles (feedback + CI combined) before blocking */
const MAX_TOTAL_REMEDIATION_CYCLES = 4;

/** How often to poll for CI check status (60s) */
const CI_POLL_INTERVAL_MS = 60_000;

/** Max time to wait for CI checks to complete (10 minutes) */
const CI_MAX_WAIT_MS = 10 * 60 * 1000;

interface TrackedPR {
  featureId: string;
  projectPath: string;
  prNumber: number;
  prUrl: string;
  branchName: string;
  lastCheckedAt: number;
  reviewState: 'pending' | 'changes_requested' | 'approved' | 'commented';
  iterationCount: number;
  lastProcessedReviewAt?: number; // Track last webhook-based review to dedupe
  ciMonitoring?: {
    headSha: string;
    startedAt: number;
    lastPolledAt: number;
  };
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

/**
 * Structured feedback item from a review thread
 */
interface ThreadFeedbackItem {
  threadId: string;
  severity: 'critical' | 'warning' | 'suggestion' | 'info';
  category?: string;
  message: string;
  location?: {
    path: string;
    line?: number;
  };
  suggestedFix?: string;
  isBot: boolean;
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

      // Listen for webhook PR review submissions (immediate detection)
      if (type === 'webhook:github:pull_request') {
        const data = payload as {
          action: string;
          prNumber: number;
          branchName: string;
          reviewState: string;
          reviewBody?: string;
          reviewer?: string;
        };

        if (data.action === 'review_submitted') {
          void this.handleWebhookReview(data);
        }
      }

      // Listen for CI failures from webhook
      if (type === 'pr:ci-failure') {
        const data = payload as {
          projectPath: string;
          prNumber: number;
          headBranch: string;
          headSha: string;
          checkSuiteId: number;
          checkSuiteUrl: string | null;
          repository: string;
          checksUrl?: string;
        };
        void this.handleCIFailure(data);
      }
    });

    // Start polling
    this.pollTimer = setInterval(() => {
      void this.pollAllPRs();
    }, POLL_INTERVAL_MS);

    logger.info('PR Feedback Service initialized (webhook + poll)');
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.initialized = false;
  }

  /**
   * Restore tracked PRs from features with status=review and prNumber set for a specific project.
   * This ensures PR tracking survives server restarts.
   *
   * @param projectPath - Path to the project to restore PRs for
   */
  async restoreTrackedPRsForProject(projectPath: string): Promise<void> {
    try {
      const features = await this.featureLoader.getAll(projectPath);

      let restoredCount = 0;
      for (const feature of features) {
        // Only restore tracking for features in review with an open PR
        if (feature.status === 'review' && feature.prNumber && feature.prUrl) {
          const lastPolledAt =
            feature.prLastPolledAt && typeof feature.prLastPolledAt === 'string'
              ? new Date(feature.prLastPolledAt).getTime()
              : 0;

          this.trackedPRs.set(feature.id, {
            featureId: feature.id,
            projectPath,
            prNumber: feature.prNumber,
            prUrl: feature.prUrl,
            branchName: feature.branchName || '',
            lastCheckedAt: lastPolledAt,
            reviewState: 'pending',
            iterationCount: feature.prIterationCount || 0,
          });

          logger.info(
            `Restored tracking for PR #${feature.prNumber} (feature ${feature.id}) from persisted state`
          );
          restoredCount++;
        }
      }

      if (restoredCount > 0) {
        logger.info(`Restored ${restoredCount} tracked PRs for project ${projectPath}`);
      }
    } catch (error) {
      logger.error(`Failed to restore tracked PRs for project ${projectPath}:`, error);
    }
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
    const now = new Date().toISOString();

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

    // Save PR info and tracking metadata to feature
    void this.featureLoader.update(projectPath, featureId, {
      prUrl,
      prNumber,
      prTrackedSince: existing ? undefined : now, // Only set on first track
      prLastPolledAt: now,
    });

    logger.info(`Tracking PR #${prNumber} for feature ${featureId}`);
  }

  /**
   * Handle webhook-based PR review submission (immediate detection).
   * Finds the tracked PR by prNumber and processes the review immediately.
   */
  private async handleWebhookReview(data: {
    prNumber: number;
    branchName: string;
    reviewState: string;
    reviewBody?: string;
    reviewer?: string;
  }): Promise<void> {
    // Find the tracked PR by PR number and branch name
    const entry = Array.from(this.trackedPRs.entries()).find(
      ([_, pr]) => pr.prNumber === data.prNumber && pr.branchName === data.branchName
    );

    if (!entry) {
      logger.debug(
        `Webhook received for PR #${data.prNumber} (branch: ${data.branchName}), but not currently tracked`
      );
      return;
    }

    const [featureId, pr] = entry;

    logger.info('Feedback detected via webhook', {
      featureId,
      prNumber: data.prNumber,
      iteration: pr.iterationCount,
      detectionMethod: 'webhook',
      reviewState: data.reviewState,
      reviewer: data.reviewer || 'unknown',
    });

    try {
      // Fetch full review info from GitHub
      const reviewInfo = await this.fetchPRReviewStatus(pr);
      if (!reviewInfo) {
        logger.warn(`Failed to fetch review info for webhook PR #${data.prNumber}`);
        return;
      }

      // Mark that we processed this review via webhook
      pr.lastProcessedReviewAt = Date.now();
      pr.lastCheckedAt = Date.now();

      await this.processReviewStatus(featureId, pr, reviewInfo, 'webhook');
    } catch (error) {
      logger.error(`Failed to process webhook review for PR #${data.prNumber}:`, error);
    }
  }

  /**
   * Poll all tracked PRs for review status and CI status.
   */
  private async pollAllPRs(): Promise<void> {
    // Poll CI status for PRs with active CI monitoring
    await this.pollCIStatus();

    // Poll review status for all tracked PRs
    for (const [featureId, pr] of this.trackedPRs) {
      // Don't poll too frequently per PR
      if (Date.now() - pr.lastCheckedAt < POLL_INTERVAL_MS * 0.8) continue;

      try {
        const reviewInfo = await this.fetchPRReviewStatus(pr);
        const now = Date.now();
        pr.lastCheckedAt = now;

        // Persist poll timestamp to feature.json
        await this.featureLoader.update(pr.projectPath, featureId, {
          prLastPolledAt: new Date(now).toISOString(),
        });

        if (!reviewInfo) continue;

        // Deduplicate: skip if we just processed this via webhook recently (within 2 minutes)
        if (pr.lastProcessedReviewAt && Date.now() - pr.lastProcessedReviewAt < 120_000) {
          logger.debug(
            `[POLL] Skipping PR #${pr.prNumber} - recently processed via webhook (${Math.round((Date.now() - pr.lastProcessedReviewAt) / 1000)}s ago)`
          );
          continue;
        }

        await this.processReviewStatus(featureId, pr, reviewInfo, 'poll');
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
    reviewInfo: PRReviewInfo,
    detectionMethod: 'webhook' | 'poll' = 'poll'
  ): Promise<void> {
    const previousState = pr.reviewState;
    const detectionLabel = detectionMethod === 'webhook' ? '[WEBHOOK]' : '[POLL]';

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

          // Count severity distribution
          const severityCounts = codeRabbitResult.review.comments.reduce(
            (acc, c) => {
              acc[c.severity || 'info'] = (acc[c.severity || 'info'] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          );

          logger.info('Triage result: CodeRabbit feedback parsed', {
            featureId,
            prNumber: pr.prNumber,
            iteration: pr.iterationCount,
            threadCount: codeRabbitResult.review.comments.length,
            severityDistribution: severityCounts,
            botReviewer: 'coderabbitai',
          });
        }

        const fullFeedback = [feedbackSummary, coderabbitFeedback].filter(Boolean).join('\n---\n');

        // Load feature to check combined budget
        const feature = await this.featureLoader.get(pr.projectPath, featureId);
        const currentTotalCycles = (feature?.remediationCycleCount as number | undefined) || 0;
        const totalCycles = currentTotalCycles + 1;

        // Update feature with feedback info and increment total cycles
        await this.featureLoader.update(pr.projectPath, featureId, {
          lastReviewFeedback: fullFeedback.slice(0, 2000), // Truncate for storage
          prIterationCount: pr.iterationCount,
          remediationCycleCount: totalCycles,
        });

        // Check combined budget first
        if (totalCycles >= MAX_TOTAL_REMEDIATION_CYCLES) {
          logger.warn(
            `PR #${pr.prNumber} for ${featureId} exceeded total remediation budget (${totalCycles}/${MAX_TOTAL_REMEDIATION_CYCLES}), blocking`
          );

          await this.featureLoader.update(pr.projectPath, featureId, {
            status: 'blocked',
            workItemState: 'blocked',
            error: `Exceeded ${MAX_TOTAL_REMEDIATION_CYCLES} total remediation cycles (feedback + CI). Escalated.`,
          });

          this.events.emit('authority:awaiting-approval', {
            projectPath: pr.projectPath,
            proposal: {
              who: 'pr-feedback-service',
              what: 'escalate',
              target: featureId,
              justification: `PR #${pr.prNumber} exceeded ${MAX_TOTAL_REMEDIATION_CYCLES} total remediation cycles`,
              risk: 'high',
            },
            decision: {
              verdict: 'require_approval',
              reason: `Total remediation budget exceeded`,
            },
            blockerType: 'remediation_budget_exceeded',
            featureTitle: `PR #${pr.prNumber}`,
          });

          this.trackedPRs.delete(featureId);
          return;
        }

        if (pr.iterationCount > MAX_PR_ITERATIONS) {
          // Too many iterations - escalate to CTO
          logger.warn('Iteration budget exhausted, escalating', {
            featureId,
            prNumber: pr.prNumber,
            iteration: pr.iterationCount,
            maxIterations: MAX_PR_ITERATIONS,
            status: 'escalated',
          });
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
            logger.info('Starting agent remediation cycle', {
              featureId,
              prNumber: pr.prNumber,
              iteration: pr.iterationCount,
              cycleType: 'feedback',
              humanReviewers: reviewInfo.reviews
                .filter((r) => r.state === 'CHANGES_REQUESTED')
                .map((r) => r.author),
            });

            try {
              // Build continuation prompt with PR feedback and previous agent output
              const continuationPrompt = await this.buildFeedbackPrompt(
                fullFeedback,
                pr.prNumber,
                pr.iterationCount,
                featureId,
                pr.projectPath
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

              logger.info('Agent remediation started successfully', {
                featureId,
                prNumber: pr.prNumber,
                iteration: pr.iterationCount,
                status: 'remediation_in_progress',
              });
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
          detectionMethod,
        });

        logger.info('PR changes requested - feedback cycle started', {
          featureId,
          prNumber: pr.prNumber,
          iteration: pr.iterationCount,
          detectionMethod,
          humanReviewerCount: reviewInfo.reviews.filter((r) => r.state === 'CHANGES_REQUESTED')
            .length,
          codeRabbitThreadCount: codeRabbitResult.success
            ? codeRabbitResult.review?.comments.length || 0
            : 0,
        });
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
          detectionMethod,
        });

        logger.info('PR approved', {
          featureId,
          prNumber: pr.prNumber,
          iteration: pr.iterationCount,
          detectionMethod,
          approvers: reviewInfo.reviews.filter((r) => r.state === 'APPROVED').map((r) => r.author),
        });

        // Stop tracking - merge will be handled by auto-merge or webhook
        this.trackedPRs.delete(featureId);
        break;
      }

      case 'COMMENTED': {
        // Analyze if this COMMENTED review contains actionable content
        if (previousState !== 'commented') {
          pr.reviewState = 'commented';

          // Check if the comments are actionable
          const isActionable = this.isCommentedReviewActionable(reviewInfo);

          if (isActionable) {
            // Treat as changes requested - trigger remediation
            logger.info(
              `${detectionLabel} PR #${pr.prNumber}: COMMENTED review contains actionable feedback`
            );

            pr.iterationCount++;

            // Extract feedback summary
            const feedbackSummary = reviewInfo.comments
              .map((c) => `${c.author}: ${c.body}`)
              .join('\n---\n');

            // Update feature with feedback info
            await this.featureLoader.update(pr.projectPath, featureId, {
              lastReviewFeedback: feedbackSummary.slice(0, 2000),
              prIterationCount: pr.iterationCount,
            });

            // Emit changes requested event
            this.events.emit('pr:changes-requested', {
              projectPath: pr.projectPath,
              featureId,
              prNumber: pr.prNumber,
              prUrl: pr.prUrl,
              branchName: pr.branchName,
              iterationCount: pr.iterationCount,
              feedback: feedbackSummary,
              reviewers: reviewInfo.comments.map((c) => c.author),
            });

            // Auto-restart dev agent with feedback if AutoModeService is available
            if (this.autoModeService) {
              logger.info(
                `Auto-restarting dev agent for ${featureId} with COMMENTED review feedback (iteration ${pr.iterationCount})`
              );

              try {
                const continuationPrompt = await this.buildFeedbackPrompt(
                  feedbackSummary,
                  pr.prNumber,
                  pr.iterationCount,
                  featureId,
                  pr.projectPath
                );

                await this.featureLoader.update(pr.projectPath, featureId, {
                  status: 'backlog',
                  workItemState: 'in_progress',
                  prIterationCount: pr.iterationCount,
                  error: undefined,
                });

                void this.autoModeService.executeFeature(
                  pr.projectPath,
                  featureId,
                  true,
                  true,
                  undefined,
                  {
                    continuationPrompt,
                    retryCount: pr.iterationCount,
                    previousErrors: [],
                    recoveryContext: `PR #${pr.prNumber} COMMENTED review feedback (iteration ${pr.iterationCount})`,
                  }
                );
              } catch (error) {
                logger.error(`Failed to restart dev agent for ${featureId}:`, error);
                this.events.emit('pr:agent-restart-failed', {
                  projectPath: pr.projectPath,
                  featureId,
                  prNumber: pr.prNumber,
                  error: String(error),
                });
              }
            }
          } else {
            // Non-actionable COMMENTED review - just log and skip
            logger.info(
              `${detectionLabel} PR #${pr.prNumber}: COMMENTED review has no actionable content - skipping remediation`
            );
          }

          this.events.emit('pr:feedback-received', {
            projectPath: pr.projectPath,
            featureId,
            prNumber: pr.prNumber,
            type: 'commented',
            iterationCount: pr.iterationCount,
            detectionMethod,
            actionable: isActionable,
          });
          logger.info('PR commented (no action required)', {
            featureId,
            prNumber: pr.prNumber,
            iteration: pr.iterationCount,
            detectionMethod,
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
   * @param featureId - The feature ID to load previous agent output
   * @param projectPath - The project path to load previous agent output
   * @returns A continuation prompt for the agent
   */
  private async buildFeedbackPrompt(
    feedback: string,
    prNumber: number,
    iterationCount: number,
    featureId: string,
    projectPath: string
  ): Promise<string> {
    // Load previous agent output if available
    let previousContext = '';
    try {
      const agentOutput = await this.featureLoader.getAgentOutput(projectPath, featureId);
      if (agentOutput) {
        // Truncate if > 50k chars (keep last 40k to preserve recent context)
        const MAX_LENGTH = 50_000;
        const KEEP_LENGTH = 40_000;
        let truncatedOutput = agentOutput;
        if (agentOutput.length > MAX_LENGTH) {
          truncatedOutput = agentOutput.slice(-KEEP_LENGTH);
          logger.info(
            `Truncated agent output from ${agentOutput.length} to ${KEEP_LENGTH} chars for ${featureId}`
          );
        }

        previousContext = `## Your Previous Work (Iteration ${iterationCount - 1})

Below is the output from your previous work on this feature. Review it to understand what you've already done:

${truncatedOutput}

---

`;
      }
    } catch (error) {
      // First iteration or file doesn't exist - gracefully continue without previous context
      logger.debug(`No previous agent output found for ${featureId} (likely first iteration)`);
    }

    return `${previousContext}## PR Review Feedback - Iteration ${iterationCount}

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
   * Build a structured prompt from PR review threads.
   * Fetches review threads via GraphQL and groups them into human/bot feedback.
   *
   * @param pr - The tracked PR
   * @returns Markdown prompt with numbered feedback items
   */
  async buildThreadFeedbackPrompt(pr: TrackedPR): Promise<string> {
    try {
      // Fetch review threads via GraphQL
      const threads = await this.fetchReviewThreads(pr);

      if (threads.length === 0) {
        logger.info('Triage result: No review threads found', {
          featureId: pr.featureId,
          prNumber: pr.prNumber,
          iteration: pr.iterationCount,
          threadCount: 0,
        });
        return 'No review threads found.';
      }

      // Separate bot and human threads
      const botThreads = threads.filter((t) => t.isBot);
      const humanThreads = threads.filter((t) => !t.isBot);

      // Count severity distribution
      const severityCounts = threads.reduce(
        (acc, t) => {
          acc[t.severity] = (acc[t.severity] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      logger.info('Triage result: Review threads fetched', {
        featureId: pr.featureId,
        prNumber: pr.prNumber,
        iteration: pr.iterationCount,
        threadCount: threads.length,
        humanThreadCount: humanThreads.length,
        botThreadCount: botThreads.length,
        severityDistribution: severityCounts,
      });

      let prompt = '## Review Thread Feedback\n\n';

      // Human feedback first (higher priority)
      if (humanThreads.length > 0) {
        prompt += '### Human Review Feedback\n\n';
        humanThreads.forEach((item, idx) => {
          prompt += this.formatFeedbackItem(idx + 1, item);
        });
        prompt += '\n';
      }

      // Bot feedback second
      if (botThreads.length > 0) {
        prompt += '### CodeRabbit Review Feedback\n\n';
        botThreads.forEach((item, idx) => {
          prompt += this.formatFeedbackItem(idx + 1, item);
        });
        prompt += '\n';
      }

      prompt += `\n**Instructions:**
For each item above, respond with either:
- "Accept #N" to implement the suggested fix
- "Deny #N" with a brief justification

After making your decisions, implement the accepted fixes.`;

      return prompt;
    } catch (error) {
      logger.error(`Failed to build thread feedback prompt for PR #${pr.prNumber}:`, error);
      return `Error fetching review threads: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Format a single feedback item as markdown
   */
  private formatFeedbackItem(number: number, item: ThreadFeedbackItem): string {
    const severity = item.severity.toUpperCase();
    const location = item.location
      ? `${item.location.path}${item.location.line ? `:${item.location.line}` : ''}`
      : 'general';
    const category = item.category ? ` [${item.category}]` : '';
    const fix = item.suggestedFix ? `\n   **Suggested Fix:** ${item.suggestedFix}` : '';

    return `${number}. **[${severity}]${category}** ${location}
   ${item.message}${fix}
   Thread ID: \`${item.threadId}\`

`;
  }

  /**
   * Fetch review threads from GitHub using GraphQL
   */
  private async fetchReviewThreads(pr: TrackedPR): Promise<ThreadFeedbackItem[]> {
    try {
      // Extract owner/repo from git remote
      const { stdout: remoteOutput } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
        cwd: pr.projectPath,
        timeout: 15_000,
        encoding: 'utf-8',
      });

      const remoteUrl = remoteOutput.trim();
      const match =
        remoteUrl.match(/github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/) ||
        remoteUrl.match(/^([^/]+)\/([^/\s]+)$/);

      if (!match) {
        throw new Error(`Could not parse GitHub owner/repo from remote: ${remoteUrl}`);
      }

      const [, owner, repoName] = match;

      // GraphQL query to fetch review threads with comments
      const query = `
        query {
          repository(owner: "${owner}", name: "${repoName}") {
            pullRequest(number: ${pr.prNumber}) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  comments(first: 10) {
                    nodes {
                      id
                      body
                      author {
                        login
                      }
                      path
                      line
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const { stdout } = await execFileAsync(
        'gh',
        ['api', 'graphql', '-f', `query=${query.replace(/\n/g, ' ')}`],
        {
          cwd: pr.projectPath,
          timeout: 15_000,
          encoding: 'utf-8',
        }
      );

      const data = JSON.parse(stdout);
      const threads = data.data?.repository?.pullRequest?.reviewThreads?.nodes || [];

      // Map threads to structured feedback items
      return threads
        .filter((thread: { isResolved: boolean }) => !thread.isResolved)
        .map(
          (thread: {
            id: string;
            comments: {
              nodes: Array<{
                id: string;
                body: string;
                author: { login: string };
                path?: string;
                line?: number;
              }>;
            };
          }) => {
            const firstComment = thread.comments?.nodes?.[0];
            if (!firstComment) return null;

            const author = firstComment.author.login.toLowerCase();
            const isBot =
              author === 'coderabbitai' ||
              author.includes('coderabbit') ||
              author.includes('github-actions') ||
              author.includes('dependabot');

            // Parse severity and category from comment body
            const { severity, category, suggestion } = this.parseCommentMetadata(firstComment.body);

            return {
              threadId: thread.id,
              severity,
              category,
              message: this.extractMessage(firstComment.body),
              location: firstComment.path
                ? {
                    path: firstComment.path,
                    line: firstComment.line,
                  }
                : undefined,
              suggestedFix: suggestion,
              isBot,
            };
          }
        )
        .filter(Boolean) as ThreadFeedbackItem[];
    } catch (error) {
      logger.error(`Failed to fetch review threads for PR #${pr.prNumber}:`, error);
      throw error;
    }
  }

  /**
   * Parse severity, category, and suggestion from comment body
   */
  private parseCommentMetadata(body: string): {
    severity: ThreadFeedbackItem['severity'];
    category?: string;
    suggestion?: string;
  } {
    // Extract severity
    const severityMatch = body.match(/\*\*Severity\*\*:\s*(\w+)/i);
    let severity: ThreadFeedbackItem['severity'] = 'info';

    if (severityMatch) {
      const sev = severityMatch[1].toLowerCase();
      if (sev === 'critical' || sev === 'high') severity = 'critical';
      else if (sev === 'warning' || sev === 'medium') severity = 'warning';
      else if (sev === 'suggestion' || sev === 'low') severity = 'suggestion';
    } else {
      // Infer from emoji
      if (body.includes('🚨')) severity = 'critical';
      else if (body.includes('⚠️')) severity = 'warning';
      else if (body.includes('💡')) severity = 'suggestion';
    }

    // Extract category
    const categoryMatch = body.match(/\*\*Category\*\*:\s*([^\n]+)/i);
    const category = categoryMatch?.[1]?.trim();

    // Extract suggestion
    const suggestionMatch = body.match(/\*\*Suggestion\*\*:\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i);
    const suggestion = suggestionMatch?.[1]?.trim();

    return { severity, category, suggestion };
  }

  /**
   * Extract the main message from comment body
   */
  private extractMessage(body: string): string {
    // Remove emoji prefix and extract first paragraph or up to first bold header
    const messageMatch = body.match(/^(.+?)(?:\n\n|\*\*)/s);
    const message = (messageMatch?.[1] || body).trim().replace(/^[🐰🔍💡⚠️🚨]\s*/, '');
    return message;
  }

  /**
   * Start monitoring CI checks for a PR after agent push.
   * This initiates polling that will detect CI failures.
   */
  startCIMonitoring(featureId: string, headSha: string): void {
    const pr = this.trackedPRs.get(featureId);
    if (!pr) {
      logger.warn(`Cannot start CI monitoring for ${featureId} - PR not tracked`);
      return;
    }

    pr.ciMonitoring = {
      headSha,
      startedAt: Date.now(),
      lastPolledAt: 0,
    };

    logger.info(
      `Started CI monitoring for PR #${pr.prNumber} (feature ${featureId}, sha: ${headSha.slice(0, 7)})`
    );
  }

  /**
   * Handle CI failure event from webhook.
   * Deduplicates, checks budget, and restarts agent with CI fix prompt.
   */
  private async handleCIFailure(data: {
    projectPath: string;
    prNumber: number;
    headBranch: string;
    headSha: string;
    checkSuiteId: number;
    checkSuiteUrl: string | null;
    repository: string;
    checksUrl?: string;
  }): Promise<void> {
    // Find the tracked PR by PR number and branch
    const entry = Array.from(this.trackedPRs.entries()).find(
      ([_, pr]) => pr.prNumber === data.prNumber && pr.branchName === data.headBranch
    );

    if (!entry) {
      logger.debug(
        `CI failure webhook for PR #${data.prNumber} (branch: ${data.headBranch}), but not tracked`
      );
      return;
    }

    const [featureId, pr] = entry;

    try {
      // Load feature to check deduplication and budget
      const feature = await this.featureLoader.get(pr.projectPath, featureId);
      if (!feature) {
        logger.warn(`Feature ${featureId} not found, cannot process CI failure`);
        return;
      }

      // Deduplicate: skip if we already processed this check suite
      if (feature.lastCheckSuiteId === data.checkSuiteId) {
        logger.debug(
          `Check suite ${data.checkSuiteId} already processed for ${featureId}, skipping`
        );
        return;
      }

      // Stop CI monitoring since we received the webhook
      pr.ciMonitoring = undefined;

      // Check combined budget
      const currentTotalCycles = (feature.remediationCycleCount as number | undefined) || 0;
      if (currentTotalCycles >= MAX_TOTAL_REMEDIATION_CYCLES) {
        logger.warn(
          `Feature ${featureId} exceeded total remediation budget (${currentTotalCycles}/${MAX_TOTAL_REMEDIATION_CYCLES}), blocking`
        );

        await this.featureLoader.update(pr.projectPath, featureId, {
          status: 'blocked',
          workItemState: 'blocked',
          error: `Exceeded ${MAX_TOTAL_REMEDIATION_CYCLES} total remediation cycles (feedback + CI). Escalated.`,
        });

        this.events.emit('authority:awaiting-approval', {
          projectPath: pr.projectPath,
          proposal: {
            who: 'pr-feedback-service',
            what: 'escalate',
            target: featureId,
            justification: `PR #${pr.prNumber} exceeded ${MAX_TOTAL_REMEDIATION_CYCLES} total remediation cycles (feedback + CI failures)`,
            risk: 'high',
          },
          decision: {
            verdict: 'require_approval',
            reason: `Total remediation budget exceeded`,
          },
          blockerType: 'remediation_budget_exceeded',
          featureTitle: `PR #${pr.prNumber}`,
        });

        this.trackedPRs.delete(featureId);
        return;
      }

      const currentCiIterations = (feature.ciIterationCount as number | undefined) || 0;
      const ciIterationCount = currentCiIterations + 1;
      const newTotalCycles = currentTotalCycles + 1;

      logger.info(
        `CI failure for PR #${pr.prNumber} (feature ${featureId}): iteration ${ciIterationCount}, total cycles ${newTotalCycles}/${MAX_TOTAL_REMEDIATION_CYCLES}`
      );

      // Fetch failed check details
      const failedChecks = await this.fetchFailedChecks(pr, data.headSha);

      // Build CI fix prompt
      const continuationPrompt = await this.buildCIFixPrompt(
        pr.prNumber,
        ciIterationCount,
        failedChecks,
        featureId,
        pr.projectPath
      );

      // Update feature with CI iteration metadata
      await this.featureLoader.update(pr.projectPath, featureId, {
        status: 'backlog',
        workItemState: 'in_progress',
        ciIterationCount,
        remediationCycleCount: newTotalCycles,
        lastCheckSuiteId: data.checkSuiteId,
        error: undefined,
      });

      // Restart agent with CI fix prompt
      if (this.autoModeService) {
        void this.autoModeService.executeFeature(pr.projectPath, featureId, true, true, undefined, {
          continuationPrompt,
          retryCount: ciIterationCount,
          previousErrors: [],
          recoveryContext: `CI failure on PR #${pr.prNumber} (iteration ${ciIterationCount})`,
        });

        logger.info(
          `Restarted agent for ${featureId} to fix CI failures (iteration ${ciIterationCount})`
        );
      } else {
        logger.warn(`AutoModeService not available, cannot restart agent for CI fix`);
      }
    } catch (error) {
      logger.error(`Failed to handle CI failure for PR #${data.prNumber}:`, error);
    }
  }

  /**
   * Fetch failed check run details from GitHub.
   */
  private async fetchFailedChecks(
    pr: TrackedPR,
    headSha: string
  ): Promise<Array<{ name: string; conclusion: string; output: string }>> {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['api', `repos/{owner}/{repo}/commits/${headSha}/check-runs`, '--jq', '.check_runs'],
        {
          cwd: pr.projectPath,
          timeout: 15_000,
          encoding: 'utf-8',
        }
      );

      const checkRuns = JSON.parse(stdout) as Array<{
        name: string;
        status: string;
        conclusion: string;
        output?: {
          title?: string;
          summary?: string;
          text?: string;
        };
      }>;

      return checkRuns
        .filter((check) => check.conclusion === 'failure')
        .map((check) => ({
          name: check.name,
          conclusion: check.conclusion,
          output: [check.output?.title, check.output?.summary, check.output?.text]
            .filter(Boolean)
            .join('\n')
            .slice(0, 1000),
        }));
    } catch (error) {
      logger.debug(`Failed to fetch check runs for ${headSha}: ${error}`);
      return [];
    }
  }

  /**
   * Build continuation prompt for CI failure fix.
   */
  private async buildCIFixPrompt(
    prNumber: number,
    iteration: number,
    failedChecks: Array<{ name: string; conclusion: string; output: string }>,
    featureId: string,
    projectPath: string
  ): Promise<string> {
    let previousContext = '';
    try {
      const agentOutput = await this.featureLoader.getAgentOutput(projectPath, featureId);
      if (agentOutput) {
        const MAX_LENGTH = 50_000;
        const KEEP_LENGTH = 40_000;
        let truncatedOutput = agentOutput;
        if (agentOutput.length > MAX_LENGTH) {
          truncatedOutput = agentOutput.slice(-KEEP_LENGTH);
        }

        previousContext = `## Your Previous Work (CI Fix Iteration ${iteration - 1})

Below is the output from your previous work on this feature:

${truncatedOutput}

---

`;
      }
    } catch (error) {
      logger.debug(`No previous agent output found for ${featureId}`);
    }

    const checksDetails =
      failedChecks.length > 0
        ? failedChecks
            .map((check) => `### ${check.name}\n**Status:** ${check.conclusion}\n\n${check.output}`)
            .join('\n\n')
        : 'Check details not available. Run CI checks locally to debug.';

    return `${previousContext}## CI Failure - Fix Required (Iteration ${iteration})

Your pull request #${prNumber} has CI check failures. Please fix the following issues:

${checksDetails}

**Important Instructions:**
- Fix only the CI failures mentioned above
- Run tests locally to verify the fixes work
- Commit your fixes to the same branch (worktree is already set up)
- The fixes will be pushed to the existing PR #${prNumber}
- After fixing, CI will run again automatically

This is CI fix iteration ${iteration}.`;
  }

  /**
   * Poll CI status for PRs that are actively monitoring CI.
   * Called periodically by the main poll loop.
   */
  private async pollCIStatus(): Promise<void> {
    for (const [featureId, pr] of this.trackedPRs) {
      if (!pr.ciMonitoring) continue;

      const { headSha, startedAt, lastPolledAt } = pr.ciMonitoring;

      // Don't poll too frequently
      if (Date.now() - lastPolledAt < CI_POLL_INTERVAL_MS * 0.8) continue;

      // Timeout if CI takes too long
      if (Date.now() - startedAt > CI_MAX_WAIT_MS) {
        logger.warn(
          `CI monitoring for PR #${pr.prNumber} timed out after ${CI_MAX_WAIT_MS / 60000} minutes`
        );
        pr.ciMonitoring = undefined;
        continue;
      }

      try {
        const { stdout } = await execFileAsync(
          'gh',
          ['api', `repos/{owner}/{repo}/commits/${headSha}/check-runs`, '--jq', '.check_runs'],
          {
            cwd: pr.projectPath,
            timeout: 15_000,
            encoding: 'utf-8',
          }
        );

        const checkRuns = JSON.parse(stdout) as Array<{
          name: string;
          status: string;
          conclusion: string | null;
        }>;

        pr.ciMonitoring.lastPolledAt = Date.now();

        // Check if all checks are completed
        const allCompleted = checkRuns.every((check) => check.status === 'completed');
        if (!allCompleted) {
          logger.debug(`CI checks still running for PR #${pr.prNumber}, continuing to monitor`);
          continue;
        }

        // Check if any required checks failed
        const anyFailed = checkRuns.some((check) => check.conclusion === 'failure');
        if (anyFailed) {
          logger.info(`[POLL] CI failure detected for PR #${pr.prNumber}`);

          // Emit CI failure event (will be handled by handleCIFailure)
          this.events.emit('pr:ci-failure', {
            projectPath: pr.projectPath,
            prNumber: pr.prNumber,
            headBranch: pr.branchName,
            headSha,
            checkSuiteId: 0, // Polling doesn't have check suite ID
            checkSuiteUrl: null,
            repository: 'unknown',
            checksUrl: undefined,
          });

          pr.ciMonitoring = undefined;
        } else {
          logger.info(`[POLL] CI checks passed for PR #${pr.prNumber}, stopping monitoring`);
          pr.ciMonitoring = undefined;
        }
      } catch (error) {
        logger.error(`Failed to poll CI status for PR #${pr.prNumber}:`, error);
      }
    }
  }

  /**
   * Get all currently tracked PRs (for debugging/dashboard).
   */
  getTrackedPRs(): TrackedPR[] {
    return Array.from(this.trackedPRs.values());
  }

  /**
   * Process thread feedback after agent completes fixes and pushes.
   * Auto-resolve accepted threads and post denial reasoning on denied threads.
   *
   * @param projectPath - Project path
   * @param featureId - Feature ID
   * @param prNumber - PR number
   */
  async processThreadFeedback(
    projectPath: string,
    featureId: string,
    prNumber: number
  ): Promise<void> {
    try {
      // Load feature to get thread feedback
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature || !feature.threadFeedback) {
        logger.debug(`No thread feedback to process for feature ${featureId}`);
        return;
      }

      // Type assertion for threadFeedback
      const threadFeedback = feature.threadFeedback as ReviewThreadFeedback[];
      if (threadFeedback.length === 0) {
        logger.debug(`No thread feedback to process for feature ${featureId}`);
        return;
      }

      logger.info(
        `Processing thread feedback for PR #${prNumber}: ${threadFeedback.length} threads`
      );

      // Get PR GraphQL ID for replying to threads
      const prId = await codeRabbitResolverService.getPullRequestId(projectPath, prNumber);
      if (!prId) {
        logger.warn(`Could not get PR GraphQL ID for PR #${prNumber}, skipping thread resolution`);
        return;
      }

      // Separate accepted and denied threads
      const acceptedThreads = threadFeedback.filter((t) => t.status === 'accepted');
      const deniedThreads = threadFeedback.filter((t) => t.status === 'denied');

      let resolvedCount = 0;
      let deniedCount = 0;
      const now = new Date().toISOString();

      // Process accepted threads - auto-resolve
      if (acceptedThreads.length > 0) {
        logger.info(`Auto-resolving ${acceptedThreads.length} accepted threads`);

        for (const thread of acceptedThreads) {
          try {
            const resolved = await codeRabbitResolverService['resolveThread'](thread.threadId);
            if (resolved) {
              resolvedCount++;
              thread.resolvedAt = now;
              logger.debug(`Resolved accepted thread ${thread.threadId}`);
            }
          } catch (error) {
            logger.warn(`Failed to resolve accepted thread ${thread.threadId}:`, error);
          }
        }
      }

      // Process denied threads - post reasoning and resolve
      if (deniedThreads.length > 0) {
        logger.info(`Processing ${deniedThreads.length} denied threads with reasoning`);

        for (const thread of deniedThreads) {
          try {
            const reasoning = thread.agentReasoning || 'Evaluated and declined';
            const commentBody = `Evaluated and declined: ${reasoning}`;

            const success = await codeRabbitResolverService.replyAndResolveThread(
              thread.threadId,
              prId,
              commentBody
            );

            if (success) {
              deniedCount++;
              thread.resolvedAt = now;
              logger.debug(`Posted denial reasoning and resolved thread ${thread.threadId}`);
            }
          } catch (error) {
            logger.warn(`Failed to process denied thread ${thread.threadId}:`, error);
          }
        }
      }

      // Update feature with resolved timestamps
      await this.featureLoader.update(projectPath, featureId, {
        threadFeedback,
      });

      // Emit event with results
      this.events.emit('pr:threads-resolved', {
        projectPath,
        featureId,
        prNumber,
        resolvedCount,
        deniedCount,
        totalThreads: threadFeedback.length,
        acceptedThreadIds: acceptedThreads.map((t) => t.threadId),
        deniedThreadIds: deniedThreads.map((t) => t.threadId),
      });

      logger.info(
        `Thread resolution complete for PR #${prNumber}: ${resolvedCount} accepted, ${deniedCount} denied`
      );
    } catch (error) {
      logger.error(`Failed to process thread feedback for PR #${prNumber}:`, error);
    }
  }

  /**
   * Analyze COMMENTED review for actionable content.
   * Returns true if the review contains actionable items that require remediation.
   *
   * @param reviewInfo - The PR review info
   * @returns Whether the review contains actionable content
   */
  private isCommentedReviewActionable(reviewInfo: PRReviewInfo): boolean {
    // Check for CodeRabbit comments with severity markers or code suggestions
    const codeRabbitComments = reviewInfo.comments.filter((c) =>
      c.author.toLowerCase().includes('coderabbit')
    );

    if (codeRabbitComments.length > 0) {
      // Check if any CodeRabbit comments are actionable
      const actionableCodeRabbit = codeRabbitComments.some((c) => {
        const body = c.body.toLowerCase();
        // Walk-through summaries (no line-specific suggestions) - skip
        if (body.includes('walk-through') || body.includes('summary')) {
          return false;
        }
        // Severity markers or code suggestions - actionable
        return (
          body.includes('severity:') ||
          body.includes('suggestion:') ||
          body.includes('🚨') ||
          body.includes('⚠️') ||
          body.includes('```')
        );
      });

      if (actionableCodeRabbit) {
        logger.info(
          `COMMENTED review contains actionable CodeRabbit suggestions (severity markers or code suggestions)`
        );
        return true;
      }
    }

    // Check for human comments with imperative keywords
    const humanComments = reviewInfo.comments.filter(
      (c) =>
        !c.author.toLowerCase().includes('coderabbit') && !c.author.toLowerCase().includes('bot')
    );

    if (humanComments.length > 0) {
      const actionableHuman = humanComments.some((c) => {
        const body = c.body.toLowerCase();
        return (
          body.includes('should') ||
          body.includes('must') ||
          body.includes('needs') ||
          body.includes('fix') ||
          body.includes('change') ||
          body.includes('update') ||
          body.includes('remove') ||
          body.includes('add')
        );
      });

      if (actionableHuman) {
        logger.info(`COMMENTED review contains actionable human feedback (imperative keywords)`);
        return true;
      }
    }

    logger.info(`COMMENTED review has no actionable content - skipping remediation`);
    return false;
  }
}
