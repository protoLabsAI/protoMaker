/**
 * Antagonistic Review Graph
 *
 * Dual-perspective PRD review workflow using LangGraph.
 *
 * Flow:
 * START → classify_topic → ava_review → jon_review → check_consensus →
 * [consolidate | resolution → consolidate] → check_hitl → [interrupt | done]
 *
 * Conditional routing:
 * - check_consensus: if both approve, skip resolution
 * - check_hitl: if hitlRequired=true, trigger interrupt
 */

import { MemorySaver, END } from '@langchain/langgraph';
import { GraphBuilder } from '../graphs/builder.js';
import { AntagonisticReviewStateAnnotation, type AntagonisticReviewState } from './state.js';

// Import nodes
import { classifyTopic } from './nodes/classify-topic.js';
import { avaReview } from './nodes/ava-review.js';
import { jonReview } from './nodes/jon-review.js';
import { checkConsensus } from './nodes/check-consensus.js';
import { resolution } from './nodes/resolution.js';
import { consolidate } from './nodes/consolidate.js';
import { checkHitl } from './nodes/check-hitl.js';

/**
 * Routing function for check_consensus node
 * If both reviewers approve (consensus=true and finalVerdict='approve'), skip resolution
 */
function routeConsensus(state: AntagonisticReviewState): string {
  if (state.consensus && state.finalVerdict === 'approve') {
    return 'consolidate';
  }
  return 'resolution';
}

/**
 * Routing function for check_hitl node
 * If hitlRequired=true, go to human_review node; otherwise go to done
 */
function routeHitl(state: AntagonisticReviewState): string {
  if (state.hitlRequired) {
    return 'human_review';
  }
  return 'done';
}

/**
 * Human review node
 * This node will be interrupted before execution for HITL approval
 */
async function humanReview(
  state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  // This node is paused at via interruptBefore
  // When resumed, any provided hitlFeedback will be in the state
  return {};
}

/**
 * Creates the antagonistic review graph
 *
 * @param enableCheckpointing - Whether to enable state persistence (default: true)
 * @returns Compiled LangGraph runnable
 */
export function createAntagonisticReviewGraph(enableCheckpointing = true) {
  const builder = new GraphBuilder<AntagonisticReviewState>({
    stateAnnotation: AntagonisticReviewStateAnnotation,
    enableCheckpointing,
    checkpointer: enableCheckpointing ? new MemorySaver() : undefined,
  });

  // Add all nodes
  builder
    .addNode('classify_topic', classifyTopic)
    .addNode('ava_review', avaReview)
    .addNode('jon_review', jonReview)
    .addNode('check_consensus', checkConsensus)
    .addNode('resolution', resolution)
    .addNode('consolidate', consolidate)
    .addNode('check_hitl', checkHitl)
    .addNode('human_review', humanReview)
    .addNode('done', async () => ({}));

  // Wire the linear flow
  builder
    .setEntryPoint('classify_topic')
    .addEdge('classify_topic', 'ava_review')
    .addEdge('ava_review', 'jon_review')
    .addEdge('jon_review', 'check_consensus');

  // Conditional routing after check_consensus
  builder.addConditionalEdge('check_consensus', routeConsensus, {
    consolidate: 'consolidate',
    resolution: 'resolution',
  });

  // Resolution flows to consolidate
  builder.addEdge('resolution', 'consolidate');

  // Consolidate flows to check_hitl
  builder.addEdge('consolidate', 'check_hitl');

  // Conditional routing after check_hitl
  builder.addConditionalEdge('check_hitl', routeHitl, {
    human_review: 'human_review',
    done: 'done',
  });

  // Human review flows to done (after human intervention)
  builder.addEdge('human_review', 'done');

  // Done is the finish point
  builder.setFinishPoint('done');

  // Compile with interruptBefore to pause at human_review
  const graph = builder.getGraph();
  return graph.compile({
    checkpointer: enableCheckpointing ? new MemorySaver() : undefined,
    interruptBefore: ['human_review'] as any, // Type assertion for node name
  });
}

/**
 * Export for convenience
 */
export const antagonisticReviewGraph = createAntagonisticReviewGraph();
