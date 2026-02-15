/**
 * Content Creation Pipeline State
 *
 * Defines the LangGraph StateAnnotation for the content creation pipeline.
 * Follows reducer patterns from existing flows:
 * - appendReducer for parallel collection (research, sections, reviews, errors)
 * - replace semantics for single values (outline, config, hitlDecisions)
 * - fileReducer for document operations
 */

import { Annotation } from '@langchain/langgraph';
import { appendReducer, fileReducer, type FileOperation } from '../graphs/reducers.js';

/**
 * CopilotKit State Annotation Specification
 *
 * Common state fields for LangGraph flows integrated with CopilotKit.
 * These fields support thread management, tracing, and user context.
 */
export const CopilotKitStateAnnotation = {
  /** Session/thread ID for CopilotKit runtime */
  sessionId: Annotation<string | undefined>,

  /** User ID or identifier for context */
  userId: Annotation<string | undefined>,

  /** Thread metadata for CopilotKit thread management */
  threadMetadata: Annotation<Record<string, unknown> | undefined>,

  /** Current activity description streamed to CopilotKit sidebar */
  currentActivity: Annotation<string | undefined>,

  /** Progress indicator (0-1) streamed to CopilotKit sidebar */
  progress: Annotation<number | undefined>,
};

/**
 * Research finding from parallel research nodes
 */
export interface ResearchFinding {
  source: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Content section with generation metadata
 */
export interface ContentSection {
  id: string;
  title: string;
  content: string;
  order: number;
  generatedAt: number;
  traceId?: string; // Langfuse trace ID
  metadata?: Record<string, unknown>;
}

/**
 * Review feedback from reviewers
 */
export interface ReviewFeedback {
  reviewerId: string;
  sectionId?: string; // Optional: specific section being reviewed
  feedback: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: number;
  resolved?: boolean;
}

/**
 * Content configuration
 */
export interface ContentConfig {
  targetAudience?: string;
  tone?: string;
  style?: string;
  maxSections?: number;
  includeReferences?: boolean;
  customPrompts?: Record<string, string>;
}

/**
 * HITL (Human-in-the-Loop) decision
 */
export interface HITLDecision {
  question: string;
  answer: string;
  timestamp: number;
  context?: string;
}

/**
 * Error accumulation entry
 */
export interface ErrorEntry {
  node: string;
  error: string;
  timestamp: number;
  recoverable: boolean;
}

/**
 * Generation metadata
 */
export interface GenerationMetadata {
  startedAt?: number;
  completedAt?: number;
  totalTokens?: number;
  totalCost?: number;
  langfuseTraceId?: string;
  langfuseTraceUrl?: string;
}

/**
 * Content creation pipeline state
 */
export interface ContentState {
  // CopilotKit integration fields
  sessionId?: string;
  userId?: string;
  threadMetadata?: Record<string, unknown>;
  currentActivity?: string;
  progress?: number;

  // Research results - parallel collection
  researchFindings: ResearchFinding[];

  // Outline - single value (replace)
  outline?: string;

  // Content sections - parallel collection
  sections: ContentSection[];

  // Review feedback - parallel collection
  reviews: ReviewFeedback[];

  // Error accumulation - parallel collection
  errors: ErrorEntry[];

  // Content configuration - single value (replace)
  config: ContentConfig;

  // HITL decisions - single value (replace)
  hitlDecisions?: HITLDecision[];

  // Generation metadata - single value (replace)
  metadata: GenerationMetadata;

  // Document operations (for file-based content)
  documents: FileOperation[];
}

/**
 * State annotation for LangGraph
 *
 * Uses appropriate reducers:
 * - appendReducer: For parallel Send() safety (arrays that grow)
 * - Default (replace): For single values that get updated
 * - fileReducer: For document operations
 *
 * Includes CopilotKit state fields for integration with CopilotKit runtime.
 */
export const ContentStateAnnotation = Annotation.Root({
  // CopilotKit integration fields
  ...CopilotKitStateAnnotation,

  // Parallel collection fields - use appendReducer
  researchFindings: Annotation<ResearchFinding[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  sections: Annotation<ContentSection[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  reviews: Annotation<ReviewFeedback[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  errors: Annotation<ErrorEntry[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  documents: Annotation<FileOperation[]>({
    reducer: fileReducer,
    default: () => [],
  }),

  // Single value fields - default replace semantics
  outline: Annotation<string | undefined>,

  config: Annotation<ContentConfig>,

  hitlDecisions: Annotation<HITLDecision[] | undefined>,

  metadata: Annotation<GenerationMetadata>,
});

/**
 * Type helper to extract state type from annotation
 */
export type ContentStateType = typeof ContentStateAnnotation.State;
