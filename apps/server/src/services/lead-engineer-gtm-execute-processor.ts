/**
 * Lead Engineer — GTM Execute State Processor
 *
 * Handles content features (featureType === 'content') at the EXECUTE stage.
 * Delegates to ContentFlowService instead of the standard code agent.
 *
 * Flow:
 *   1. Calls contentFlowService.startFlow() with the feature's topic
 *   2. Polls contentFlowService.getStatus() every 30 seconds
 *   3. On completion → transitions to REVIEW
 *   4. On failure or timeout → transitions to ESCALATE
 */

import { createLogger } from '@protolabs-ai/utils';
import type { StateContext, StateProcessor, StateTransitionResult } from './lead-engineer-types.js';
import { contentFlowService } from './content-flow-service.js';

const logger = createLogger('LeadEngineerService');

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class GtmExecuteProcessor implements StateProcessor {
  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[GTM_EXECUTE] Starting content flow for feature: ${ctx.feature.id}`, {
      topic: ctx.feature.contentConfig?.topic,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    const topic = ctx.feature.contentConfig?.topic;
    if (!topic) {
      ctx.escalationReason = 'Content feature missing contentConfig.topic';
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    let runId: string;
    try {
      const result = await contentFlowService.startFlow(ctx.projectPath, topic, {
        format: 'guide',
        tone: 'conversational',
        audience: 'intermediate',
      });
      runId = result.runId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.escalationReason = `Content flow failed to start: ${message}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    logger.info(`[GTM_EXECUTE] Content flow started: ${runId}`, { featureId: ctx.feature.id });

    const startTime = Date.now();
    while (Date.now() - startTime < TIMEOUT_MS) {
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const status = contentFlowService.getStatus(runId);
      if (!status) {
        ctx.escalationReason = `Content flow ${runId} status lost`;
        return {
          nextState: 'ESCALATE',
          shouldContinue: true,
          reason: ctx.escalationReason,
        };
      }

      if (status.status === 'completed') {
        logger.info(`[GTM_EXECUTE] Content flow ${runId} completed`, {
          featureId: ctx.feature.id,
          progress: status.progress,
        });
        return {
          nextState: 'REVIEW',
          shouldContinue: true,
          reason: 'Content flow completed successfully',
        };
      }

      if (status.status === 'failed') {
        ctx.escalationReason = `Content flow failed: ${status.error ?? 'unknown error'}`;
        logger.warn(`[GTM_EXECUTE] Content flow ${runId} failed`, {
          featureId: ctx.feature.id,
          error: status.error,
        });
        return {
          nextState: 'ESCALATE',
          shouldContinue: true,
          reason: ctx.escalationReason,
        };
      }

      logger.debug(`[GTM_EXECUTE] Polling content flow ${runId}`, {
        status: status.status,
        progress: status.progress,
      });
    }

    ctx.escalationReason = 'Content flow timed out after 30 minutes';
    return {
      nextState: 'ESCALATE',
      shouldContinue: true,
      reason: ctx.escalationReason,
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[GTM_EXECUTE] Content execution phase completed');
  }
}
