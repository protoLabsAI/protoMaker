/**
 * PR Feedback Service - Monitors open PRs for review feedback
 *
 * Orchestrates PR monitoring by delegating to:
 * - PRStatusChecker: GitHub API operations (review status, threads, CI checks)
 * - FeedbackAggregator: Agent continuation prompt building
 * - ThreadResolver: Thread decision tracking, escalation, and resolution
 *
 * Flow:
 * 1. Listens for 'auto_mode_git_workflow' events to track created PRs
 * 2. Periodically polls GitHub for review status on tracked PRs
 * 3. Detects: changes requested, comments, CodeRabbit feedback, approvals
 * 4. Emits 'pr:feedback-received' / 'pr:changes-requested' / 'pr:approved'
 * 5. EM agent picks up and handles reassignment or merge
 */

import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import type {
  GitHubComment,
  ReviewThreadFeedback,
  FeedbackThreadDecision,
  PendingFeedback,
} from '@protolabsai/types';
import { codeRabbitParserService } from './coderabbit-parser-service.js';
import {
  prStatusChecker,
  type TrackedPR,
  type PRReviewInfo,
  type ThreadFeedbackItem,
} from './pr-status-checker.js';
import { FeedbackAggregator } from './feedback-aggregator.js';
import { ThreadResolver } from './thread-resolver.js';
import {
  PR_FEEDBACK_POLL_INTERVAL_MS,
  PR_FEEDBACK_CI_POLL_INTERVAL_MS,
  PR_FEEDBACK_CI_MAX_WAIT_MS,
  PR_FEEDBACK_MISSING_CI_CHECK_THRESHOLD_MS,
} from '../config/timeouts.js';

const logger = createLogger('PRFeedbackRemediation');

/** Persisted format for a single tracked PR entry */
interface PersistedPREntry {
  featureId: string;
  projectPath: string;
  prNumber: number;
  prUrl: string;
  branchName: string;
  lastCheckedAt: number;
  ciStatus?: {
    headSha: string;
    startedAt: number;
    lastPolledAt: number;
  };
  reviewStatus: TrackedPR['reviewState'];
  remediationCount: number;
  trackedSince?: number;
}

/** Root persisted structure for pr-tracking.json */
interface PersistedPRTracking {
  trackedPRs: PersistedPREntry[];
  savedAt: string;
}

/** How often to poll for PR reviews */
const POLL_INTERVAL_MS = PR_FEEDBACK_POLL_INTERVAL_MS;

/** Max iterations before escalating to CTO - prevents infinite feedback loops */
const MAX_PR_ITERATIONS = 2;

/** Max total remediation cycles (feedback + CI combined) before blocking */
const MAX_TOTAL_REMEDIATION_CYCLES = 4;

/** How often to poll for CI check status (60s) */
const CI_POLL_INTERVAL_MS = PR_FEEDBACK_CI_POLL_INTERVAL_MS;

/** Max time to wait for CI checks to complete (10 minutes) */
const CI_MAX_WAIT_MS = PR_FEEDBACK_CI_MAX_WAIT_MS;

/**
 * How long a PR can wait before we alert on required CI checks that never registered.
 * A check is considered "permanently missing" when it has been absent this long.
 * Configurable via MISSING_CI_CHECK_THRESHOLD_MINUTES env variable (default: 30).
 */
const MISSING_CI_CHECK_THRESHOLD_MS = PR_FEEDBACK_MISSING_CI_CHECK_THRESHOLD_MS;

export class PRFeedbackService {
  private readonly events: EventEmitter;
  private readonly featureLoader: FeatureLoader;
  private autoModeService: AutoModeService | null = null;
  private leadEngineerService: { isFeatureActive(featureId: string): boolean } | null = null;

  /** Path to persisted PR tracking state */
  private readonly prTrackingPath: string;

  /** PRs we're actively monitoring, keyed by featureId */
  private trackedPRs = new Map<string, TrackedPR>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  /** Features currently under remediation - prevents concurrent remediation */
  private remediatingFeatures = new Set<string>();

  /** Collected evaluation decisions during remediation, keyed by featureId */
  private collectedDecisions = new Map<string, FeedbackThreadDecision[]>();

  /** Features already alerted for missing CI status checks (prevents repeat alerts) */
  private alertedMissingChecks = new Set<string>();

  private readonly feedbackAggregator: FeedbackAggregator;
  private readonly threadResolver: ThreadResolver;

  constructor(events: EventEmitter, featureLoader: FeatureLoader, dataDir: string) {
    this.events = events;
    this.featureLoader = featureLoader;
    this.prTrackingPath = path.join(dataDir, 'pr-tracking.json');
    this.feedbackAggregator = new FeedbackAggregator(featureLoader);
    this.threadResolver = new ThreadResolver(events, featureLoader);
  }

  setAutoModeService(service: AutoModeService): void {
    this.autoModeService = service;
  }

  setLeadEngineerService(service: { isFeatureActive(featureId: string): boolean }): void {
    this.leadEngineerService = service;
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    void this.loadPrTracking();

    // TODO: migrate to bus.on()
    this.events.subscribe((type, payload) => {
      if (type === 'auto-mode:event') {
        const data = payload as Record<string, unknown>;
        if (data.type === 'auto_mode_git_workflow' && data.prUrl && data.prNumber) {
          this.trackPR(data);
        }
      }

      if (type === 'feature:pr-merged') {
        const data = payload as Record<string, unknown>;
        const featureId = data.featureId as string;
        if (featureId && this.trackedPRs.has(featureId)) {
          logger.info(`PR merged for feature ${featureId}, stopping tracking`);
          this.trackedPRs.delete(featureId);
          void this.savePrTracking();
        }
      }

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

      if (type === 'feature:status-changed') {
        const data = payload as Record<string, unknown>;
        if (
          data.newStatus === 'review' &&
          data.featureId &&
          !this.trackedPRs.has(data.featureId as string)
        ) {
          void this.trackFeatureInReview(data);
        }
        // Clean up tracking when feature reaches done (non-merge path)
        if (data.newStatus === 'done' && data.featureId) {
          this.cleanupFeature(data.featureId as string);
        }
      }

      if (type === 'feature:deleted') {
        const data = payload as Record<string, unknown>;
        const featureId = (data.featureId as string) || (data.id as string);
        if (featureId) {
          this.cleanupFeature(featureId);
        }
      }

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
    this.trackedPRs.clear();
    this.remediatingFeatures.clear();
    this.collectedDecisions.clear();
    this.alertedMissingChecks.clear();
    this.initialized = false;
  }

  /**
   * Clean up all tracking state for a single feature.
   * Called when a feature is deleted or reaches done status.
   */
  private cleanupFeature(featureId: string): void {
    if (this.trackedPRs.has(featureId)) {
      logger.info(`Cleaning up tracked PR for feature ${featureId}`);
      this.trackedPRs.delete(featureId);
      void this.savePrTracking();
    }
    this.remediatingFeatures.delete(featureId);
    this.collectedDecisions.delete(featureId);
    this.alertedMissingChecks.delete(featureId);
  }

  /**
   * Remove all tracked PRs for a given project path.
   * Called when a project is deleted or its path changes.
   */
  removeTrackedPRsForProject(projectPath: string): void {
    const toRemove: string[] = [];
    for (const [featureId, pr] of this.trackedPRs) {
      if (pr.projectPath === projectPath) {
        toRemove.push(featureId);
      }
    }
    for (const featureId of toRemove) {
      this.cleanupFeature(featureId);
    }
    if (toRemove.length > 0) {
      logger.info(`Removed ${toRemove.length} tracked PRs for project ${projectPath}`);
    }
  }

  async restoreTrackedPRsForProject(projectPath: string): Promise<void> {
    try {
      const features = await this.featureLoader.getAll(projectPath);
      let restoredCount = 0;

      for (const feature of features) {
        if (feature.status === 'review' && feature.prNumber && feature.prUrl) {
          const lastPolledAt =
            feature.prLastPolledAt && typeof feature.prLastPolledAt === 'string'
              ? new Date(feature.prLastPolledAt).getTime()
              : 0;

          const trackedSince =
            feature.prTrackedSince && typeof feature.prTrackedSince === 'string'
              ? new Date(feature.prTrackedSince).getTime()
              : lastPolledAt || Date.now();

          this.trackedPRs.set(feature.id, {
            featureId: feature.id,
            projectPath,
            prNumber: feature.prNumber,
            prUrl: feature.prUrl,
            branchName: feature.branchName || '',
            lastCheckedAt: lastPolledAt,
            reviewState: 'pending',
            iterationCount: feature.prIterationCount || 0,
            trackedSince,
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

  private trackPR(data: Record<string, unknown>): void {
    const featureId = data.featureId as string;
    const projectPath = data.projectPath as string;
    const prNumber = data.prNumber as number;
    const prUrl = data.prUrl as string;

    if (!featureId || !prNumber) return;

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
      trackedSince: existing?.trackedSince ?? Date.now(),
    });
    void this.savePrTracking();

    void this.featureLoader.update(projectPath, featureId, {
      prUrl,
      prNumber,
      prTrackedSince: existing ? undefined : now,
      prLastPolledAt: now,
    });

    logger.info(`Tracking PR #${prNumber} for feature ${featureId}`);
  }

  private async trackFeatureInReview(data: Record<string, unknown>): Promise<void> {
    const featureId = data.featureId as string;
    const projectPath = data.projectPath as string;

    if (!featureId || !projectPath) return;

    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature || !feature.prNumber || !feature.prUrl) {
        logger.debug(`Feature ${featureId} entered review but has no PR info — skipping tracking`);
        return;
      }

      this.trackedPRs.set(featureId, {
        featureId,
        projectPath,
        prNumber: feature.prNumber,
        prUrl: feature.prUrl,
        branchName: feature.branchName || '',
        lastCheckedAt: 0,
        reviewState: 'pending',
        iterationCount: feature.prIterationCount || 0,
        trackedSince: Date.now(),
      });
      void this.savePrTracking();

      logger.info(
        `Tracking PR #${feature.prNumber} for feature ${featureId} (entered review via status change)`
      );
    } catch (error) {
      logger.error(`Failed to track feature ${featureId} entering review:`, error);
    }
  }

  private async handleWebhookReview(data: {
    prNumber: number;
    branchName: string;
    reviewState: string;
    reviewBody?: string;
    reviewer?: string;
  }): Promise<void> {
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
      const reviewInfo = await prStatusChecker.fetchPRReviewStatus(pr);
      if (!reviewInfo) {
        logger.warn(`Failed to fetch review info for webhook PR #${data.prNumber}`);
        return;
      }

      pr.lastProcessedReviewAt = Date.now();
      pr.lastCheckedAt = Date.now();

      await this.processReviewStatus(featureId, pr, reviewInfo, 'webhook');
    } catch (error) {
      logger.error(`Failed to process webhook review for PR #${data.prNumber}:`, error);
    }
  }

  private async pollAllPRs(): Promise<void> {
    await this.pollCIStatus();
    await this.detectMissingCIChecks();

    for (const [featureId, pr] of this.trackedPRs) {
      if (Date.now() - pr.lastCheckedAt < POLL_INTERVAL_MS * 0.8) continue;

      try {
        const reviewInfo = await prStatusChecker.fetchPRReviewStatus(pr);
        const now = Date.now();
        pr.lastCheckedAt = now;

        await this.featureLoader.update(pr.projectPath, featureId, {
          prLastPolledAt: new Date(now).toISOString(),
        });

        if (!reviewInfo) continue;

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

  private async processReviewStatus(
    featureId: string,
    pr: TrackedPR,
    reviewInfo: PRReviewInfo,
    detectionMethod: 'webhook' | 'poll' = 'poll'
  ): Promise<void> {
    const previousState = pr.reviewState;
    const detectionLabel = detectionMethod === 'webhook' ? '[WEBHOOK]' : '[POLL]';

    switch (reviewInfo.state) {
      case 'CHANGES_REQUESTED': {
        if (previousState === 'changes_requested') return;

        pr.reviewState = 'changes_requested';
        pr.iterationCount++;
        void this.savePrTracking();

        const feedbackSummary = reviewInfo.reviews
          .filter((r) => r.state === 'CHANGES_REQUESTED')
          .map((r) => `${r.author}: ${r.body}`)
          .join('\n');

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

        const feature = await this.featureLoader.get(pr.projectPath, featureId);
        const currentTotalCycles = (feature?.remediationCycleCount as number | undefined) || 0;
        const totalCycles = currentTotalCycles + 1;

        await this.featureLoader.update(pr.projectPath, featureId, {
          lastReviewFeedback: fullFeedback.slice(0, 2000),
          prIterationCount: pr.iterationCount,
          remediationCycleCount: totalCycles,
        });

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
            decision: { verdict: 'require_approval', reason: `Total remediation budget exceeded` },
            blockerType: 'remediation_budget_exceeded',
            featureTitle: `PR #${pr.prNumber}`,
          });

          this.trackedPRs.delete(featureId);
          void this.savePrTracking();
          return;
        }

        if (pr.iterationCount > MAX_PR_ITERATIONS) {
          logger.warn('Iteration budget exhausted, escalating', {
            featureId,
            prNumber: pr.prNumber,
            iteration: pr.iterationCount,
            maxIterations: MAX_PR_ITERATIONS,
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

          await this.featureLoader.update(pr.projectPath, featureId, {
            workItemState: 'blocked',
            error: `PR exceeded ${MAX_PR_ITERATIONS} review iterations. Escalated to CTO.`,
          });
        } else {
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

          if (this.autoModeService) {
            if (this.leadEngineerService?.isFeatureActive(featureId)) {
              logger.info(
                `Feature ${featureId} is managed by Lead Engineer state machine, skipping PRFeedbackService remediation`
              );
              return;
            }

            if (this.remediatingFeatures.has(featureId)) {
              logger.info(
                `Feature ${featureId} is already under remediation, queueing feedback for later`
              );

              const threads = await prStatusChecker.fetchReviewThreads(pr);

              await this.featureLoader.update(pr.projectPath, featureId, {
                pendingFeedback: {
                  queuedAt: new Date().toISOString(),
                  iterationCount: pr.iterationCount,
                  threads: threads.map((t) => ({
                    threadId: t.threadId,
                    severity: t.severity,
                    message: t.message,
                    location: t.location,
                    suggestedFix: t.suggestedFix,
                    isBot: t.isBot,
                  })),
                },
              });

              this.events.emit('pr:feedback-queued', {
                projectPath: pr.projectPath,
                featureId,
                prNumber: pr.prNumber,
                iterationCount: pr.iterationCount,
                reason: 'remediation_in_progress',
              });
              return;
            }

            logger.info('Starting agent remediation cycle', {
              featureId,
              prNumber: pr.prNumber,
              iteration: pr.iterationCount,
              cycleType: 'feedback',
            });

            try {
              this.remediatingFeatures.add(featureId);
              this.collectedDecisions.set(featureId, []);

              const threads = await prStatusChecker.fetchReviewThreads(pr);
              this.threadResolver.classifyAndEmitEscalations(threads, pr, featureId);

              const continuationPrompt = await this.feedbackAggregator.buildRemediationPrompt(
                threads,
                pr.prNumber,
                pr.iterationCount,
                featureId,
                pr.projectPath
              );

              this.events.emit('pr:remediation-started', {
                projectPath: pr.projectPath,
                featureId,
                prNumber: pr.prNumber,
                iterationCount: pr.iterationCount,
                threadCount: threads.length,
              });

              await this.featureLoader.update(pr.projectPath, featureId, {
                status: 'backlog',
                workItemState: 'in_progress',
                prIterationCount: pr.iterationCount,
                error: undefined,
              });

              this.autoModeService
                .executeFeature(pr.projectPath, featureId, true, true, undefined, {
                  continuationPrompt,
                  retryCount: pr.iterationCount,
                  previousErrors: [],
                  recoveryContext: `PR #${pr.prNumber} review feedback (iteration ${pr.iterationCount})`,
                })
                .then(async () => {
                  await this.processRemediationComplete(pr.projectPath, featureId, pr);
                })
                .catch(async (error) => {
                  logger.error(`Remediation failed for ${featureId}:`, error);
                  this.remediatingFeatures.delete(featureId);
                  this.collectedDecisions.delete(featureId);
                  this.events.emit('pr:remediation-failed', {
                    projectPath: pr.projectPath,
                    featureId,
                    prNumber: pr.prNumber,
                    error: String(error),
                  });
                });

              logger.info('Agent remediation started successfully', {
                featureId,
                prNumber: pr.prNumber,
                iteration: pr.iterationCount,
              });
            } catch (error) {
              logger.error(`Failed to start remediation agent for ${featureId}:`, error);
              this.remediatingFeatures.delete(featureId);
              this.collectedDecisions.delete(featureId);
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
        });
        break;
      }

      case 'APPROVED': {
        if (previousState === 'approved') return;

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
        });

        this.trackedPRs.delete(featureId);
        void this.savePrTracking();
        break;
      }

      case 'COMMENTED': {
        if (previousState !== 'commented') {
          pr.reviewState = 'commented';
          void this.savePrTracking();

          const isActionable = this.feedbackAggregator.isCommentedReviewActionable(reviewInfo);

          if (isActionable) {
            logger.info(
              `${detectionLabel} PR #${pr.prNumber}: COMMENTED review contains actionable feedback`
            );

            pr.iterationCount++;
            void this.savePrTracking();

            const feedbackSummary = reviewInfo.comments
              .map((c) => `${c.author}: ${c.body}`)
              .join('\n---\n');

            await this.featureLoader.update(pr.projectPath, featureId, {
              lastReviewFeedback: feedbackSummary.slice(0, 2000),
              prIterationCount: pr.iterationCount,
            });

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

            if (this.autoModeService) {
              logger.info(
                `Auto-restarting dev agent for ${featureId} with COMMENTED review feedback (iteration ${pr.iterationCount})`
              );

              try {
                const threads = await prStatusChecker.fetchReviewThreads(pr);
                this.threadResolver.classifyAndEmitEscalations(threads, pr, featureId);

                const continuationPrompt = await this.feedbackAggregator.buildFeedbackPrompt(
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
          logger.info('PR commented', {
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

  private async processRemediationComplete(
    projectPath: string,
    featureId: string,
    pr: TrackedPR
  ): Promise<void> {
    try {
      logger.info(`Processing remediation completion for feature ${featureId}`);

      const decisions = this.collectedDecisions.get(featureId) || [];

      if (decisions.length === 0) {
        const parsedDecisions = await this.threadResolver.parseDecisionsFromAgentOutput(
          projectPath,
          featureId
        );
        if (parsedDecisions.length > 0) {
          decisions.push(...parsedDecisions);
          logger.info(
            `Parsed ${parsedDecisions.length} decisions from agent output for ${featureId}`
          );
        }
      }

      if (decisions.length > 0) {
        const threadFeedback: ReviewThreadFeedback[] = decisions.map((d) => ({
          threadId: d.threadId,
          status: d.decision === 'accept' ? ('accepted' as const) : ('denied' as const),
          agentReasoning: d.reasoning,
          resolvedAt: new Date().toISOString(),
        }));

        await this.featureLoader.update(projectPath, featureId, { threadFeedback });

        for (const decision of decisions) {
          this.events.emit('pr:thread-evaluated', {
            projectPath,
            featureId,
            prNumber: pr.prNumber,
            threadId: decision.threadId,
            decision: decision.decision,
            reasoning: decision.reasoning,
            plannedFix: decision.plannedFix,
          });
        }

        logger.info(
          `Stored ${decisions.length} thread decisions for feature ${featureId}: ` +
            `${decisions.filter((d) => d.decision === 'accept').length} accepted, ` +
            `${decisions.filter((d) => d.decision === 'deny').length} denied`
        );

        // Fetch threads for denial escalation severity info
        let threads: ThreadFeedbackItem[] = [];
        try {
          threads = await prStatusChecker.fetchReviewThreads(pr);
        } catch (error) {
          logger.warn(`Could not fetch threads for denial escalation check: ${error}`);
        }

        await this.threadResolver.handleDenialEscalations(
          projectPath,
          featureId,
          pr,
          decisions,
          threads
        );
      }

      this.remediatingFeatures.delete(featureId);
      this.collectedDecisions.delete(featureId);

      this.events.emit('pr:remediation-completed', {
        projectPath,
        featureId,
        prNumber: pr.prNumber,
        iterationCount: pr.iterationCount,
        decisionsCount: decisions.length,
        acceptedCount: decisions.filter((d) => d.decision === 'accept').length,
        deniedCount: decisions.filter((d) => d.decision === 'deny').length,
      });

      const feature = await this.featureLoader.get(projectPath, featureId);
      if (feature?.pendingFeedback) {
        logger.info(
          `Feature ${featureId} has pending feedback from iteration ${feature.pendingFeedback.iterationCount}, processing...`
        );

        await this.featureLoader.update(projectPath, featureId, { pendingFeedback: undefined });

        setTimeout(() => {
          void this.processPendingFeedback(projectPath, featureId, pr, feature.pendingFeedback!);
        }, 1000);
      }
    } catch (error) {
      logger.error(`Error processing remediation completion for ${featureId}:`, error);
      this.remediatingFeatures.delete(featureId);
      this.collectedDecisions.delete(featureId);
    }
  }

  private async processPendingFeedback(
    projectPath: string,
    featureId: string,
    pr: TrackedPR,
    pendingFeedback: PendingFeedback
  ): Promise<void> {
    try {
      logger.info(
        `Processing pending feedback for ${featureId} (iteration ${pendingFeedback.iterationCount})`
      );

      if (this.remediatingFeatures.has(featureId)) {
        logger.warn(
          `Feature ${featureId} is already under remediation, re-queueing pending feedback`
        );
        await this.featureLoader.update(projectPath, featureId, { pendingFeedback });
        return;
      }

      const threads: ThreadFeedbackItem[] = pendingFeedback.threads.map(
        (t: PendingFeedback['threads'][number]) => ({
          threadId: t.threadId,
          severity: t.severity,
          message: t.message,
          location: t.location,
          suggestedFix: t.suggestedFix,
          isBot: t.isBot,
          category: undefined,
        })
      );

      pr.iterationCount = pendingFeedback.iterationCount;

      this.remediatingFeatures.add(featureId);
      this.collectedDecisions.set(featureId, []);

      const continuationPrompt = await this.feedbackAggregator.buildRemediationPrompt(
        threads,
        pr.prNumber,
        pr.iterationCount,
        featureId,
        projectPath
      );

      this.events.emit('pr:remediation-started', {
        projectPath,
        featureId,
        prNumber: pr.prNumber,
        iterationCount: pr.iterationCount,
        threadCount: threads.length,
        source: 'pending_queue',
      });

      await this.featureLoader.update(projectPath, featureId, {
        status: 'backlog',
        workItemState: 'in_progress',
        prIterationCount: pr.iterationCount,
        error: undefined,
      });

      if (this.autoModeService) {
        this.autoModeService
          .executeFeature(projectPath, featureId, true, true, undefined, {
            continuationPrompt,
            retryCount: pr.iterationCount,
            previousErrors: [],
            recoveryContext: `PR #${pr.prNumber} pending review feedback (iteration ${pr.iterationCount})`,
          })
          .then(async () => {
            await this.processRemediationComplete(projectPath, featureId, pr);
          })
          .catch(async (error) => {
            logger.error(`Pending feedback remediation failed for ${featureId}:`, error);
            this.remediatingFeatures.delete(featureId);
            this.collectedDecisions.delete(featureId);
            this.events.emit('pr:remediation-failed', {
              projectPath,
              featureId,
              prNumber: pr.prNumber,
              error: String(error),
              source: 'pending_queue',
            });
          });
      }
    } catch (error) {
      logger.error(`Failed to process pending feedback for ${featureId}:`, error);
      this.remediatingFeatures.delete(featureId);
      this.collectedDecisions.delete(featureId);
    }
  }

  /**
   * Detect PRs that have been waiting longer than MISSING_CI_CHECK_THRESHOLD_MS
   * for required status checks that have never registered on the commit.
   *
   * This catches misconfigured CI workflows (e.g. a workflow that only triggers
   * on PRs targeting `main` while branch protection is configured on `dev`).
   */
  private async detectMissingCIChecks(): Promise<void> {
    const now = Date.now();

    for (const [featureId, pr] of this.trackedPRs) {
      // Only surface once per PR tracking session
      if (this.alertedMissingChecks.has(featureId)) continue;

      // Only flag PRs still in the initial pending state — changes_requested / approved
      // mean the pipeline is already moving
      if (pr.reviewState !== 'pending') continue;

      // Must have been tracked long enough for checks to reasonably appear
      const trackedSince = pr.trackedSince ?? now;
      const waitingMs = now - trackedSince;
      if (waitingMs < MISSING_CI_CHECK_THRESHOLD_MS) continue;

      try {
        // Resolve base branch and HEAD SHA from GitHub
        const prDetails = await prStatusChecker.fetchPRDetails(pr);
        if (!prDetails) continue;

        const { baseBranch, headSha } = prDetails;

        // Fetch what checks are required on the target branch
        const requiredChecks = await prStatusChecker.fetchRequiredStatusChecks(pr, baseBranch);
        if (requiredChecks.length === 0) continue;

        // Fetch check runs that have actually been registered for the HEAD commit
        const checkRuns = await prStatusChecker.fetchCICheckRuns(pr, headSha);
        const registeredCheckNames = new Set(checkRuns.map((c) => c.name));

        // A check is "permanently missing" when it has never appeared at all
        const missingChecks = requiredChecks.filter((name) => !registeredCheckNames.has(name));
        if (missingChecks.length === 0) continue;

        const waitingMinutes = Math.round(waitingMs / 60_000);

        logger.warn(
          `PR #${pr.prNumber} (feature ${featureId}) has been waiting ${waitingMinutes}m for required CI checks that never registered: ${missingChecks.join(', ')}. ` +
            `Base branch: '${baseBranch}'. Possible cause: CI workflow not configured to trigger on PRs targeting '${baseBranch}'.`
        );

        // Mark as alerted so we don't repeat on every poll cycle
        this.alertedMissingChecks.add(featureId);

        this.events.emit('pr:missing-ci-checks', {
          projectPath: pr.projectPath,
          featureId,
          prNumber: pr.prNumber,
          prUrl: pr.prUrl,
          branchName: pr.branchName,
          baseBranch,
          headSha,
          missingChecks,
          waitingMinutes,
          possibleCauses: [
            `CI workflow may not be configured to trigger on PRs targeting '${baseBranch}'`,
            `Check that the workflow trigger includes 'branches: [${baseBranch}]' or uses a wildcard`,
            `Verify the workflow file is valid YAML and has not been accidentally excluded`,
          ],
        });
      } catch (error) {
        logger.debug(`Failed to check for missing CI checks on PR #${pr.prNumber}: ${error}`);
      }
    }
  }

  startCIMonitoring(featureId: string, headSha: string): void {
    const pr = this.trackedPRs.get(featureId);
    if (!pr) {
      logger.warn(`Cannot start CI monitoring for ${featureId} - PR not tracked`);
      return;
    }

    pr.ciMonitoring = { headSha, startedAt: Date.now(), lastPolledAt: 0 };

    logger.info(
      `Started CI monitoring for PR #${pr.prNumber} (feature ${featureId}, sha: ${headSha.slice(0, 7)})`
    );
  }

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
      const feature = await this.featureLoader.get(pr.projectPath, featureId);
      if (!feature) {
        logger.warn(`Feature ${featureId} not found, cannot process CI failure`);
        return;
      }

      if (feature.lastCheckSuiteId === data.checkSuiteId) {
        logger.debug(
          `Check suite ${data.checkSuiteId} already processed for ${featureId}, skipping`
        );
        return;
      }

      pr.ciMonitoring = undefined;

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
          decision: { verdict: 'require_approval', reason: `Total remediation budget exceeded` },
          blockerType: 'remediation_budget_exceeded',
          featureTitle: `PR #${pr.prNumber}`,
        });

        this.trackedPRs.delete(featureId);
        void this.savePrTracking();
        return;
      }

      const currentCiIterations = (feature.ciIterationCount as number | undefined) || 0;
      const ciIterationCount = currentCiIterations + 1;
      const newTotalCycles = currentTotalCycles + 1;

      logger.info(
        `CI failure for PR #${pr.prNumber} (feature ${featureId}): iteration ${ciIterationCount}, total cycles ${newTotalCycles}/${MAX_TOTAL_REMEDIATION_CYCLES}`
      );

      const failedChecks = await prStatusChecker.fetchFailedChecks(pr, data.headSha);

      const continuationPrompt = await this.feedbackAggregator.buildCIFixPrompt(
        pr.prNumber,
        ciIterationCount,
        failedChecks,
        featureId,
        pr.projectPath
      );

      await this.featureLoader.update(pr.projectPath, featureId, {
        status: 'backlog',
        workItemState: 'in_progress',
        ciIterationCount,
        remediationCycleCount: newTotalCycles,
        lastCheckSuiteId: data.checkSuiteId,
        error: undefined,
      });

      if (this.autoModeService) {
        if (this.leadEngineerService?.isFeatureActive(featureId)) {
          logger.info(
            `Feature ${featureId} is managed by Lead Engineer state machine, skipping CI remediation`
          );
          return;
        }

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

  private async pollCIStatus(): Promise<void> {
    for (const [_featureId, pr] of this.trackedPRs) {
      if (!pr.ciMonitoring) continue;

      const { headSha, startedAt, lastPolledAt } = pr.ciMonitoring;

      if (Date.now() - lastPolledAt < CI_POLL_INTERVAL_MS * 0.8) continue;

      if (Date.now() - startedAt > CI_MAX_WAIT_MS) {
        logger.warn(
          `CI monitoring for PR #${pr.prNumber} timed out after ${CI_MAX_WAIT_MS / 60000} minutes`
        );
        pr.ciMonitoring = undefined;
        continue;
      }

      try {
        const checkRuns = await prStatusChecker.fetchCICheckRuns(pr, headSha);
        pr.ciMonitoring.lastPolledAt = Date.now();

        const allCompleted = checkRuns.every((check) => check.status === 'completed');
        if (!allCompleted) {
          logger.debug(`CI checks still running for PR #${pr.prNumber}, continuing to monitor`);
          continue;
        }

        const anyFailed = checkRuns.some((check) => check.conclusion === 'failure');
        if (anyFailed) {
          logger.info(`[POLL] CI failure detected for PR #${pr.prNumber}`);

          this.events.emit('pr:ci-failure', {
            projectPath: pr.projectPath,
            prNumber: pr.prNumber,
            headBranch: pr.branchName,
            headSha,
            checkSuiteId: 0,
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

  getTrackedPRs(): TrackedPR[] {
    return Array.from(this.trackedPRs.values());
  }

  isFeatureRemediating(featureId: string): boolean {
    return this.remediatingFeatures.has(featureId);
  }

  async processThreadFeedback(
    projectPath: string,
    featureId: string,
    prNumber: number
  ): Promise<void> {
    return this.threadResolver.processThreadFeedback(projectPath, featureId, prNumber);
  }

  async buildThreadFeedbackPrompt(pr: TrackedPR): Promise<string> {
    try {
      const threads = await prStatusChecker.fetchReviewThreads(pr);
      return this.feedbackAggregator.buildThreadFeedbackPrompt(pr.prNumber, threads);
    } catch (error) {
      logger.error(`Failed to build thread feedback prompt for PR #${pr.prNumber}:`, error);
      return `Error fetching review threads: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /** Persist current trackedPRs map to disk */
  private async savePrTracking(): Promise<void> {
    try {
      await mkdir(path.dirname(this.prTrackingPath), { recursive: true });
      const entries: PersistedPREntry[] = Array.from(this.trackedPRs.values()).map((pr) => ({
        featureId: pr.featureId,
        projectPath: pr.projectPath,
        prNumber: pr.prNumber,
        prUrl: pr.prUrl,
        branchName: pr.branchName,
        lastCheckedAt: pr.lastCheckedAt,
        ciStatus: pr.ciMonitoring
          ? {
              headSha: pr.ciMonitoring.headSha,
              startedAt: pr.ciMonitoring.startedAt,
              lastPolledAt: pr.ciMonitoring.lastPolledAt,
            }
          : undefined,
        reviewStatus: pr.reviewState,
        remediationCount: pr.iterationCount,
        trackedSince: pr.trackedSince,
      }));
      const data: PersistedPRTracking = {
        trackedPRs: entries,
        savedAt: new Date().toISOString(),
      };
      await atomicWriteJson(this.prTrackingPath, data);
    } catch (error) {
      logger.error('Failed to persist PR tracking state:', error);
    }
  }

  /** Load persisted PR tracking state on startup, filtering out stale entries */
  private async loadPrTracking(): Promise<void> {
    try {
      const result = await readJsonWithRecovery<PersistedPRTracking | null>(
        this.prTrackingPath,
        null
      );
      if (!result.data?.trackedPRs?.length) return;

      let restored = 0;
      let stale = 0;

      for (const entry of result.data.trackedPRs) {
        if (this.trackedPRs.has(entry.featureId)) continue;

        try {
          const feature = await this.featureLoader.get(entry.projectPath, entry.featureId);
          if (!feature || feature.status === 'done' || feature.status === 'merged') {
            stale++;
            continue;
          }

          this.trackedPRs.set(entry.featureId, {
            featureId: entry.featureId,
            projectPath: entry.projectPath,
            prNumber: entry.prNumber,
            prUrl: entry.prUrl,
            branchName: entry.branchName,
            lastCheckedAt: entry.lastCheckedAt,
            reviewState: entry.reviewStatus,
            iterationCount: entry.remediationCount,
            trackedSince: entry.trackedSince,
            ciMonitoring: entry.ciStatus,
          });
          restored++;
        } catch (err) {
          logger.warn(`Failed to validate PR tracking entry for feature ${entry.featureId}:`, err);
          stale++;
        }
      }

      if (stale > 0) {
        // Rewrite file without stale entries
        void this.savePrTracking();
      }

      if (restored > 0) {
        logger.info(`Restored ${restored} tracked PRs from disk (${stale} stale entries removed)`);
      }
    } catch (error) {
      logger.error('Failed to load PR tracking state from disk:', error);
    }
  }
}
