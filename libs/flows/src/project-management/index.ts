/**
 * @automaker/flows - Project Management
 *
 * LangGraph flows for project management: status reporting, milestone summaries,
 * risk assessment. Follows mock-first pattern — deterministic heuristics now,
 * LLM-powered nodes injected later.
 */

// Status report flow
export {
  createStatusReportFlow,
  executeStatusReport,
  type StatusReportFlowConfig,
} from './status-report-flow.js';

// Types and state annotations
export {
  ProjectStatusStateAnnotation,
  ProjectStatusStateSchema,
  type ProjectStatusState,
  type ProjectStatusStateType,
  type BoardMetrics,
  type PRMetrics,
  type DependencyMetrics,
  type AgentMetrics,
  type HealthStatus,
  type ProgressAnalysis,
  type RiskFactor,
  type MilestoneSummary,
  type StatusReport,
} from './types.js';

// Node exports for testing and composition
export {
  gatherMetrics,
  createGatherMetricsNode,
  type MetricsCollector,
} from './nodes/gather-metrics.js';
export { analyzeProgress } from './nodes/analyze-progress.js';
export { assessRisks } from './nodes/assess-risks.js';
export { generateReport } from './nodes/generate-report.js';
export { reviewQuality, routeAfterReview } from './nodes/review-quality.js';
export { formatOutput } from './nodes/format-output.js';
