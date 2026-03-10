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
 *
 * LLM nodes use executeWithFallback for model fallback (smart → fast).
 * When no models are provided, falls back to deterministic mock behavior.
 */

import { Annotation } from '@langchain/langgraph';
import { type PairReviewResult, type ReviewVerdict, type SPARCPrd } from '@protolabsai/types';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import { createLogger } from '@protolabsai/utils';
import { GraphBuilder } from '../../graphs/builder.js';
import { wrapSubgraph } from '../../graphs/utils/subgraph-wrapper.js';
import { executeWithFallback } from './classify-topic.js';

const logger = createLogger('pair-review');

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
  /** Smart LLM model (injected from parent graph) */
  smartModel?: BaseChatModel;
  /** Fast LLM model for fallback (injected from parent graph) */
  fastModel?: BaseChatModel;
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
  smartModel: Annotation<BaseChatModel | undefined>,
  fastModel: Annotation<BaseChatModel | undefined>,
  reviewerAOutput: Annotation<string | undefined>,
  reviewerBOutput: Annotation<string | undefined>,
  result: Annotation<PairReviewResult | undefined>,
});

/**
 * Serialize SPARCPrd to markdown for LLM prompts
 */
function serializePrd(prd: SPARCPrd): string {
  return `## Situation
${prd.situation}

## Problem
${prd.problem}

## Approach
${prd.approach}

## Results
${prd.results}

## Constraints
${prd.constraints || 'None specified'}`;
}

/**
 * Zod schema for reviewer output
 */
const ReviewerOutputSchema = z.object({
  assessment: z.string(),
  concerns: z.array(z.string()),
  recommendations: z.array(z.string()),
  verdict: z.enum(['approve', 'approve-with-concerns', 'revise', 'reject']),
});

/**
 * Zod schema for consolidation output
 */
const ConsolidationOutputSchema = z.object({
  consensus: z.boolean(),
  agreedVerdict: z.enum(['approve', 'concern', 'block']),
  consolidatedComments: z.string(),
});

/**
 * Parse JSON from LLM output, handling markdown code blocks
 */
function extractJson(output: string): unknown {
  let jsonStr = output.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }
  return JSON.parse(jsonStr);
}

/**
 * Node: Reviewer A conducts initial review
 */
async function reviewerANode(state: PairReviewState): Promise<Partial<PairReviewState>> {
  const { prd, pairConfig, smartModel, fastModel } = state;
  const { reviewerA } = pairConfig;
  const nodeName = `PairReview:${pairConfig.section}:${reviewerA.name}`;

  logger.info(`[${nodeName}] Starting review`);

  // Fallback: deterministic output when no models available
  if (!smartModel && !fastModel) {
    const reviewerAOutput = `[${reviewerA.name} (${reviewerA.role})] Review for ${pairConfig.section}: Evaluated from ${reviewerA.role} perspective. Focus: ${reviewerA.prompt}. Preliminary verdict: APPROVE.`;
    return { reviewerAOutput };
  }

  const prdString = serializePrd(prd);

  const result = await executeWithFallback(
    { primary: smartModel, fallback: fastModel },
    async (model) => {
      const response = await model.invoke([
        {
          role: 'user',
          content: `You are ${reviewerA.name}, a ${reviewerA.role}. You are reviewing a PRD (Product Requirements Document) for your area of expertise.

Your focus area: ${reviewerA.prompt}

PRD to review:
${prdString}

Provide your review in the following JSON format:
{
  "assessment": "Your overall assessment of the ${pairConfig.section} aspects",
  "concerns": ["List of specific concerns from your ${reviewerA.role} perspective"],
  "recommendations": ["Actionable recommendations to address concerns"],
  "verdict": "approve" | "approve-with-concerns" | "revise" | "reject"
}

Verdict guidelines:
- approve: No significant concerns in your domain
- approve-with-concerns: Can proceed but monitor listed issues
- revise: Changes needed before approval
- reject: Fundamental issues that block progress

Be thorough, specific, and direct. Return ONLY the JSON object.`,
        },
      ]);
      return response.content.toString();
    },
    nodeName
  );

  try {
    const parsed = ReviewerOutputSchema.parse(extractJson(result));
    const reviewerAOutput = `[${reviewerA.name} (${reviewerA.role})] Review for ${pairConfig.section}:

Assessment: ${parsed.assessment}

Concerns:
${parsed.concerns.map((c) => `- ${c}`).join('\n')}

Recommendations:
${parsed.recommendations.map((r) => `- ${r}`).join('\n')}

Verdict: ${parsed.verdict.toUpperCase()}`;

    logger.info(`[${nodeName}] Review complete: ${parsed.verdict}`);
    return { reviewerAOutput };
  } catch (error) {
    // If parsing fails, use raw output
    logger.warn(`[${nodeName}] Failed to parse structured output, using raw`);
    return { reviewerAOutput: result };
  }
}

/**
 * Node: Reviewer B reviews with A's context
 */
async function reviewerBNode(state: PairReviewState): Promise<Partial<PairReviewState>> {
  const { prd, pairConfig, reviewerAOutput, smartModel, fastModel } = state;
  const { reviewerB, reviewerA } = pairConfig;
  const nodeName = `PairReview:${pairConfig.section}:${reviewerB.name}`;

  if (!reviewerAOutput) {
    throw new Error(
      `[PairReview:${pairConfig.section}] Reviewer B cannot proceed without Reviewer A's output`
    );
  }

  logger.info(`[${nodeName}] Reviewing with ${reviewerA.name}'s context`);

  // Fallback: deterministic output when no models available
  if (!smartModel && !fastModel) {
    const reviewerBOutput = `[${reviewerB.name} (${reviewerB.role})] Review for ${pairConfig.section}: Building on ${reviewerA.name}'s assessment. Focus: ${reviewerB.prompt}. Verdict: APPROVE (concurring).`;
    return { reviewerBOutput };
  }

  const prdString = serializePrd(prd);

  const result = await executeWithFallback(
    { primary: smartModel, fallback: fastModel },
    async (model) => {
      const response = await model.invoke([
        {
          role: 'user',
          content: `You are ${reviewerB.name}, a ${reviewerB.role}. You are reviewing a PRD (Product Requirements Document) with the benefit of a previous review by ${reviewerA.name} (${reviewerA.role}).

Your focus area: ${reviewerB.prompt}

PRD to review:
${prdString}

Previous reviewer's assessment (${reviewerA.name}, ${reviewerA.role}):
${reviewerAOutput}

Your job is to:
1. Validate or challenge ${reviewerA.name}'s findings from your ${reviewerB.role} perspective
2. Identify any gaps ${reviewerA.name} may have missed
3. Add your domain-specific analysis

Provide your review in the following JSON format:
{
  "assessment": "Your assessment, referencing and building on ${reviewerA.name}'s review",
  "concerns": ["Your additional or differing concerns as ${reviewerB.role}"],
  "recommendations": ["Your recommendations, noting agreements/disagreements with ${reviewerA.name}"],
  "verdict": "approve" | "approve-with-concerns" | "revise" | "reject"
}

Be thorough and don't just agree with ${reviewerA.name} — provide genuine independent analysis. Return ONLY the JSON object.`,
        },
      ]);
      return response.content.toString();
    },
    nodeName
  );

  try {
    const parsed = ReviewerOutputSchema.parse(extractJson(result));
    const reviewerBOutput = `[${reviewerB.name} (${reviewerB.role})] Review for ${pairConfig.section}:

Building on ${reviewerA.name}'s assessment:

Assessment: ${parsed.assessment}

Concerns:
${parsed.concerns.map((c) => `- ${c}`).join('\n')}

Recommendations:
${parsed.recommendations.map((r) => `- ${r}`).join('\n')}

Verdict: ${parsed.verdict.toUpperCase()}`;

    logger.info(`[${nodeName}] Review complete: ${parsed.verdict}`);
    return { reviewerBOutput };
  } catch (error) {
    logger.warn(`[${nodeName}] Failed to parse structured output, using raw`);
    return { reviewerBOutput: result };
  }
}

/**
 * Map raw verdict strings to ReviewVerdict type
 */
function mapVerdict(verdictA: string, verdictB: string): ReviewVerdict {
  const severity: Record<string, number> = {
    reject: 3,
    revise: 2,
    'approve-with-concerns': 1,
    approve: 0,
  };
  // Conservative: take the more severe verdict
  const sevA = severity[verdictA] ?? 1;
  const sevB = severity[verdictB] ?? 1;
  const worst = sevA >= sevB ? verdictA : verdictB;

  switch (worst) {
    case 'reject':
      return 'block';
    case 'revise':
      return 'concern';
    case 'approve-with-concerns':
      return 'concern';
    default:
      return 'approve';
  }
}

/**
 * Node: Mini-consolidation produces PairReviewResult
 */
async function miniConsolidationNode(state: PairReviewState): Promise<Partial<PairReviewState>> {
  const { pairConfig, reviewerAOutput, reviewerBOutput, smartModel, fastModel } = state;
  const nodeName = `PairReview:${pairConfig.section}:consolidation`;

  if (!reviewerAOutput || !reviewerBOutput) {
    throw new Error(
      `[PairReview:${pairConfig.section}] Cannot consolidate without both reviewer outputs`
    );
  }

  logger.info(
    `[${nodeName}] Consolidating ${pairConfig.reviewerA.name} and ${pairConfig.reviewerB.name} reviews`
  );

  // Fallback: deterministic consolidation when no models available
  if (!smartModel && !fastModel) {
    const result: PairReviewResult = {
      section: pairConfig.section,
      consensus: true,
      agreedVerdict: 'approve',
      consolidatedComments: `${pairConfig.reviewerA.name} (${pairConfig.reviewerA.role}) and ${pairConfig.reviewerB.name} (${pairConfig.reviewerB.role}) reviewed the ${pairConfig.section} aspects. No blocking concerns identified (deterministic fallback).`,
      completedAt: new Date().toISOString(),
    };
    return { result };
  }

  const consolidationResult = await executeWithFallback(
    { primary: smartModel, fallback: fastModel },
    async (model) => {
      const response = await model.invoke([
        {
          role: 'user',
          content: `You are a neutral consolidator. Two reviewers have assessed the ${pairConfig.section} aspects of a PRD. Synthesize their findings into a final verdict.

Reviewer A (${pairConfig.reviewerA.name}, ${pairConfig.reviewerA.role}):
${reviewerAOutput}

Reviewer B (${pairConfig.reviewerB.name}, ${pairConfig.reviewerB.role}):
${reviewerBOutput}

Provide your consolidation in the following JSON format:
{
  "consensus": true/false,
  "agreedVerdict": "approve" | "concern" | "block",
  "consolidatedComments": "Synthesis of both reviews with key findings, areas of agreement/disagreement, and final recommendation"
}

Verdict mapping:
- "approve": Both reviewers approve or minor concerns only
- "concern": Significant concerns raised that need attention but don't block
- "block": Critical issues identified that must be resolved

Return ONLY the JSON object.`,
        },
      ]);
      return response.content.toString();
    },
    nodeName
  );

  try {
    const parsed = ConsolidationOutputSchema.parse(extractJson(consolidationResult));
    const result: PairReviewResult = {
      section: pairConfig.section,
      consensus: parsed.consensus,
      agreedVerdict: parsed.agreedVerdict,
      consolidatedComments: parsed.consolidatedComments,
      completedAt: new Date().toISOString(),
    };

    logger.info(
      `[${nodeName}] Consolidation complete: consensus=${result.consensus}, verdict=${result.agreedVerdict}`
    );
    return { result };
  } catch (error) {
    // Fallback: extract verdicts heuristically from raw outputs
    logger.warn(`[${nodeName}] Failed to parse consolidation, using heuristic fallback`);

    const verdictA =
      reviewerAOutput.match(/Verdict:\s*(\w[\w-]*)/i)?.[1]?.toLowerCase() || 'approve';
    const verdictB =
      reviewerBOutput.match(/Verdict:\s*(\w[\w-]*)/i)?.[1]?.toLowerCase() || 'approve';
    const agreedVerdict = mapVerdict(verdictA, verdictB);

    const result: PairReviewResult = {
      section: pairConfig.section,
      consensus: verdictA === verdictB,
      agreedVerdict,
      consolidatedComments: `${pairConfig.reviewerA.name}: ${reviewerAOutput.slice(0, 200)}...\n\n${pairConfig.reviewerB.name}: ${reviewerBOutput.slice(0, 200)}...`,
      completedAt: new Date().toISOString(),
    };
    return { result };
  }
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
 * The parent graph only needs to provide prd, pairConfig, and models,
 * and will receive back a PairReviewResult.
 *
 * @param pairConfig - Configuration for the reviewer pair
 * @returns Wrapped node function for parent graph
 */
export function createPairReviewNode<
  TParentState extends {
    prd: SPARCPrd;
    pairReviews?: PairReviewResult[];
    smartModel?: any;
    fastModel?: any;
  },
>(pairConfig: PairConfig) {
  const compiledSubgraph = createPairReviewSubgraph();

  return wrapSubgraph<TParentState, PairReviewState, PairReviewState>(
    compiledSubgraph,
    // Input mapper: extract prd and models from parent state, inject pairConfig
    (parentState) => ({
      prd: parentState.prd,
      pairConfig,
      smartModel: parentState.smartModel,
      fastModel: parentState.fastModel,
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
  pairConfig: PairConfig,
  smartModel?: BaseChatModel,
  fastModel?: BaseChatModel
): Promise<PairReviewResult> {
  const subgraph = createPairReviewSubgraph();

  const initialState: PairReviewState = {
    prd,
    pairConfig,
    smartModel,
    fastModel,
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
