/**
 * Lead Engineer — Escalation State Processor
 *
 * ESCALATE state: moves feature to blocked, classifies failure,
 * emits escalation signal, and saves trajectory data.
 */

import { createLogger } from '@protolabs-ai/utils';
import type { EventType } from '@protolabs-ai/types';
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

    logger.warn(`[ESCALATE] Feature ${ctx.feature.id} moved to blocked`, {
      reason: ctx.escalationReason,
      retryCount: ctx.retryCount,
      remediationAttempts: ctx.remediationAttempts,
      failureCategory: failureAnalysis.category,
    });

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
