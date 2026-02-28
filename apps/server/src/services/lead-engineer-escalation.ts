/**
 * Lead Engineer — Escalation State Processor
 *
 * ESCALATE state: moves feature to blocked, classifies failure,
 * emits escalation signal, and saves trajectory data.
 */

import { createLogger } from '@protolabs-ai/utils';
import type { EventType, VerifiedTrajectory } from '@protolabs-ai/types';
import { FailureClassifierService } from './failure-classifier-service.js';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
} from './lead-engineer-types.js';

const logger = createLogger('LeadEngineerService');

/**
 * ESCALATE State: Too many failures, budget exceeded, needs different expertise.
 * Moves feature to blocked status and emits escalation signal.
 * When the failure is not auto-retryable, creates a HITL form so the user
 * can decide how to proceed.
 */
export class EscalateProcessor implements StateProcessor {
  private failureClassifier = new FailureClassifierService();

  constructor(private serviceContext: ProcessorServiceContext) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.warn(`[ESCALATE] Escalating feature: ${ctx.feature.id}`, {
      reason: ctx.escalationReason,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    // Move feature to blocked
    await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
      status: 'blocked',
    });

    // Classify the failure for structured analysis
    const failureAnalysis = this.failureClassifier.classify(
      ctx.escalationReason || 'Unknown escalation reason',
      ctx.retryCount
    );

    logger.info(`[ESCALATE] Classified failure as ${failureAnalysis.category}`, {
      featureId: ctx.feature.id,
      category: failureAnalysis.category,
      isRetryable: failureAnalysis.isRetryable,
      confidence: failureAnalysis.confidence,
    });

    // Emit escalation signal with structured failure data
    this.serviceContext.events.emit('escalation:signal-received' as EventType, {
      source: 'lead_engineer_state_machine',
      severity: 'high',
      type: 'feature_escalated',
      context: {
        featureId: ctx.feature.id,
        featureTitle: ctx.feature.title,
        reason: ctx.escalationReason,
        retryCount: ctx.retryCount,
        remediationAttempts: ctx.remediationAttempts,
        projectPath: ctx.projectPath,
        failureAnalysis: {
          category: failureAnalysis.category,
          isRetryable: failureAnalysis.isRetryable,
          suggestedDelay: failureAnalysis.suggestedDelay,
          maxRetries: failureAnalysis.maxRetries,
          recoveryStrategy: failureAnalysis.recoveryStrategy,
          explanation: failureAnalysis.explanation,
          confidence: failureAnalysis.confidence,
        },
      },
      deduplicationKey: `escalate_${ctx.feature.id}`,
      timestamp: new Date().toISOString(),
    });

    // Create a HITL form when no auto-retry will occur:
    // either the failure is not retryable, or max retries have already been hit.
    const maxRetriesHit = ctx.retryCount >= failureAnalysis.maxRetries;
    const needsHumanInput = !failureAnalysis.isRetryable || maxRetriesHit;

    if (needsHumanInput && this.serviceContext.hitlFormService) {
      try {
        const confidencePct = Math.round(failureAnalysis.confidence * 100);
        this.serviceContext.hitlFormService.create({
          title: `Agent blocked: ${ctx.feature.title}`,
          description: `Failure category: ${failureAnalysis.category}\nRoot cause: ${failureAnalysis.explanation}\nConfidence: ${confidencePct}%`,
          steps: [
            {
              title: 'How would you like to proceed?',
              schema: {
                type: 'object',
                properties: {
                  resolution: {
                    type: 'string',
                    title: 'Resolution',
                    oneOf: [
                      {
                        const: 'retry',
                        title: 'Retry',
                        description: 'Reset and re-run the agent',
                      },
                      {
                        const: 'provide_context',
                        title: 'Provide context',
                        description: 'Give the agent additional information',
                      },
                      {
                        const: 'skip',
                        title: 'Skip this feature',
                        description: 'Mark as done without implementing',
                      },
                      {
                        const: 'close',
                        title: 'Close as blocked',
                        description: 'Keep blocked for manual handling',
                      },
                    ],
                  },
                },
                required: ['resolution'],
              },
            },
            {
              title: 'Additional context',
              description:
                'Provide additional information for the agent (only required if you selected "Provide context")',
              schema: {
                type: 'object',
                properties: {
                  context: {
                    type: 'string',
                    title: 'Context',
                    description: 'Additional information to help the agent proceed',
                  },
                },
              },
            },
          ],
          callerType: 'lead_engineer',
          featureId: ctx.feature.id,
          projectPath: ctx.projectPath,
        });

        logger.info(`[ESCALATE] Created HITL form for feature ${ctx.feature.id}`, {
          category: failureAnalysis.category,
          isRetryable: failureAnalysis.isRetryable,
          maxRetriesHit,
        });
      } catch (err) {
        logger.error(`[ESCALATE] Failed to create HITL form for feature ${ctx.feature.id}:`, err);
      }
    }

    logger.warn(`[ESCALATE] Feature ${ctx.feature.id} moved to blocked`, {
      reason: ctx.escalationReason,
      retryCount: ctx.retryCount,
      remediationAttempts: ctx.remediationAttempts,
      failureCategory: failureAnalysis.category,
    });

    // Fire-and-forget: persist failure trajectory for the learning flywheel
    if (this.serviceContext.trajectoryStoreService) {
      try {
        const existingTrajectories =
          await this.serviceContext.trajectoryStoreService.loadTrajectories(
            ctx.projectPath,
            ctx.feature.id
          );
        const attemptNumber = existingTrajectories.length + 1;

        const trajectory: VerifiedTrajectory = {
          featureId: ctx.feature.id,
          domain: 'fullstack',
          complexity: (ctx.feature.complexity as VerifiedTrajectory['complexity']) || 'medium',
          model: ctx.feature.model || 'sonnet',
          planSummary: (ctx.planOutput || '').slice(0, 500),
          executionSummary: ctx.escalationReason || 'Escalated without execution summary',
          costUsd: ctx.feature.costUsd || 0,
          durationMs: ctx.startedAt ? Date.now() - new Date(ctx.startedAt).getTime() : 0,
          retryCount: ctx.retryCount,
          escalationReason: ctx.escalationReason,
          verified: false,
          timestamp: new Date().toISOString(),
          attemptNumber,
        };

        this.serviceContext.trajectoryStoreService.saveTrajectory(
          ctx.projectPath,
          ctx.feature.id,
          trajectory
        );
      } catch (err) {
        logger.warn('[ESCALATE] Failed to save trajectory (non-fatal):', err);
      }
    }

    return {
      nextState: null,
      shouldContinue: false,
      reason: 'Feature escalated',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[ESCALATE] Escalation completed');
  }
}
