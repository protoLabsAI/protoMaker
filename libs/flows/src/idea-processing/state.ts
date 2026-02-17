/**
 * Idea Processing Flow State
 *
 * Defines the LangGraph StateAnnotation for the idea processing pipeline.
 * Routes ideas through either fast-path (trivial ideas) or full research flow.
 */

import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';
import { appendReducer } from '../graphs/reducers.js';
import type { IdeaCategory, ImpactLevel, EffortLevel } from '@automaker/types';
import type { LangfuseClient } from '@automaker/observability';

/**
 * Complexity level determines processing path
 * - trivial: Fast-path bypass, skip research
 * - simple: Standard research, minimal depth
 * - complex: Deep research with full analysis
 */
export type IdeaComplexity = 'trivial' | 'simple' | 'complex';

/**
 * Input idea for processing
 */
export interface IdeaInput {
  /** Title of the idea */
  title: string;
  /** Description/details of the idea */
  description: string;
  /** Category classification */
  category?: IdeaCategory;
  /** Optional conversation context ID */
  conversationId?: string;
}

/**
 * Research finding from deep research phase
 */
export interface ResearchFinding {
  /** Source of the finding (file, URL, etc.) */
  source: string;
  /** Summary of the finding */
  summary: string;
  /** Relevance to the idea */
  relevance: string;
}

/**
 * Research results from analysis phase
 */
export interface ResearchResult {
  /** List of findings from research */
  findings: ResearchFinding[];
  /** Consolidated summary of all research */
  summary: string;
  /** Recommended category based on research */
  recommendedCategory?: IdeaCategory;
  /** Estimated impact level */
  estimatedImpact?: ImpactLevel;
  /** Estimated effort level */
  estimatedEffort?: EffortLevel;
}

/**
 * Review output with structured decisions
 */
export const ReviewOutputSchema = z.object({
  /** Whether the idea should proceed */
  approve: z.boolean(),
  /** Category classification */
  category: z.string(),
  /** Impact assessment */
  impact: z.enum(['low', 'medium', 'high']),
  /** Effort estimate */
  effort: z.enum(['low', 'medium', 'high']),
  /** Refinement suggestions */
  suggestions: z.array(z.string()).default([]),
  /** Reasoning for the decision */
  reasoning: z.string().optional(),
});

export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

/**
 * Zod schema for IdeaProcessingState
 * Validates the processing state structure
 */
export const IdeaProcessingStateSchema = z.object({
  // Input idea
  idea: z.custom<IdeaInput>(),

  // Classification
  complexity: z.enum(['trivial', 'simple', 'complex']).optional(),

  // Research phase (optional for trivial ideas)
  researchResults: z.custom<ResearchResult>().optional(),

  // Review phase
  reviewOutput: ReviewOutputSchema.optional(),

  // Final output
  approved: z.boolean().optional(),
  category: z.string().optional(),
  impact: z.enum(['low', 'medium', 'high']).optional(),
  effort: z.enum(['low', 'medium', 'high']).optional(),

  // Processing metadata
  usedFastPath: z.boolean().optional(),
  processingNotes: z.array(z.string()).default([]),
});

/**
 * Idea Processing State
 * State graph for idea validation and enrichment pipeline
 */
export interface IdeaProcessingState {
  /** Input: Idea to process */
  idea: IdeaInput;

  /** Complexity level (determines processing path) */
  complexity?: IdeaComplexity;

  /** Research results (skipped for trivial ideas) */
  researchResults?: ResearchResult;

  /** Review output with structured decisions */
  reviewOutput?: ReviewOutput;

  /** Final approval status */
  approved?: boolean;

  /** Final category classification */
  category?: string;

  /** Final impact assessment */
  impact?: ImpactLevel;

  /** Final effort estimate */
  effort?: EffortLevel;

  /** Whether fast path was used (trivial bypass) */
  usedFastPath?: boolean;

  /** Processing notes accumulated during flow */
  processingNotes: string[];

  /** Smart LLM model for complex tasks (injected by adapter) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  smartModel?: any;

  /** Fast LLM model for simple tasks (injected by adapter) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastModel?: any;

  /** Langfuse client for observability tracing */
  langfuseClient?: LangfuseClient;

  /** Langfuse trace ID for this flow execution */
  traceId?: string;
}

/**
 * State annotation for LangGraph
 *
 * Uses appropriate reducers:
 * - appendReducer: For processingNotes (accumulate notes from all nodes)
 * - Default (replace): For all other fields
 */
export const IdeaProcessingStateAnnotation = Annotation.Root({
  // Input idea (replace semantics)
  idea: Annotation<IdeaInput>,

  // Classification (replace semantics)
  complexity: Annotation<IdeaComplexity | undefined>,

  // Research results (replace semantics)
  researchResults: Annotation<ResearchResult | undefined>,

  // Review output (replace semantics)
  reviewOutput: Annotation<ReviewOutput | undefined>,

  // Final output (replace semantics)
  approved: Annotation<boolean | undefined>,
  category: Annotation<string | undefined>,
  impact: Annotation<ImpactLevel | undefined>,
  effort: Annotation<EffortLevel | undefined>,

  // Processing metadata
  usedFastPath: Annotation<boolean | undefined>,

  // Processing notes (append reducer for accumulating notes)
  processingNotes: Annotation<string[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  // LLM models (injected by adapter, replace semantics)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  smartModel: Annotation<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastModel: Annotation<any>,

  // Observability tracing
  langfuseClient: Annotation<LangfuseClient | undefined>,
  traceId: Annotation<string | undefined>,
});

/**
 * Type helper to extract state type from annotation
 */
export type IdeaProcessingStateType = typeof IdeaProcessingStateAnnotation.State;
