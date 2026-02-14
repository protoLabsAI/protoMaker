/**
 * @automaker/flows
 *
 * LangGraph state graph utilities and flow orchestration for AutoMaker.
 * Provides state management, reducers, routing, and example flows.
 */

// Core state utilities
export * from './graphs/state-utils.js';
export * from './graphs/reducers.js';
export * from './graphs/routing.js';
export * from './graphs/builder.js';

// Research flow
export { createResearchFlow } from './graphs/research-flow.js';
export type { ResearchState } from './graphs/research-flow.js';

// Human-in-the-loop review flow
export { createReviewFlow } from './graphs/review-flow.js';
export type { ReviewState } from './graphs/review-flow.js';
export { draft } from './graphs/nodes/draft.js';
export { revise } from './graphs/nodes/revise.js';

// Coordinator + subgraph pattern
export { createCoordinatorGraph, CoordinatorState } from './graphs/coordinator-flow.js';
export { createResearcherGraph, ResearcherState } from './graphs/subgraphs/researcher.js';
export { createAnalyzerGraph, AnalyzerState } from './graphs/subgraphs/analyzer.js';
export {
  wrapSubgraph,
  createMessage,
  getLastAssistantMessage,
} from './graphs/utils/subgraph-wrapper.js';

// Research subgraph with parallel workers
export {
  createResearchSubgraph,
  ResearchSubgraphState,
  type ResearchSubgraph,
  type ContentConfig,
  type ResearchFinding,
  type ResearchSummary,
} from './content/subgraphs/research-subgraph.js';

// Content pipeline prompt templates
export { compilePrompt, loadPromptTemplate, getAvailablePrompts } from './content/prompt-loader.js';
export type {
  PromptName,
  PromptVariables,
  CompilePromptOptions,
  CompiledPrompt,
} from './content/prompt-loader.js';

// Content output types
export {
  BlogPostSchema,
  TechDocSchema,
  TrainingExampleSchema,
  HFDatasetRowSchema,
  ContentTypeSchema,
} from './content/types.js';
export type {
  BlogPost,
  BlogPostFrontmatter,
  TechDoc,
  TrainingExample,
  HFDatasetRow,
  ContentType,
  SEOMetadata,
  ContentSection as ContentSectionType,
  CodeExample,
  APIReference,
  ChatMessage,
  TrainingMetadata,
} from './content/types.js';

// Content creation pipeline state
export { ContentStateAnnotation } from './content/state.js';
export type {
  ContentState,
  ContentStateType,
  ContentSection,
  ReviewFeedback,
  HITLDecision,
  ErrorEntry,
  GenerationMetadata,
} from './content/state.js';

// Outline planner
export {
  outlinePlannerNode,
  outlineApprovalNode,
  routeAfterOutlinePlanning,
  routeAfterApproval,
} from './content/nodes/outline-planner.js';

// Content generation nodes
export {
  generationDispatchNode,
  generationCollectorNode,
  extractResearchForSection,
  validateOutline,
  createFailureReport,
} from './content/nodes/generation-dispatch.js';
export type {
  SectionSpec,
  ResearchSubset,
  GeneratedSection,
  Outline,
  GenerationState,
} from './content/nodes/generation-dispatch.js';

// Content review system with parallel workers
export {
  createReviewSubgraph,
  ReviewState as ContentReviewState,
} from './content/subgraphs/review-subgraph.js';
export { getReviewStats, hasBlockingIssues } from './content/subgraphs/review-subgraph.js';
export {
  technicalReviewerNode,
  styleReviewerNode,
  factCheckerNode,
  type ReviewFinding,
  type ReviewSeverity,
  type ReviewWorkerState,
} from './content/nodes/review-workers.js';

// Content creation flow
export {
  createContentCreationFlow,
  ContentCreationState,
  type ContentCreationStateType,
  type ContentConfig as ContentCreationConfig,
  type Outline as ContentOutline,
  type ResearchResult,
  type ReviewFeedback as ContentReviewFeedback,
  type OutputResult,
} from './content/content-creation-flow.js';

// SectionWriter subgraph
export {
  createSectionWriterGraph,
  executeSectionWriter,
  SectionWriterState,
  type SectionWriterStateType,
  type ResearchFindings,
  type ContentStyleConfig,
} from './content/subgraphs/section-writer.js';

// XML tag extraction utilities for LLM output parsing
export {
  extractTag,
  extractRequiredTag,
  extractOptionalTag,
  extractAllTags,
  extractTaggedJSON,
  extractRequiredInt,
  extractClampedInt,
  extractOptionalInt,
  extractBoolean,
  isXML,
  extractRequiredEnum,
  extractOptionalEnum,
} from './content/xml-parser.js';
