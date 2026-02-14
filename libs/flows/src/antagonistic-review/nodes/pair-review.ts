/**
 * Pair Review Subgraph
 *
 * A reusable subgraph that implements the antagonistic review pattern for a pair of reviewers:
 * 1. Reviewer A reviews the content
 * 2. Reviewer B reviews with A's context
 * 3. Mini-consolidation produces a PairReviewResult
 *
 * Uses wrapSubgraph() for state isolation from the parent graph.
 * Supports configurable reviewer pairs (Frank↔Chris, Matt↔Cindi, Sam↔Jake).
 */

import { Annotation } from '@langchain/langgraph';
import { type PairReviewResult, type SPARCPrd } from '@automaker/types';
import { GraphBuilder } from '../../graphs/builder.js';
import { wrapSubgraph } from '../../graphs/utils/subgraph-wrapper.js';

/**
 * Configuration for a reviewer in the pair
 */
export interface ReviewerConfig {
  /** Reviewer name (e.g., "Frank", "Chris") */
  name: string;
  /** Reviewer role (e.g., "Security Expert", "Performance Analyst") */
  role: string;
  /** Specific prompt/focus for this reviewer */
  prompt: string;
}

/**
 * Configuration for a pair review
 */
export interface PairConfig {
  /** First reviewer configuration */
  reviewerA: ReviewerConfig;
  /** Second reviewer configuration */
  reviewerB: ReviewerConfig;
  /** Section being reviewed (e.g., "security", "performance") */
  section: string;
}

/**
 * Internal state for the pair review subgraph
 * Isolated from parent graph state
 */
export interface PairReviewState {
  /** Input: PRD to review */
  prd: SPARCPrd;
  /** Configuration for this pair */
  pairConfig: PairConfig;
  /** Reviewer A's review output */
  reviewerAOutput?: string;
  /** Reviewer B's review output (includes A's context) */
  reviewerBOutput?: string;
  /** Final consolidated result */
  result?: PairReviewResult;
}

/**
 * State annotation for the pair review subgraph
 */
export const PairReviewStateAnnotation = Annotation.Root({
  prd: Annotation<SPARCPrd>,
  pairConfig: Annotation<PairConfig>,
  reviewerAOutput: Annotation<string | undefined>,
  reviewerBOutput: Annotation<string | undefined>,
  result: Annotation<PairReviewResult | undefined>,
});

/**
 * Node: Reviewer A conducts initial review
 */
async function reviewerANode(state: PairReviewState): Promise<Partial<PairReviewState>> {
  const { prd, pairConfig } = state;
  const { reviewerA } = pairConfig;

  console.log(`[PairReview:${pairConfig.section}] ${reviewerA.name} starting review`);

  // Mock implementation - deterministic output based on reviewer and section
  const reviewerAOutput = `[${reviewerA.name} (${reviewerA.role})] Review for ${pairConfig.section}:

Focus: ${reviewerA.prompt}

Assessment:
- The ${pairConfig.section} aspects of this PRD have been evaluated.
- Key considerations from a ${reviewerA.role} perspective have been identified.
- Specific attention paid to: ${reviewerA.prompt}

Preliminary verdict: APPROVE (pending review by ${pairConfig.reviewerB.name})
Timestamp: ${new Date().toISOString()}`;

  return { reviewerAOutput };
}

/**
 * Node: Reviewer B reviews with A's context
 */
async function reviewerBNode(state: PairReviewState): Promise<Partial<PairReviewState>> {
  const { prd, pairConfig, reviewerAOutput } = state;
  const { reviewerB } = pairConfig;

  if (!reviewerAOutput) {
    throw new Error(
      `[PairReview:${pairConfig.section}] Reviewer B cannot proceed without Reviewer A's output`
    );
  }

  console.log(
    `[PairReview:${pairConfig.section}] ${reviewerB.name} reviewing with ${pairConfig.reviewerA.name}'s context`
  );

  // Mock implementation - deterministic output that references A's review
  const reviewerBOutput = `[${reviewerB.name} (${reviewerB.role})] Review for ${pairConfig.section}:

Focus: ${reviewerB.prompt}

Building on ${pairConfig.reviewerA.name}'s assessment:
- Acknowledging the points raised by ${pairConfig.reviewerA.name}
- Providing complementary perspective from a ${reviewerB.role} viewpoint
- Focus area: ${reviewerB.prompt}

Additional considerations:
- Cross-checking ${pairConfig.reviewerA.name}'s findings
- Identifying any gaps or alternative viewpoints
- Ensuring comprehensive coverage of ${pairConfig.section}

Verdict: APPROVE (concurring with ${pairConfig.reviewerA.name})
Timestamp: ${new Date().toISOString()}`;

  return { reviewerBOutput };
}

/**
 * Node: Mini-consolidation produces PairReviewResult
 */
async function miniConsolidationNode(state: PairReviewState): Promise<Partial<PairReviewState>> {
  const { pairConfig, reviewerAOutput, reviewerBOutput } = state;

  if (!reviewerAOutput || !reviewerBOutput) {
    throw new Error(
      `[PairReview:${pairConfig.section}] Cannot consolidate without both reviewer outputs`
    );
  }

  console.log(
    `[PairReview:${pairConfig.section}] Consolidating ${pairConfig.reviewerA.name} and ${pairConfig.reviewerB.name} reviews`
  );

  // Mock implementation - produces structured PairReviewResult
  const result: PairReviewResult = {
    section: pairConfig.section,
    consensus: true, // Mock: always reach consensus
    agreedVerdict: 'approve',
    consolidatedComments: `${pairConfig.reviewerA.name} (${pairConfig.reviewerA.role}) and ${pairConfig.reviewerB.name} (${pairConfig.reviewerB.role}) have reviewed the ${pairConfig.section} aspects of this PRD.

Key findings:
- ${pairConfig.reviewerA.name}'s perspective: Focus on ${pairConfig.reviewerA.prompt}
- ${pairConfig.reviewerB.name}'s perspective: Focus on ${pairConfig.reviewerB.prompt}

Consensus: Both reviewers approve the ${pairConfig.section} section.
No blocking concerns identified.`,
    completedAt: new Date().toISOString(),
  };

  console.log(
    `[PairReview:${pairConfig.section}] Consolidation complete: consensus=${result.consensus}, verdict=${result.agreedVerdict}`
  );

  return { result };
}

/**
 * Creates and compiles the pair review subgraph
 *
 * Flow: START -> reviewerA -> reviewerB -> miniConsolidation -> END
 *
 * @returns Compiled subgraph ready for invocation
 */
export function createPairReviewSubgraph() {
  const builder = new GraphBuilder<PairReviewState>({
    stateAnnotation: PairReviewStateAnnotation,
  });

  // Add nodes
  builder.addNode('reviewerA', reviewerANode);
  builder.addNode('reviewerB', reviewerBNode);
  builder.addNode('miniConsolidation', miniConsolidationNode);

  // Linear flow: A -> B -> consolidation
  builder.setEntryPoint('reviewerA');
  builder.addEdge('reviewerA', 'reviewerB');
  builder.addEdge('reviewerB', 'miniConsolidation');
  builder.setFinishPoint('miniConsolidation');

  return builder.compile();
}

/**
 * Creates a wrapped pair review node for use in parent graph
 *
 * This wrapper provides state isolation using wrapSubgraph().
 * The parent graph only needs to provide prd and pairConfig,
 * and will receive back a PairReviewResult.
 *
 * @param pairConfig - Configuration for the reviewer pair
 * @returns Wrapped node function for parent graph
 */
export function createPairReviewNode<
  TParentState extends { prd: SPARCPrd; pairReviews?: PairReviewResult[] },
>(pairConfig: PairConfig) {
  const compiledSubgraph = createPairReviewSubgraph();

  return wrapSubgraph<TParentState, PairReviewState, PairReviewState>(
    compiledSubgraph,
    // Input mapper: extract prd from parent state and inject pairConfig
    (parentState) => ({
      prd: parentState.prd,
      pairConfig,
      reviewerAOutput: undefined,
      reviewerBOutput: undefined,
      result: undefined,
    }),
    // Output mapper: extract result and return as pairReviews update
    (subgraphState) => {
      if (!subgraphState.result) {
        throw new Error(
          `[PairReview:${pairConfig.section}] Subgraph completed without producing a result`
        );
      }
      return {
        pairReviews: [subgraphState.result],
      } as Partial<TParentState>;
    }
  );
}

/**
 * Helper to run pair review directly (for testing)
 */
export async function runPairReview(
  prd: SPARCPrd,
  pairConfig: PairConfig
): Promise<PairReviewResult> {
  const subgraph = createPairReviewSubgraph();

  const initialState: PairReviewState = {
    prd,
    pairConfig,
    reviewerAOutput: undefined,
    reviewerBOutput: undefined,
    result: undefined,
  };

  const finalState = await subgraph.invoke(initialState);

  if (!finalState.result) {
    throw new Error(`[PairReview:${pairConfig.section}] Subgraph failed to produce a result`);
  }

  return finalState.result;
}
