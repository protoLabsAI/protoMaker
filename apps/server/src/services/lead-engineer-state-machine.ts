/**
 * Lead Engineer — Feature State Machine
 *
 * Orchestrates a single feature through INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY.
 * Enhanced with goal gates, checkpointing, and pipeline event emission.
 */

import { createLogger } from '@protolabsai/utils';
import type { Feature, GoalGateResult, EventType, WorkflowDefinition } from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';
import type { PipelineCheckpointService } from './pipeline-checkpoint-service.js';
import { IntakeProcessor, PlanProcessor } from './lead-engineer-processors.js';
import { ExecuteProcessor } from './lead-engineer-execute-processor.js';
import { ReviewProcessor, MergeProcessor } from './lead-engineer-review-merge-processors.js';
import { DeployProcessor } from './lead-engineer-deploy-processor.js';
import { EscalateProcessor } from './lead-engineer-escalation.js';
import type { ProcessorRegistry } from './processor-registry.js';
import { ConfigurableProcessor } from './lead-engineer-configurable-processor.js';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
  FeatureProcessingState,
  GoalGateValidator,
} from './lead-engineer-types.js';

const logger = createLogger('LeadEngineerService');

// ────────────────────────── PersistQueue ──────────────────────────

/**
 * Background persist queue — decouples checkpoint I/O from the state machine.
 * Saves are enqueued and executed sequentially with exponential-backoff retry.
 */
class PersistQueue {
  private readonly queue: Array<() => Promise<void>> = [];
  private running = false;
  private readonly maxRetries: number;

  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
  }

  enqueue(task: () => Promise<void>): void {
    this.queue.push(task);
    if (!this.running) void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await this.runWithRetry(task);
    }
    this.running = false;
  }

  private async runWithRetry(task: () => Promise<void>): Promise<void> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await task();
        return;
      } catch (err) {
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
        } else {
          // Final attempt failed — log and move on (non-fatal)
          const queueLogger = createLogger('PersistQueue');
          queueLogger.error('Checkpoint persist failed after max retries:', err);
        }
      }
    }
  }
}

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
/**
 * Standard phase order used to resolve next-state skipping.
 * When a processor returns a disabled phase, the machine skips forward
 * to the next enabled phase in this order. DONE and ESCALATE are always valid targets.
 */
const PHASE_ORDER: FeatureProcessingState[] = [
  'INTAKE',
  'PLAN',
  'EXECUTE',
  'REVIEW',
  'MERGE',
  'DEPLOY',
  'DONE',
];

export class FeatureStateMachine {
  private readonly processors: Map<FeatureProcessingState, StateProcessor>;
  private readonly goalGates: Map<string, GoalGateValidator>;
  private readonly enabledPhases: Set<FeatureProcessingState>;
  private checkpointService?: PipelineCheckpointService;
  private events?: EventEmitter;
  private readonly persistQueue: PersistQueue;

  constructor(
    serviceContext: ProcessorServiceContext,
    opts?: {
      checkpointService?: PipelineCheckpointService;
      events?: EventEmitter;
      goalGatesEnabled?: boolean;
      workflow?: WorkflowDefinition;
      processorRegistry?: ProcessorRegistry;
    }
  ) {
    this.processors = new Map<FeatureProcessingState, StateProcessor>();
    this.enabledPhases = new Set<FeatureProcessingState>();

    if (opts?.workflow && opts?.processorRegistry) {
      // Workflow-driven: register only enabled phases with the correct processors
      for (const phase of opts.workflow.phases) {
        const state = phase.state as FeatureProcessingState;
        if (!phase.enabled) continue;

        this.enabledPhases.add(state);

        if (phase.processorConfig) {
          // Inline configurable processor — behavior defined in YAML, no TypeScript needed
          this.processors.set(state, new ConfigurableProcessor(phase.processorConfig));
          logger.info(`Configured inline processor for state: ${state}`);
        } else if (phase.processor) {
          // Named processor from registry
          const processor = opts.processorRegistry.get(phase.processor, serviceContext);
          if (processor) {
            this.processors.set(state, processor);
          } else {
            logger.warn(
              `Processor "${phase.processor}" not found in registry for state ${state}, using default`
            );
            this.setDefaultProcessor(state, serviceContext);
          }
        } else {
          // Default processor for this state
          this.setDefaultProcessor(state, serviceContext);
        }
      }

      // ESCALATE is always available regardless of workflow
      this.processors.set('ESCALATE', new EscalateProcessor(serviceContext));
      this.enabledPhases.add('ESCALATE');

      logger.info('State machine configured from workflow', {
        workflow: opts.workflow.name,
        enabledPhases: Array.from(this.enabledPhases),
      });
    } else {
      // Default: all phases enabled with built-in processors
      this.processors.set('INTAKE', new IntakeProcessor(serviceContext));
      this.processors.set('PLAN', new PlanProcessor(serviceContext));
      this.processors.set('EXECUTE', new ExecuteProcessor(serviceContext));
      this.processors.set('REVIEW', new ReviewProcessor(serviceContext));
      this.processors.set('MERGE', new MergeProcessor(serviceContext));
      this.processors.set('DEPLOY', new DeployProcessor(serviceContext));
      this.processors.set('ESCALATE', new EscalateProcessor(serviceContext));

      for (const state of PHASE_ORDER) {
        this.enabledPhases.add(state);
      }
      this.enabledPhases.add('ESCALATE');
    }

    this.goalGates = opts?.goalGatesEnabled === false ? new Map() : new Map(DEFAULT_GOAL_GATES);
    this.checkpointService = opts?.checkpointService;
    this.events = opts?.events;
    this.persistQueue = new PersistQueue();
  }

  /**
   * Set the default (built-in) processor for a state.
   */
  private setDefaultProcessor(state: FeatureProcessingState, ctx: ProcessorServiceContext): void {
    switch (state) {
      case 'INTAKE':
        this.processors.set(state, new IntakeProcessor(ctx));
        break;
      case 'PLAN':
        this.processors.set(state, new PlanProcessor(ctx));
        break;
      case 'EXECUTE':
        this.processors.set(state, new ExecuteProcessor(ctx));
        break;
      case 'REVIEW':
        this.processors.set(state, new ReviewProcessor(ctx));
        break;
      case 'MERGE':
        this.processors.set(state, new MergeProcessor(ctx));
        break;
      case 'DEPLOY':
        this.processors.set(state, new DeployProcessor(ctx));
        break;
      case 'ESCALATE':
        this.processors.set(state, new EscalateProcessor(ctx));
        break;
    }
  }

  /**
   * Resolve next state, skipping disabled phases.
   * If a processor returns a disabled phase, skip forward to the next enabled one.
   * DONE and ESCALATE are never skipped.
   */
  private resolveNextState(
    requestedState: FeatureProcessingState | null
  ): FeatureProcessingState | null {
    if (!requestedState) return null;
    if (requestedState === 'DONE' || requestedState === 'ESCALATE') return requestedState;
    if (this.enabledPhases.has(requestedState)) return requestedState;

    // Skip forward in standard order
    const idx = PHASE_ORDER.indexOf(requestedState);
    if (idx === -1) return requestedState; // Unknown state, don't modify

    for (let i = idx + 1; i < PHASE_ORDER.length; i++) {
      if (this.enabledPhases.has(PHASE_ORDER[i])) {
        logger.info(`Skipping disabled phase ${requestedState} → ${PHASE_ORDER[i]}`);
        return PHASE_ORDER[i];
      }
    }

    // If all remaining phases are disabled, go to DONE
    logger.info(`All phases after ${requestedState} disabled, transitioning to DONE`);
    return 'DONE';
  }

  /**
   * Process a feature through the state machine.
   */
  async processFeature(
    feature: Feature,
    projectPath: string,
    resumeFromCheckpoint?: {
      state: FeatureProcessingState;
      restoredContext?: Partial<StateContext>;
    }
  ): Promise<{ finalState: FeatureProcessingState; context: StateContext }> {
    const ctx: StateContext = {
      feature,
      projectPath,
      retryCount: 0,
      infraRetryCount: 0,
      planRequired: false,
      remediationAttempts: 0,
      mergeRetryCount: 0,
      planRetryCount: 0,
      startedAt: new Date().toISOString(),
      ...resumeFromCheckpoint?.restoredContext,
    };

    // Resolve initial state: if the default/requested start phase is disabled, skip forward
    let currentState: FeatureProcessingState =
      this.resolveNextState(resumeFromCheckpoint?.state || 'INTAKE') || 'INTAKE';
    let transitionCount = 0;
    const MAX_TRANSITIONS = 20;
    // Self-transitions (e.g. REVIEW → REVIEW polling) don't burn the main transition
    // budget — they have their own timeouts. But cap them to prevent infinite loops
    // if a processor's timeout fails to fire.
    let sameStateCount = 0;
    const MAX_SAME_STATE_TRANSITIONS = 100;
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

    while (
      currentState &&
      transitionCount < MAX_TRANSITIONS &&
      sameStateCount < MAX_SAME_STATE_TRANSITIONS
    ) {
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

        // Pre-transition checkpoint: persist currentState before processing begins.
        // Ensures crash during processing is recoverable — resume starts at current state.
        if (this.checkpointService) {
          const cs = this.checkpointService;
          this.persistQueue.enqueue(() =>
            cs.save(projectPath, feature.id, currentState, ctx, completedStates, goalGateResults)
          );
        }

        await processor.enter(ctx);
        const rawResult: StateTransitionResult = await processor.process(ctx);
        await processor.exit(ctx);

        // Resolve next state through workflow phase skipping.
        // If the processor returns a disabled phase, skip to the next enabled one.
        const result: StateTransitionResult = {
          ...rawResult,
          nextState: rawResult.nextState ? this.resolveNextState(rawResult.nextState) : null,
        };

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

        // Post-transition checkpoint: update to nextState after successful transition.
        if (this.checkpointService && result.nextState) {
          const cs = this.checkpointService;
          const nextStateSnapshot = result.nextState;
          this.persistQueue.enqueue(() =>
            cs.save(
              projectPath,
              feature.id,
              nextStateSnapshot,
              ctx,
              completedStates,
              goalGateResults
            )
          );
          this.emitPipelineEvent('pipeline:checkpoint-saved', {
            featureId: feature.id,
            state: result.nextState,
            checkpointId: `${feature.id}-${result.nextState}`,
          });
        }

        // Suspend REVIEW/MERGE rather than busy-polling.
        // A self-loop in a suspendable state means the processor is waiting for
        // external progress (PR approval, CI). Checkpoint and exit cleanly so an
        // external scheduler can re-trigger instead of blocking this event loop.
        const SUSPENDABLE_STATES = new Set<FeatureProcessingState>(['REVIEW', 'MERGE']);
        if (
          result.shouldContinue &&
          result.nextState === currentState &&
          SUSPENDABLE_STATES.has(currentState)
        ) {
          logger.info('Suspending feature for external resume', {
            featureId: feature.id,
            state: currentState,
            reason: result.reason,
          });
          this.emitPipelineEvent('pipeline:feature-suspended', {
            featureId: feature.id,
            state: currentState,
            reason: result.reason ?? 'polling state — external resume required',
          });
          // Return without deleting the checkpoint — caller uses it to reschedule
          return { finalState: currentState, context: ctx };
        }

        // DONE is a terminal state — no processor needed, just stop.
        // This can be reached via resolveNextState() skipping all remaining phases.
        if (result.nextState === 'DONE') {
          currentState = 'DONE';
          logger.info('Feature processing completed (all phases done)', {
            featureId: feature.id,
            finalState: currentState,
            transitionCount,
          });
          break;
        }

        if (!result.shouldContinue || !result.nextState) {
          // Capture the terminal state signaled by the processor (e.g. DONE from DEPLOY)
          if (result.nextState) {
            currentState = result.nextState;
          }
          logger.info('Feature processing completed', {
            featureId: feature.id,
            finalState: currentState,
            transitionCount,
          });
          break;
        }

        // Self-transitions (e.g. REVIEW → REVIEW) are poll loops with their own
        // timeouts. Don't burn the main transition budget on them.
        if (result.nextState === currentState) {
          sameStateCount++;
        } else {
          sameStateCount = 0;
          transitionCount++;
        }
        currentState = result.nextState;
      } catch (error) {
        logger.error('Error processing state', {
          state: currentState,
          error: error instanceof Error ? error.message : String(error),
        });

        ctx.escalationReason = `Unexpected error in ${currentState}: ${error instanceof Error ? error.message : String(error)}`;
        currentState = 'ESCALATE';
      }
    }

    if (transitionCount >= MAX_TRANSITIONS || sameStateCount >= MAX_SAME_STATE_TRANSITIONS) {
      const reason =
        sameStateCount >= MAX_SAME_STATE_TRANSITIONS
          ? `Max same-state transitions exceeded in ${currentState} (${sameStateCount} loops)`
          : 'Max state transitions exceeded';
      logger.error(reason, {
        featureId: feature.id,
        transitionCount,
        sameStateCount,
        lastState: currentState,
      });
      currentState = 'ESCALATE';
      ctx.escalationReason = reason;

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
    if (
      this.checkpointService &&
      (currentState === 'DONE' || currentState === 'DEPLOY' || currentState === 'ESCALATE')
    ) {
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
