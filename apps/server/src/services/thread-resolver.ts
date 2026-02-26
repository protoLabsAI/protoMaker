/**
 * Thread Resolver - Thread decision tracking and resolution for PR feedback
 *
 * Handles:
 * - Parsing agent thread evaluation decisions from agent output
 * - Emitting escalation signals for critical/warning severity findings
 * - Resolving accepted threads and posting denial reasoning on rejected threads
 * - Processing thread feedback after agent remediation completes
 */

import { createLogger } from '@protolabs-ai/utils';
import type { FeedbackThreadDecision, ReviewThreadFeedback } from '@protolabs-ai/types';
import { EscalationSeverity, EscalationSource } from '@protolabs-ai/types';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { TrackedPR, ThreadFeedbackItem } from './pr-status-checker.js';
import { codeRabbitResolverService } from './coderabbit-resolver-service.js';

const logger = createLogger('ThreadResolver');

export class ThreadResolver {
  constructor(
    private readonly events: EventEmitter,
    private readonly featureLoader: FeatureLoader
  ) {}

  /**
   * Emit escalation signals for critical and warning severity threads.
   * Routes critical feedback to the EscalationRouter for appropriate handling.
   */
  classifyAndEmitEscalations(
    threads: ThreadFeedbackItem[],
    pr: TrackedPR,
    featureId: string
  ): void {
    const criticalThreads = threads.filter((t) => t.severity === 'critical');
    const warningThreads = threads.filter((t) => t.severity === 'warning');

    if (criticalThreads.length > 0) {
      logger.warn(
        `PR #${pr.prNumber} has ${criticalThreads.length} critical findings, emitting escalation signal`
      );

      this.events.emit('escalation:signal-received', {
        source: EscalationSource.pr_feedback,
        severity: EscalationSeverity.critical,
        type: 'pr_critical_feedback',
        context: {
          featureId,
          prNumber: pr.prNumber,
          prUrl: pr.prUrl,
          projectPath: pr.projectPath,
          criticalCount: criticalThreads.length,
          criticalThreads: criticalThreads.map((t) => ({
            threadId: t.threadId,
            message: t.message,
            location: t.location,
            isBot: t.isBot,
          })),
          iterationCount: pr.iterationCount,
        },
        deduplicationKey: `pr_critical_${pr.prNumber}_${pr.iterationCount}`,
        timestamp: new Date().toISOString(),
      });
    }

    if (warningThreads.length > 0) {
      logger.info(
        `PR #${pr.prNumber} has ${warningThreads.length} warning findings, emitting escalation signal`
      );

      this.events.emit('escalation:signal-received', {
        source: EscalationSource.pr_feedback,
        severity: EscalationSeverity.high,
        type: 'pr_warning_feedback',
        context: {
          featureId,
          prNumber: pr.prNumber,
          prUrl: pr.prUrl,
          projectPath: pr.projectPath,
          warningCount: warningThreads.length,
          warningThreads: warningThreads.map((t) => ({
            threadId: t.threadId,
            message: t.message,
            location: t.location,
            isBot: t.isBot,
          })),
          iterationCount: pr.iterationCount,
        },
        deduplicationKey: `pr_warning_${pr.prNumber}_${pr.iterationCount}`,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(
      `Severity classification for PR #${pr.prNumber}: ` +
        `${criticalThreads.length} critical, ${warningThreads.length} warning, ` +
        `${threads.filter((t) => t.severity === 'suggestion').length} suggestion, ` +
        `${threads.filter((t) => t.severity === 'info').length} info`
    );
  }

  /**
   * Parse thread evaluation decisions from agent output.
   * Looks for XML-formatted evaluation blocks in the agent output.
   */
  async parseDecisionsFromAgentOutput(
    projectPath: string,
    featureId: string
  ): Promise<FeedbackThreadDecision[]> {
    const decisions: FeedbackThreadDecision[] = [];

    try {
      const agentOutput = await this.featureLoader.getAgentOutput(projectPath, featureId);
      if (!agentOutput) return decisions;

      const evalRegex =
        /<thread_evaluation>\s*<thread_id>([^<]+)<\/thread_id>\s*<decision>(accept|deny)<\/decision>\s*<reasoning>([^<]*)<\/reasoning>(?:\s*<planned_fix>([^<]*)<\/planned_fix>)?\s*<\/thread_evaluation>/gi;

      let match;
      while ((match = evalRegex.exec(agentOutput)) !== null) {
        decisions.push({
          threadId: match[1].trim(),
          decision: match[2].toLowerCase() as 'accept' | 'deny',
          reasoning: match[3].trim(),
          plannedFix: match[4]?.trim(),
        });
      }
    } catch (error) {
      logger.error(`Failed to parse decisions from agent output for ${featureId}:`, error);
    }

    return decisions;
  }

  /**
   * Handle escalations for denied critical/warning threads.
   * Critical denials: emergency severity escalation
   * Warning denials: high severity escalation
   */
  async handleDenialEscalations(
    projectPath: string,
    featureId: string,
    pr: TrackedPR,
    decisions: FeedbackThreadDecision[],
    threads: ThreadFeedbackItem[]
  ): Promise<void> {
    try {
      const threadSeverityMap = new Map<string, ThreadFeedbackItem['severity']>();
      for (const thread of threads) {
        threadSeverityMap.set(thread.threadId, thread.severity);
      }

      const deniedDecisions = decisions.filter((d) => d.decision === 'deny');

      const criticalDenials = deniedDecisions.filter(
        (d) => threadSeverityMap.get(d.threadId) === 'critical'
      );
      const warningDenials = deniedDecisions.filter(
        (d) => threadSeverityMap.get(d.threadId) === 'warning'
      );

      const feature = await this.featureLoader.get(projectPath, featureId);
      const featureTitle = feature?.title || `Feature ${featureId}`;

      if (deniedDecisions.length > 0) {
        const remediationHistory = (feature?.remediationHistory ||
          []) as import('@protolabs-ai/types').RemediationHistoryEntry[];
        const currentEntry = remediationHistory.find(
          (entry) => entry.iteration === pr.iterationCount && !entry.completedAt
        );

        if (currentEntry) {
          currentEntry.deniedCount = deniedDecisions.length;
          currentEntry.completedAt = new Date().toISOString();
          currentEntry.denialAuditTrail = deniedDecisions.map((denial) => ({
            threadId: denial.threadId,
            severity: threadSeverityMap.get(denial.threadId) || 'info',
            reasoning: denial.reasoning,
            deniedAt: new Date().toISOString(),
          }));
        }

        await this.featureLoader.update(projectPath, featureId, { remediationHistory });
      }

      if (criticalDenials.length > 0) {
        logger.warn(
          `Critical feedback denied by agent for PR #${pr.prNumber}: ${criticalDenials.length} critical threads`
        );

        for (const denial of criticalDenials) {
          const thread = threads.find((t) => t.threadId === denial.threadId);

          this.events.emit('escalation:signal-received', {
            source: EscalationSource.pr_feedback,
            severity: EscalationSeverity.emergency,
            type: 'critical_feedback_denied',
            context: {
              featureId,
              featureTitle,
              projectPath,
              prNumber: pr.prNumber,
              prUrl: pr.prUrl,
              threadId: denial.threadId,
              threadMessage: thread?.message || 'Unknown',
              threadLocation: thread?.location || null,
              agentReasoning: denial.reasoning,
              iterationCount: pr.iterationCount,
            },
            deduplicationKey: `critical-denial-${featureId}-${denial.threadId}`,
            timestamp: new Date().toISOString(),
          });
        }

        logger.info(
          `Emitted ${criticalDenials.length} emergency escalation signals for critical feedback denials`
        );
      }

      if (warningDenials.length > 0) {
        logger.info(
          `Warning feedback denied by agent for PR #${pr.prNumber}: ${warningDenials.length} warning threads`
        );

        for (const denial of warningDenials) {
          const thread = threads.find((t) => t.threadId === denial.threadId);

          this.events.emit('escalation:signal-received', {
            source: EscalationSource.pr_feedback,
            severity: EscalationSeverity.high,
            type: 'warning_feedback_denied',
            context: {
              featureId,
              featureTitle,
              projectPath,
              prNumber: pr.prNumber,
              prUrl: pr.prUrl,
              threadId: denial.threadId,
              threadMessage: thread?.message || 'Unknown',
              threadLocation: thread?.location || null,
              agentReasoning: denial.reasoning,
              iterationCount: pr.iterationCount,
            },
            deduplicationKey: `warning-denial-${featureId}-${denial.threadId}`,
            timestamp: new Date().toISOString(),
          });
        }

        logger.info(
          `Emitted ${warningDenials.length} high severity escalation signals for warning feedback denials`
        );
      }
    } catch (error) {
      logger.error(`Failed to handle denial escalations for feature ${featureId}:`, error);
    }
  }

  /**
   * Process thread feedback after agent completes fixes and pushes.
   * Auto-resolves accepted threads and posts denial reasoning on denied threads.
   */
  async processThreadFeedback(
    projectPath: string,
    featureId: string,
    prNumber: number
  ): Promise<void> {
    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature || !feature.threadFeedback) {
        logger.debug(`No thread feedback to process for feature ${featureId}`);
        return;
      }

      const threadFeedback = feature.threadFeedback as ReviewThreadFeedback[];
      if (threadFeedback.length === 0) {
        logger.debug(`No thread feedback to process for feature ${featureId}`);
        return;
      }

      logger.info(
        `Processing thread feedback for PR #${prNumber}: ${threadFeedback.length} threads`
      );

      const prId = await codeRabbitResolverService.getPullRequestId(projectPath, prNumber);
      if (!prId) {
        logger.warn(`Could not get PR GraphQL ID for PR #${prNumber}, skipping thread resolution`);
        return;
      }

      const acceptedThreads = threadFeedback.filter((t) => t.status === 'accepted');
      const deniedThreads = threadFeedback.filter((t) => t.status === 'denied');

      let resolvedCount = 0;
      let deniedCount = 0;
      const now = new Date().toISOString();

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

      await this.featureLoader.update(projectPath, featureId, { threadFeedback });

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
}
