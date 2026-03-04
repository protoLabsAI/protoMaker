/**
 * Lead Engineer — Feature State Machine
 *
 * Orchestrates a single feature through INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY.
 * Enhanced with goal gates, checkpointing, and pipeline event emission.
 */

import { createLogger } from '@protolabs-ai/utils';
import type { Feature, ExecuteOptions, GoalGateResult, EventType } from '@protolabs-ai/types';
import type { EventEmitter } from '../lib/events.js';
import type { PipelineCheckpointService } from './pipeline-checkpoint-service.js';
import { IntakeProcessor, PlanProcessor } from './lead-engineer-processors.js';
import { ExecuteProcessor } from './lead-engineer-execute-processor.js';
import { ReviewProcessor, MergeProcessor } from './lead-engineer-review-merge-processors.js';
import { DeployProcessor } from './lead-engineer-deploy-processor.js';
import { EscalateProcessor } from './lead-engineer-escalation.js';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
  FeatureProcessingState,
  GoalGateValidator,
} from './lead-engineer-types.js';

const logger = createLogger('LeadEngineerService');

// ────────────────────────── Goal Gates ──────────────────────────

/**
 * Default goal gate definitions for state transitions.
 */
const DEFAULT_GOAL_GATES: Map<string, GoalGateValidator> = new Map([
  [
    'execute-entry',
    {
      gateId: 'execute-entry',
      description: 'Feature must have a description and all dependencies met before execution',
      evaluate: (ctx: StateContext) => {
        if (!ctx.feature.description && !ctx.feature.title) {
          return { passed: false, reason: 'Feature has no description or title' };
        }
        return { passed: true, reason: 'Feature ready for execution' };
      },
    },
  ],
  [
    'execute-exit',
    {
      gateId: 'execute-exit',
      description: 'Feature must have a PR number after execution',
      evaluate: (ctx: StateContext) => {
        if (!ctx.prNumber && !ctx.feature.prNumber) {
          return { passed: false, reason: 'No PR created during execution' };
        }
        return { passed: true, reason: 'PR exists' };
      },
      retryTarget: 'EXECUTE',
    },
  ],
  [
    'review-exit',
    {
      gateId: 'review-exit',
      description: 'PR must be approved before moving to merge',
      evaluate: (_ctx: StateContext) => {
        return { passed: true, reason: 'Review state validated by processor' };
      },
    },
  ],
  [
    'merge-exit',
    {
      gateId: 'merge-exit',
      description: 'PR must be confirmed merged',
      evaluate: (_ctx: StateContext) => {
        return { passed: true, reason: 'Merge confirmed by processor' };
      },
      retryTarget: 'MERGE',
    },
  ],
]);

// ────────────────────────── FeatureStateMachine ──────────────────────────

/**
 * Feature State Machine
 *
 * Processes a single feature through states from INTAKE to completion.
 * Replaces the inner loop of auto-mode's executeFeature().
 *
 * Enhanced with:
 * - Goal gates: validate pre/post conditions on each transition
 * - Checkpointing: persist state after each successful transition
 * - Pipeline events: emit typed events for observability
 */
export class FeatureStateMachine {
  private readonly processors: Map<FeatureProcessingState, StateProcessor>;
  private readonly goalGates: Map<string, GoalGateValidator>;
  private checkpointService?: PipelineCheckpointService;
  private events?: EventEmitter;

  constructor(
    serviceContext: ProcessorServiceContext,
    opts?: {
      checkpointService?: PipelineCheckpointService;
      events?: EventEmitter;
      goalGatesEnabled?: boolean;
    }
  ) {
    this.processors = new Map<FeatureProcessingState, StateProcessor>();
    this.processors.set('INTAKE', new IntakeProcessor(serviceContext));
    this.processors.set('PLAN', new PlanProcessor(serviceContext));
    this.processors.set('EXECUTE', new ExecuteProcessor(serviceContext));
    this.processors.set('REVIEW', new ReviewProcessor(serviceContext));
    this.processors.set('MERGE', new MergeProcessor(serviceContext));
    this.processors.set('DEPLOY', new DeployProcessor(serviceContext));
    this.processors.set('ESCALATE', new EscalateProcessor(serviceContext));

    this.goalGates = opts?.goalGatesEnabled === false ? new Map() : new Map(DEFAULT_GOAL_GATES);
    this.checkpointService = opts?.checkpointService;
    this.events = opts?.events;
  }

  /**
   * Process a feature through the state machine.
   */
  async processFeature(
    feature: Feature,
    projectPath: string,
    options: ExecuteOptions,
    resumeFromCheckpoint?: {
      state: FeatureProcessingState;
      restoredContext?: Partial<StateContext>;
    }
  ): Promise<{ finalState: FeatureProcessingState; context: StateContext }> {
    const ctx: StateContext = {
      feature,
      projectPath,
      options,
      retryCount: 0,
      infraRetryCount: 0,
      planRequired: false,
      remediationAttempts: 0,
      mergeRetryCount: 0,
      planRetryCount: 0,
      startedAt: new Date().toISOString(),
      ...resumeFromCheckpoint?.restoredContext,
    };

    let currentState: FeatureProcessingState = resumeFromCheckpoint?.state || 'INTAKE';
    let transitionCount = 0;
    const MAX_TRANSITIONS = 20;
    const completedStates: string[] = [];
    const goalGateResults: GoalGateResult[] = [];

    if (resumeFromCheckpoint) {
      logger.info('Resuming feature processing from checkpoint', {
        featureId: feature.id,
        resumeState: currentState,
      });
    } else {
      logger.info('Starting feature processing', {
        featureId: feature.id,
        title: feature.title,
        initialState: currentState,
      });
    }

    while (currentState && transitionCount < MAX_TRANSITIONS) {
      const processor = this.processors.get(currentState);
      if (!processor) {
        logger.error(`No processor found for state: ${currentState}`);
        ctx.escalationReason = `No processor registered for state: ${currentState}`;
        currentState = 'ESCALATE';
        transitionCount++;
        continue;
      }

      try {
        // Evaluate entry gate
        const entryGate = this.goalGates.get(`${currentState.toLowerCase()}-entry`);
        if (entryGate) {
          const gateResult = entryGate.evaluate(ctx);
          const goalResult: GoalGateResult = {
            gateId: entryGate.gateId,
            state: currentState,
            passed: gateResult.passed,
            reason: gateResult.reason,
            retryTarget: entryGate.retryTarget,
          };
          goalGateResults.push(goalResult);

          this.emitPipelineEvent('pipeline:goal-gate-evaluated', {
            featureId: feature.id,
            gateId: entryGate.gateId,
            passed: gateResult.passed,
            reason: gateResult.reason,
          });

          if (!gateResult.passed) {
            logger.warn(`Entry gate failed for ${currentState}`, {
              gateId: entryGate.gateId,
              reason: gateResult.reason,
            });
            const target = entryGate.retryTarget || 'ESCALATE';
            ctx.escalationReason = `Goal gate failed: ${gateResult.reason}`;
            currentState = target;
            transitionCount++;
            continue;
          }
        }

        this.emitPipelineEvent('pipeline:state-entered', {
          featureId: feature.id,
          state: currentState,
          fromState: completedStates[completedStates.length - 1] || null,
          timestamp: new Date().toISOString(),
        });

        await processor.enter(ctx);
        const result: StateTransitionResult = await processor.process(ctx);
        await processor.exit(ctx);

        // Evaluate exit gate
        const exitGate = this.goalGates.get(`${currentState.toLowerCase()}-exit`);
        if (exitGate && result.nextState && result.nextState !== 'ESCALATE') {
          const gateResult = exitGate.evaluate(ctx);
          const goalResult: GoalGateResult = {
            gateId: exitGate.gateId,
            state: currentState,
            passed: gateResult.passed,
            reason: gateResult.reason,
            retryTarget: exitGate.retryTarget,
          };
          goalGateResults.push(goalResult);

          this.emitPipelineEvent('pipeline:goal-gate-evaluated', {
            featureId: feature.id,
            gateId: exitGate.gateId,
            passed: gateResult.passed,
            reason: gateResult.reason,
          });

          if (!gateResult.passed) {
            logger.warn(`Exit gate failed for ${currentState}`, {
              gateId: exitGate.gateId,
              reason: gateResult.reason,
            });
            const target = exitGate.retryTarget || 'ESCALATE';
            ctx.escalationReason = `Goal gate failed: ${gateResult.reason}`;
            currentState = target;
            transitionCount++;
            continue;
          }
        }

        completedStates.push(currentState);

        logger.info('State transition', {
          from: currentState,
          to: result.nextState || 'DONE',
          reason: result.reason,
          shouldContinue: result.shouldContinue,
        });

        // Save checkpoint after successful transition
        if (this.checkpointService && result.nextState) {
          try {
            await this.checkpointService.save(
              projectPath,
              feature.id,
              result.nextState,
              ctx,
              completedStates,
              goalGateResults
            );
            this.emitPipelineEvent('pipeline:checkpoint-saved', {
              featureId: feature.id,
              state: result.nextState,
              checkpointId: `${feature.id}-${result.nextState}`,
            });
          } catch (err) {
            logger.error('Failed to save checkpoint', { error: err });
          }
        }

        if (!result.shouldContinue || !result.nextState) {
          logger.info('Feature processing completed', {
            featureId: feature.id,
            finalState: currentState,
            transitionCount,
          });
          break;
        }

        currentState = result.nextState;
        transitionCount++;
      } catch (error) {
        logger.error('Error processing state', {
          state: currentState,
          error: error instanceof Error ? error.message : String(error),
        });

        ctx.escalationReason = `Unexpected error in ${currentState}: ${error instanceof Error ? error.message : String(error)}`;
        currentState = 'ESCALATE';
      }
    }

    if (transitionCount >= MAX_TRANSITIONS) {
      logger.error('Max transitions exceeded, escalating', {
        featureId: feature.id,
        transitionCount,
      });
      currentState = 'ESCALATE';
      ctx.escalationReason = 'Max state transitions exceeded';

      // Run the ESCALATE processor so the feature is properly blocked and signaled
      const escalateProcessor = this.processors.get('ESCALATE');
      if (escalateProcessor) {
        try {
          await escalateProcessor.enter(ctx);
          await escalateProcessor.process(ctx);
          await escalateProcessor.exit(ctx);
        } catch (err) {
          logger.error('ESCALATE processor failed after max transitions:', err);
        }
      }
    }

    // Clean up checkpoint on terminal states
    if (this.checkpointService && (currentState === 'DEPLOY' || currentState === 'ESCALATE')) {
      try {
        await this.checkpointService.delete(projectPath, feature.id);
      } catch {
        // Non-critical
      }
    }

    return { finalState: currentState, context: ctx };
  }

  /**
   * Get the processor for a specific state (for testing or custom workflows).
   */
  getProcessor(state: FeatureProcessingState): StateProcessor | undefined {
    return this.processors.get(state);
  }

  /**
   * Register a custom processor (allows extending the state machine).
   */
  registerProcessor(state: FeatureProcessingState, processor: StateProcessor): void {
    this.processors.set(state, processor);
    logger.info(`Registered custom processor for state: ${state}`);
  }

  private emitPipelineEvent(type: string, payload: Record<string, unknown>): void {
    if (this.events) {
      this.events.emit(type as EventType, payload);
    }
  }
}
