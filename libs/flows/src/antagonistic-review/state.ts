/**
 * Antagonistic Review Flow State
 *
 * Defines the LangGraph StateAnnotation for the antagonistic review pipeline.
 * Follows reducer patterns from existing flows:
 * - appendReducer for parallel collection (pairReviews)
 * - Default replace semantics for all scalar fields
 */

import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';
import { appendReducer } from '../graphs/reducers.js';
import {
  type SPARCPrd,
  type ReviewerPerspective,
  type PairReviewResult,
  DistillationDepth,
} from '@protolabs-ai/types';

/**
 * Token usage captured from a single LLM node invocation
 */
export interface NodeTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Zod schema for AntagonisticReviewState
 * Validates the review state structure
 */
export const AntagonisticReviewStateSchema = z.object({
  // Input PRD to review
  prd: z.custom<SPARCPrd>(),

  // Review configuration
  topicComplexity: z.enum(['simple', 'moderate', 'complex']).optional(),
  distillationDepth: z.nativeEnum(DistillationDepth).optional(),

  // Individual reviewer perspectives
  avaReview: z.custom<ReviewerPerspective>().optional(),
  jonReview: z.custom<ReviewerPerspective>().optional(),

  // Pair review results (parallel collection)
  pairReviews: z.array(z.custom<PairReviewResult>()).default([]),

  // Consensus and consolidation
  consensus: z.boolean().optional(),
  consolidatedPrd: z.custom<SPARCPrd>().optional(),
  finalVerdict: z.enum(['approve', 'concern', 'block']).optional(),

  // HITL (Human-in-the-Loop) integration
  hitlRequired: z.boolean().optional(),
  hitlFeedback: z.string().optional(),

  // Token usage per LLM node (for cost tracking)
  avaTokenUsage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).optional(),
  jonTokenUsage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).optional(),
  consolidateTokenUsage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).optional(),
});

/**
 * Antagonistic Review State
 * State graph for dual-perspective PRD review pipeline
 */
export interface AntagonisticReviewState {
  /** Input: PRD to review */
  prd: SPARCPrd;

  /** Complexity level of the topic being reviewed */
  topicComplexity?: 'simple' | 'moderate' | 'complex';

  /** How deeply to analyze the PRD */
  distillationDepth?: DistillationDepth;

  /** Ava's perspective (optimistic, supportive) */
  avaReview?: ReviewerPerspective;

  /** Jon's perspective (critical, rigorous) */
  jonReview?: ReviewerPerspective;

  /** Pair review results (parallel collection with appendReducer) */
  pairReviews: PairReviewResult[];

  /** Did the reviewers reach consensus? */
  consensus?: boolean;

  /** Consolidated PRD after review (output) */
  consolidatedPrd?: SPARCPrd;

  /** Final overall verdict */
  finalVerdict?: 'approve' | 'concern' | 'block';

  /** Does this review require human approval? */
  hitlRequired?: boolean;

  /** Feedback from human reviewer if HITL was triggered */
  hitlFeedback?: string;

  /** Token usage from ava-review LLM call (for cost tracking) */
  avaTokenUsage?: NodeTokenUsage;

  /** Token usage from jon-review LLM call (for cost tracking) */
  jonTokenUsage?: NodeTokenUsage;

  /** Token usage from consolidate LLM call (for cost tracking) */
  consolidateTokenUsage?: NodeTokenUsage;

  /** Smart LLM model for review nodes (injected by adapter) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  smartModel?: any;

  /** Fast LLM model for fallback (injected by adapter) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastModel?: any;
}

/**
 * State annotation for LangGraph
 *
 * Uses appropriate reducers:
 * - appendReducer: For pairReviews (parallel Send() safety)
 * - Default (replace): For all scalar fields
 */
export const AntagonisticReviewStateAnnotation = Annotation.Root({
  // Input PRD
  prd: Annotation<SPARCPrd>,

  // Configuration
  topicComplexity: Annotation<'simple' | 'moderate' | 'complex' | undefined>,
  distillationDepth: Annotation<DistillationDepth | undefined>,

  // Individual perspectives (replace semantics)
  avaReview: Annotation<ReviewerPerspective | undefined>,
  jonReview: Annotation<ReviewerPerspective | undefined>,

  // Pair reviews (append reducer for parallel collection)
  pairReviews: Annotation<PairReviewResult[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  // Consensus and consolidation (replace semantics)
  consensus: Annotation<boolean | undefined>,
  consolidatedPrd: Annotation<SPARCPrd | undefined>,
  finalVerdict: Annotation<'approve' | 'concern' | 'block' | undefined>,

  // HITL integration (replace semantics)
  hitlRequired: Annotation<boolean | undefined>,
  hitlFeedback: Annotation<string | undefined>,

  // Token usage per LLM node (replace semantics)
  avaTokenUsage: Annotation<NodeTokenUsage | undefined>,
  jonTokenUsage: Annotation<NodeTokenUsage | undefined>,
  consolidateTokenUsage: Annotation<NodeTokenUsage | undefined>,

  // LLM models (injected by adapter, replace semantics)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  smartModel: Annotation<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastModel: Annotation<any>,
});

/**
 * Type helper to extract state type from annotation
 */
export type AntagonisticReviewStateType = typeof AntagonisticReviewStateAnnotation.State;
