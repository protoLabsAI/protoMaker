/**
 * @automaker/flows - Project Wrap-Up
 *
 * LangGraph flow for the post-completion knowledge loop.
 * Drives the full workflow from project completion through
 * retrospective, learning extraction, and improvement routing.
 */

// Main graph
export { createWrapUpFlow, type WrapUpFlowConfig } from './graph.js';

// Types and state annotations
export {
  WrapUpStateAnnotation,
  type WrapUpState,
  type WrapUpStateType,
  type WrapUpStage,
  type WrapUpInput,
  type MilestoneSummary,
  type ProjectMetrics,
  type MemoryFileEntry,
  type StructuredLearning,
  type ImprovementItem,
  type WrapUpHITLResponse,
} from './types.js';

// Node factory exports (for server-side dependency injection)
export { createGatherMetricsNode, type MetricsCollector } from './nodes/gather-metrics.js';
export { createGenerateRetroNode, type RetroGenerator } from './nodes/generate-retro.js';
export {
  createExtractLearningsNode,
  type MemoryCollector,
  type LearningSynthesizer,
} from './nodes/extract-learnings.js';
export { createUpdateMemoryNode, type MemoryPersister } from './nodes/update-memory.js';
export {
  createGenerateContentBriefNode,
  type ContentBriefGenerator,
} from './nodes/generate-content-brief.js';
export {
  createProposeImprovementsNode,
  type ImprovementExtractor,
} from './nodes/propose-improvements.js';
export { createRouteImprovementsNode, type ImprovementRouter } from './nodes/route-improvements.js';
export { improvementsHitlRouter, hitlImprovementsProcessor } from './nodes/hitl-improvements.js';
