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

// Milestone summary flow
export {
  createMilestoneSummaryFlow,
  executeMilestoneSummary,
  type MilestoneSummaryFlowConfig,
} from './milestone-summary-flow.js';

// Types and state annotations
export {
  ProjectStatusStateAnnotation,
  ProjectStatusStateSchema,
  type ProjectStatusState,
  type ProjectStatusStateType,
  MilestoneSummaryStateAnnotation,
  MilestoneSummaryStateSchema,
  type MilestoneSummaryState,
  type MilestoneSummaryStateType,
  type BoardMetrics,
  type PRMetrics,
  type DependencyMetrics,
  type AgentMetrics,
  type HealthStatus,
  type ProgressAnalysis,
  type RiskFactor,
  type MilestoneSummary,
  type StatusReport,
  type Achievement,
  type LessonLearned,
  type NextMilestonePreview,
  type MilestoneReport,
} from './types.js';

// Status report node exports for testing and composition
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

// Milestone summary node exports for testing and composition
export {
  collectAchievements,
  createCollectAchievementsNode,
  type AchievementCollector,
} from './nodes/collect-achievements.js';
export { analyzeLessons } from './nodes/analyze-lessons.js';
export { draftSummary } from './nodes/draft-summary.js';
export {
  antagonisticReview,
  routeAfterReview as routeAfterMilestoneReview,
} from './nodes/antagonistic-review.js';
export { formatMilestoneSummary } from './nodes/format-milestone-summary.js';
