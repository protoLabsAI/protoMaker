/**
 * Antagonistic Review Flow
 *
 * Dual-perspective review system for milestone deliverables.
 * Exports state definitions, types, and review nodes for the antagonistic review pipeline.
 */

export {
  AntagonisticReviewStateAnnotation,
  AntagonisticReviewStateSchema,
  type AntagonisticReviewState,
  type AntagonisticReviewStateType,
  type AgentQueryOptions,
} from './state.js';

export {
  classifyTopicNode,
  executeWithFallback,
  ComplexitySchema,
  DistillationDepthSchema,
  ClassificationResultSchema,
  type ClassifyTopicState,
  type Complexity,
  type DistillationDepth,
  type ClassificationResult,
} from './nodes/classify-topic.js';

export {
  avaReviewNode,
  parseReviewXml,
  ReviewVerdictSchema,
  ReviewSectionSchema,
  ReviewerPerspectiveSchema,
  type AvaReviewState,
  type ReviewVerdict,
  type ReviewSection,
  type ReviewerPerspective,
} from './nodes/ava-review.js';

export { jonReviewNode, type JonReviewState } from './nodes/jon-review.js';

export {
  consolidateNode,
  FinalVerdictSchema,
  ConsensusAnalysisSchema,
  ConsolidatedReviewSchema,
  type ConsolidateState,
  type FinalVerdict,
  type ConsensusAnalysis,
  type ConsolidatedReview,
} from './nodes/consolidate.js';

export { checkConsensus } from './nodes/check-consensus.js';
export { resolution } from './nodes/resolution.js';
export { checkHitl } from './nodes/check-hitl.js';
export { createAntagonisticReviewGraph, antagonisticReviewGraph } from './graph.js';

export {
  createPairReviewSubgraph,
  createPairReviewNode,
  runPairReview,
  PairReviewStateAnnotation,
  type PairReviewState,
  type PairConfig,
  type ReviewerConfig,
} from './nodes/pair-review.js';

export {
  FRANK_CHRIS_PAIR,
  MATT_CINDI_PAIR,
  SAM_JAKE_PAIR,
  ALL_PAIRS,
  getPairBySection,
  getAllSections,
} from './pairs.js';
