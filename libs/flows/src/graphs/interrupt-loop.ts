/**
 * Interrupt Loop Utility
 *
 * Provides a reusable pattern for creating interrupt-based command loops in LangGraph flows.
 * Handles multiple HITL checkpoints with automatic state recovery, iteration counting,
 * and configurable max iteration overflow routing.
 *
 * @example
 * ```typescript
 * const loop = createInterruptLoop({
 *   maxIterations: 3,
 *   interruptNodeName: 'human_review',
 *   overflowNode: 'auto_approve',
 *   onResume: (response, iterationCount) => ({
 *     feedback: response.feedback,
 *     lastIterationCount: iterationCount,
 *   }),
 * });
 *
 * // Add loop.stateFields to your Annotation.Root
 * const MyState = Annotation.Root({
 *   ...loop.stateFields,
 *   myField: Annotation<string>(),
 * });
 *
 * // Build your graph
 * const graph = new StateGraph(MyState);
 * graph.addNode('human_review', loop.interruptNode);
 * graph.addConditionalEdges('human_review', loop.resumeRouter, {
 *   next_node: 'next_node',
 *   auto_approve: 'auto_approve',
 * });
 * graph.compile({ interruptBefore: ['human_review'], checkpointer: new MemorySaver() });
 * ```
 */

import { Command, Annotation } from '@langchain/langgraph';

/**
 * Configuration for an interrupt loop
 */
export interface InterruptLoopConfig {
  /**
   * Maximum iterations before auto-completing.
   * When this limit is reached, the loop will route to overflowNode if specified,
   * otherwise it will continue to the default next node.
   */
  maxIterations: number;

  /**
   * Node name that triggers the interrupt.
   * This should match the node name in your graph and the interruptBefore config.
   */
  interruptNodeName: string;

  /**
   * Optional: node to route to when max iterations exceeded.
   * If not specified, the loop will continue to the default next node.
   */
  overflowNode?: string;

  /**
   * Optional: custom state update after interrupt resolution.
   * Called with the user's response and current iteration count.
   * Return an object with state fields to update.
   */
  onResume?: (response: unknown, iterationCount: number) => Record<string, unknown>;
}

/**
 * State fields required for the interrupt loop to function.
 * Add these to your graph's Annotation.Root.
 */
export interface InterruptLoopState {
  /**
   * Current iteration count for this interrupt node.
   * Persisted across checkpoints.
   */
  iterationCount: number;

  /**
   * User response from the interrupt.
   * Set by the user via updateState() when resuming the graph.
   */
  userResponse?: unknown;
}

/**
 * Return type for createInterruptLoop
 */
export interface InterruptLoop {
  /**
   * The interrupt node function to add to your graph.
   * This node increments the iteration count and applies custom state updates.
   */
  interruptNode: (state: InterruptLoopState) => Command;

  /**
   * Router function for post-interrupt routing.
   * Returns the next node name based on iteration count and user response.
   */
  resumeRouter: (state: InterruptLoopState) => string;

  /**
   * State fields to add to your Annotation.Root.
   * Includes iterationCount and userResponse.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stateFields: Record<string, any>;
}

/**
 * Creates a reusable interrupt loop with iteration counting and overflow routing.
 *
 * The interrupt loop pattern handles:
 * - Multiple sequential interrupts
 * - State recovery after each interrupt via MemorySaver checkpointing
 * - Configurable max iterations with overflow routing
 * - Custom state updates on resume via onResume callback
 *
 * @param config - Configuration for the interrupt loop
 * @returns Object with interruptNode, resumeRouter, and stateFields
 */
export function createInterruptLoop(config: InterruptLoopConfig): InterruptLoop {
  const { maxIterations, interruptNodeName, overflowNode, onResume } = config;

  /**
   * The interrupt node that pauses execution and updates state.
   * This node is called when the graph reaches the interrupt point.
   */
  function interruptNode(state: InterruptLoopState): Command {
    const currentCount = state.iterationCount || 0;
    const newCount = currentCount + 1;

    // Build state updates
    const updates: Record<string, unknown> = {
      iterationCount: newCount,
    };

    // Apply custom state updates if provided
    if (onResume && state.userResponse !== undefined) {
      const customUpdates = onResume(state.userResponse, newCount);
      Object.assign(updates, customUpdates);
    }

    // Determine routing
    if (newCount >= maxIterations && overflowNode) {
      // Max iterations exceeded, route to overflow node
      return new Command({
        goto: [overflowNode],
        update: updates,
      });
    }

    // Continue to next node (routing determined by resumeRouter)
    return new Command({
      update: updates,
    });
  }

  /**
   * Router function for conditional edges after interrupt resolution.
   * Returns the next node name based on iteration count.
   */
  function resumeRouter(state: InterruptLoopState): string {
    const currentCount = state.iterationCount || 0;

    // Check if max iterations exceeded
    if (currentCount >= maxIterations && overflowNode) {
      return overflowNode;
    }

    // Default: return a placeholder that should be mapped in conditional edges
    // The caller should map this to their actual next node
    return 'next_node';
  }

  /**
   * State fields for the interrupt loop.
   * These should be spread into your Annotation.Root.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stateFields: Record<string, any> = {
    iterationCount: Annotation<number>({
      reducer: (_left, right) => right ?? 0,
      default: () => 0,
    }),
    userResponse: Annotation<unknown | undefined>({
      reducer: (_left, right) => right,
    }),
  };

  return {
    interruptNode,
    resumeRouter,
    stateFields,
  };
}
