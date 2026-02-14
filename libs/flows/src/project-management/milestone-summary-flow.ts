/**
 * Milestone Summary Flow
 *
 * LangGraph state graph for generating milestone completion summaries.
 *
 * Flow:
 * START -> collect_achievements -> analyze_lessons -> draft_summary ->
 * antagonistic_review -> [format | draft_summary (revise)] -> done
 *
 * The antagonistic_review node acts as a quality gate with max 2 revision iterations.
 * Currently uses deterministic heuristic implementations for all nodes.
 * LLM-powered nodes will be injected via config in server integration.
 *
 * Pattern follows status-report-flow: mock implementations first,
 * real LLM models injected later.
 */

import { GraphBuilder } from '../graphs/builder.js';
import { MilestoneSummaryStateAnnotation, type MilestoneSummaryState } from './types.js';
import {
  collectAchievements,
  createCollectAchievementsNode,
  type AchievementCollector,
} from './nodes/collect-achievements.js';
import { analyzeLessons } from './nodes/analyze-lessons.js';
import { draftSummary } from './nodes/draft-summary.js';
import { antagonisticReview, routeAfterReview } from './nodes/antagonistic-review.js';
import { formatMilestoneSummary } from './nodes/format-milestone-summary.js';

/**
 * Configuration for creating a milestone summary flow
 */
export interface MilestoneSummaryFlowConfig {
  /** Enable state checkpointing (default: false) */
  enableCheckpointing?: boolean;

  /** Custom achievement collector (default: mock) */
  achievementCollector?: AchievementCollector;
}

/**
 * Creates a milestone summary graph
 *
 * @param config - Flow configuration
 * @returns Compiled LangGraph runnable
 */
export function createMilestoneSummaryFlow(config: MilestoneSummaryFlowConfig = {}) {
  const { enableCheckpointing = false, achievementCollector } = config;

  const builder = new GraphBuilder<MilestoneSummaryState>({
    stateAnnotation: MilestoneSummaryStateAnnotation,
    enableCheckpointing,
  });

  // Use injected collector or default mock
  const collectNode = achievementCollector
    ? createCollectAchievementsNode(achievementCollector)
    : collectAchievements;

  // Add all nodes
  builder
    .addNode('collect_achievements', collectNode)
    .addNode('analyze_lessons', analyzeLessons)
    .addNode('draft_summary', draftSummary)
    .addNode('antagonistic_review', antagonisticReview)
    .addNode('format', formatMilestoneSummary)
    .addNode('done', async () => ({}));

  // Wire the linear flow
  builder
    .setEntryPoint('collect_achievements')
    .addEdge('collect_achievements', 'analyze_lessons')
    .addEdge('analyze_lessons', 'draft_summary')
    .addEdge('draft_summary', 'antagonistic_review');

  // Quality gate: approve -> format, revise -> regenerate
  builder.addConditionalEdge('antagonistic_review', routeAfterReview, {
    format: 'format',
    draft_summary: 'draft_summary',
  });

  builder.addEdge('format', 'done');
  builder.setFinishPoint('done');

  return builder.compile();
}

/**
 * Execute a milestone summary flow and return the formatted report
 *
 * @param projectPath - Path to the project
 * @param milestoneName - Name of the milestone to summarize
 * @param options - Additional options
 * @returns Formatted markdown report
 */
export async function executeMilestoneSummary(
  projectPath: string,
  milestoneName: string,
  options: {
    achievementCollector?: AchievementCollector;
  } = {}
): Promise<string> {
  const flow = createMilestoneSummaryFlow({
    achievementCollector: options.achievementCollector,
  });

  const result = await flow.invoke({
    projectPath,
    milestoneName,
  });

  return result.formattedReport ?? 'Milestone summary generation failed.';
}
