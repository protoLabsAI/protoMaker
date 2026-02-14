/**
 * Project Status Report Flow
 *
 * LangGraph state graph for generating comprehensive project status reports.
 *
 * Flow:
 * START -> gather_metrics -> analyze_progress -> assess_risks ->
 * generate_report -> review_quality -> [format_output | generate_report (revise)] -> done
 *
 * The review_quality node acts as a quality gate with max 2 revision iterations.
 * Currently uses deterministic heuristic implementations for all nodes.
 * LLM-powered nodes will be injected via config in server integration.
 *
 * Pattern follows antagonistic-review graph: mock implementations first,
 * real LLM models injected later.
 */

import { GraphBuilder } from '../graphs/builder.js';
import { ProjectStatusStateAnnotation, type ProjectStatusState } from './types.js';
import {
  gatherMetrics,
  createGatherMetricsNode,
  type MetricsCollector,
} from './nodes/gather-metrics.js';
import { analyzeProgress } from './nodes/analyze-progress.js';
import { assessRisks } from './nodes/assess-risks.js';
import { generateReport } from './nodes/generate-report.js';
import { reviewQuality, routeAfterReview } from './nodes/review-quality.js';
import { formatOutput } from './nodes/format-output.js';

/**
 * Configuration for creating a status report flow
 */
export interface StatusReportFlowConfig {
  /** Enable state checkpointing (default: false) */
  enableCheckpointing?: boolean;

  /** Custom metrics collector (default: mock) */
  metricsCollector?: MetricsCollector;
}

/**
 * Creates a project status report graph
 *
 * @param config - Flow configuration
 * @returns Compiled LangGraph runnable
 */
export function createStatusReportFlow(config: StatusReportFlowConfig = {}) {
  const { enableCheckpointing = false, metricsCollector } = config;

  const builder = new GraphBuilder<ProjectStatusState>({
    stateAnnotation: ProjectStatusStateAnnotation,
    enableCheckpointing,
  });

  // Use injected collector or default mock
  const gatherNode = metricsCollector ? createGatherMetricsNode(metricsCollector) : gatherMetrics;

  // Add all nodes
  builder
    .addNode('gather_metrics', gatherNode)
    .addNode('analyze_progress', analyzeProgress)
    .addNode('assess_risks', assessRisks)
    .addNode('generate_report', generateReport)
    .addNode('review_quality', reviewQuality)
    .addNode('format_output', formatOutput)
    .addNode('done', async () => ({}));

  // Wire the linear flow
  builder
    .setEntryPoint('gather_metrics')
    .addEdge('gather_metrics', 'analyze_progress')
    .addEdge('analyze_progress', 'assess_risks')
    .addEdge('assess_risks', 'generate_report')
    .addEdge('generate_report', 'review_quality');

  // Quality gate: approve -> format, revise -> regenerate
  builder.addConditionalEdge('review_quality', routeAfterReview, {
    format_output: 'format_output',
    generate_report: 'generate_report',
  });

  builder.addEdge('format_output', 'done');
  builder.setFinishPoint('done');

  return builder.compile();
}

/**
 * Execute a status report flow and return the formatted report
 *
 * @param projectPath - Path to the project
 * @param options - Additional options
 * @returns Formatted markdown report
 */
export async function executeStatusReport(
  projectPath: string,
  options: {
    projectSlug?: string;
    metricsCollector?: MetricsCollector;
  } = {}
): Promise<string> {
  const flow = createStatusReportFlow({
    metricsCollector: options.metricsCollector,
  });

  const result = await flow.invoke({
    projectPath,
    projectSlug: options.projectSlug,
  });

  return result.formattedReport ?? 'Report generation failed.';
}
