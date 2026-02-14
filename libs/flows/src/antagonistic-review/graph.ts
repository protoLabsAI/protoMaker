/**
 * Antagonistic Review Graph
 *
 * Dual-perspective PRD review workflow using LangGraph.
 *
 * Flow:
 * START -> classify_topic -> ava_review -> jon_review -> check_consensus ->
 * [consolidate | resolution -> consolidate] -> check_hitl -> [interrupt | done]
 *
 * Conditional routing:
 * - check_consensus: if both approve, skip resolution
 * - check_hitl: if hitlRequired=true, trigger interrupt for HITL
 *
 * Currently uses deterministic mock implementations for all LLM nodes.
 * Future features will wire in real LLM-powered classifyTopicNode, avaReviewNode,
 * jonReviewNode, and consolidateNode with model injection.
 */

import { MemorySaver } from '@langchain/langgraph';
import { GraphBuilder } from '../graphs/builder.js';
import { AntagonisticReviewStateAnnotation, type AntagonisticReviewState } from './state.js';
import type { ReviewerPerspective } from '@automaker/types';

// Import decision/routing nodes (compatible with AntagonisticReviewState)
import { checkConsensus } from './nodes/check-consensus.js';
import { resolution } from './nodes/resolution.js';
import { checkHitl } from './nodes/check-hitl.js';

/**
 * Mock classify topic node - heuristic classification based on PRD length
 *
 * Will be replaced by classifyTopicNode with LLM model injection in a future feature.
 */
async function classifyTopicMock(
  state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  const situationLength = state.prd.situation?.length ?? 0;
  let topicComplexity: 'simple' | 'moderate' | 'complex';

  if (situationLength < 30) {
    topicComplexity = 'simple';
  } else if (situationLength < 100) {
    topicComplexity = 'moderate';
  } else {
    topicComplexity = 'complex';
  }

  return { topicComplexity };
}

/**
 * Mock Ava review node - operational/pragmatic perspective
 *
 * Returns a deterministic approve verdict.
 * Will be replaced by avaReviewNode with LLM model injection in a future feature.
 */
async function avaReviewMock(
  state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  const avaReview: ReviewerPerspective = {
    reviewer: 'ava',
    overallVerdict: 'approve',
    sections: [
      {
        section: 'feasibility',
        verdict: 'approve',
        comments: 'Implementation is feasible with current resources.',
      },
    ],
    generalComments: 'Approved from operational perspective.',
    completedAt: new Date().toISOString(),
  };
  return { avaReview };
}

/**
 * Mock Jon review node - market/business perspective
 *
 * Returns a deterministic concern verdict to create antagonistic tension.
 * Will be replaced by jonReviewNode with LLM model injection in a future feature.
 */
async function jonReviewMock(
  state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  const jonReview: ReviewerPerspective = {
    reviewer: 'jon',
    overallVerdict: 'concern',
    sections: [
      {
        section: 'market-positioning',
        verdict: 'concern',
        comments: 'Market positioning needs strengthening.',
        issues: ['Competitive analysis incomplete'],
      },
    ],
    generalComments: 'Concerns about market fit and business case.',
    completedAt: new Date().toISOString(),
  };
  return { jonReview };
}

/**
 * Mock consolidate node - merges reviews and sets HITL requirement
 *
 * Will be replaced by consolidateNode with LLM model injection in a future feature.
 */
async function consolidateMock(
  state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  const hitlRequired = !state.consensus || state.finalVerdict !== 'approve';

  return {
    consolidatedPrd: {
      ...state.prd,
      generatedAt: new Date().toISOString(),
    },
    hitlRequired,
  };
}

/**
 * Routing function for check_consensus node.
 * If both reviewers agree and approve, skip resolution and go straight to consolidate.
 */
function routeConsensus(state: AntagonisticReviewState): string {
  if (state.consensus && state.finalVerdict === 'approve') {
    return 'consolidate';
  }
  return 'resolution';
}

/**
 * Routing function for check_hitl node.
 * If hitlRequired=true, route to human_review (will be interrupted); otherwise done.
 */
function routeHitl(state: AntagonisticReviewState): string {
  if (state.hitlRequired) {
    return 'human_review';
  }
  return 'done';
}

/**
 * Human review node - paused via interruptBefore for HITL approval.
 * When resumed, any provided hitlFeedback will already be in the state.
 */
async function humanReview(
  _state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  return {};
}

/**
 * Creates the antagonistic review graph
 *
 * @param enableCheckpointing - Whether to enable state persistence (default: true)
 * @returns Compiled LangGraph runnable
 */
export function createAntagonisticReviewGraph(enableCheckpointing = true) {
  const checkpointer = enableCheckpointing ? new MemorySaver() : undefined;

  const builder = new GraphBuilder<AntagonisticReviewState>({
    stateAnnotation: AntagonisticReviewStateAnnotation,
    enableCheckpointing,
    checkpointer,
  });

  // Add all nodes
  builder
    .addNode('classify_topic', classifyTopicMock)
    .addNode('ava_review', avaReviewMock)
    .addNode('jon_review', jonReviewMock)
    .addNode('check_consensus', checkConsensus)
    .addNode('resolution', resolution)
    .addNode('consolidate', consolidateMock)
    .addNode('check_hitl', checkHitl)
    .addNode('human_review', humanReview)
    .addNode('done', async () => ({}));

  // Wire the linear flow: classify -> ava -> jon -> check_consensus
  builder
    .setEntryPoint('classify_topic')
    .addEdge('classify_topic', 'ava_review')
    .addEdge('ava_review', 'jon_review')
    .addEdge('jon_review', 'check_consensus');

  // Conditional: consensus + approve -> skip resolution, otherwise -> resolve
  builder.addConditionalEdge('check_consensus', routeConsensus, {
    consolidate: 'consolidate',
    resolution: 'resolution',
  });

  // Resolution flows to consolidate
  builder.addEdge('resolution', 'consolidate');

  // Consolidate flows to check_hitl
  builder.addEdge('consolidate', 'check_hitl');

  // Conditional: hitlRequired -> human_review (interrupt), otherwise -> done
  builder.addConditionalEdge('check_hitl', routeHitl, {
    human_review: 'human_review',
    done: 'done',
  });

  // Human review flows to done (after human intervention)
  builder.addEdge('human_review', 'done');

  // Done is the finish point
  builder.setFinishPoint('done');

  // Compile with interruptBefore to pause at human_review for HITL
  const graph = builder.getGraph();
  return graph.compile({
    checkpointer,
    interruptBefore: ['human_review'] as any,
  });
}

/**
 * Default graph instance with checkpointing enabled
 */
export const antagonisticReviewGraph = createAntagonisticReviewGraph();
