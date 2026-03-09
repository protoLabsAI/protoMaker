/**
 * Lead Engineer Service
 *
 * Orchestrates the feature lifecycle state machine.
 * Maps each FeatureState to a processor function and drives state transitions.
 */

import { createLogger } from '@protolabsai/utils';
import { FeatureState } from '@protolabsai/types';
import type { LeadFeatureSnapshot } from '@protolabsai/types';
import { isValidTransition } from './lead-engineer-state-machine.js';
import { processVerifyState } from './lead-engineer-verify-processor.js';
import type { VerifyProcessorResult } from './lead-engineer-verify-processor.js';

const logger = createLogger('LeadEngineerService');

// ── Processor types ─────────────────────────────────────────────────────────

export interface ProcessorContext {
  featureId: string;
  feature: LeadFeatureSnapshot;
  projectPath: string;
}

export interface ProcessorResult {
  nextState: FeatureState;
  reason: string;
  details?: Record<string, unknown>;
}

export type StateProcessor = (ctx: ProcessorContext) => Promise<ProcessorResult>;

// ── Processor map ───────────────────────────────────────────────────────────

/**
 * Map of FeatureState → processor function.
 * Processors are responsible for executing the work of their state and
 * returning the next state to transition to.
 *
 * States without a processor are pass-through (no automated work).
 */
export const PROCESSOR_MAP: Partial<Record<FeatureState, StateProcessor>> = {
  [FeatureState.VERIFY]: async (ctx: ProcessorContext): Promise<ProcessorResult> => {
    const result: VerifyProcessorResult = await processVerifyState(
      ctx.featureId,
      ctx.feature,
      ctx.projectPath
    );
    return result;
  },
};

// ── Service ─────────────────────────────────────────────────────────────────

/**
 * Process a feature in its current state.
 *
 * Looks up the processor for the current state, runs it, validates the
 * resulting transition, and returns the outcome.
 *
 * Returns null if no processor is registered for the current state.
 */
export async function processFeatureState(
  featureId: string,
  currentState: FeatureState,
  feature: LeadFeatureSnapshot,
  projectPath: string
): Promise<ProcessorResult | null> {
  const processor = PROCESSOR_MAP[currentState];

  if (!processor) {
    logger.debug(`No processor registered for state ${currentState} — skipping`);
    return null;
  }

  logger.info(`Processing feature ${featureId} in state ${currentState}`);

  const ctx: ProcessorContext = { featureId, feature, projectPath };
  const result = await processor(ctx);

  if (!isValidTransition(currentState, result.nextState)) {
    logger.error(
      `Processor returned invalid transition: ${currentState} → ${result.nextState} for feature ${featureId}`
    );
    // Fall back to ESCALATE on invalid transition
    return {
      nextState: FeatureState.ESCALATE,
      reason: `Invalid state transition ${currentState} → ${result.nextState}: ${result.reason}`,
    };
  }

  logger.info(`Feature ${featureId}: ${currentState} → ${result.nextState} (${result.reason})`);

  return result;
}
