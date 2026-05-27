/**
 * @protolabsai/flows
 *
 * LangGraph state graph utilities and flow orchestration for AutoMaker.
 * Provides state management, reducers, routing, and example flows.
 */

// Core state utilities
export * from './graphs/state-utils.js';
export * from './graphs/reducers.js'; // Includes idDedupAppendReducer and createLruReducer
export * from './graphs/routing.js';
export * from './graphs/builder.js';
export * from './graphs/state-transforms.js';

// Coordinator subgraphs
export { createResearcherGraph, ResearcherState } from './graphs/subgraphs/researcher.js';
export { createAnalyzerGraph, AnalyzerState } from './graphs/subgraphs/analyzer.js';
export {
  wrapSubgraph,
  createMessage,
  getLastAssistantMessage,
} from './graphs/utils/subgraph-wrapper.js';

// Antagonistic review flow (graph-based)
export {
  AntagonisticReviewStateAnnotation,
  AntagonisticReviewStateSchema,
  type AntagonisticReviewState,
  type AntagonisticReviewStateType,
  type AgentQueryOptions,
  createAntagonisticReviewGraph,
  antagonisticReviewGraph,
} from './antagonistic-review/index.js';

// Maintenance flow (board health check → LLM analysis → Discord report)
export {
  createMaintenanceFlow,
  type MaintenanceFlowDeps,
  type MaintenanceFeatureLoader,
  type MaintenanceDiscordBot,
} from './maintenance/maintenance-flow.js';
