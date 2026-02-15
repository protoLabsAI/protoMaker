/**
 * Gather Metrics Node — Collects project statistics
 *
 * Pure function: formats input data into a structured metrics object
 * and a pre-formatted text summary for LLM consumption.
 */

import type { WrapUpState, ProjectMetrics } from '../types.js';

/**
 * Interface for pluggable metrics collection.
 * Server injects real implementation that reads features from disk;
 * tests use the default which derives from the input payload.
 */
export interface MetricsCollector {
  collect(
    projectPath: string,
    projectTitle: string
  ): Promise<{
    shippedFeatures: number;
    failedFeatures: number;
    prUrls: string[];
  }>;
}

/** Default: derive from input payload */
const defaultCollector: MetricsCollector = {
  async collect(_projectPath, _projectTitle) {
    return { shippedFeatures: 0, failedFeatures: 0, prUrls: [] };
  },
};

/**
 * Builds a human-readable data summary for LLM prompts.
 */
function buildDataSummary(
  input: WrapUpState['input'],
  extra: { shipped: number; failed: number }
): string {
  const lines = [
    `Project: ${input.projectTitle}`,
    `Total Milestones: ${input.totalMilestones}`,
    `Total Features: ${input.totalFeatures}`,
    `Shipped Features: ${extra.shipped}`,
    `Failed Features: ${extra.failed}`,
    `Total Cost: $${input.totalCostUsd.toFixed(2)}`,
    `Failure Count: ${input.failureCount}`,
    '',
    'Milestone Breakdown:',
  ];

  for (const ms of input.milestoneSummaries) {
    lines.push(`  - ${ms.milestoneTitle}: ${ms.featureCount} features, $${ms.costUsd.toFixed(2)}`);
  }

  return lines.join('\n');
}

export function createGatherMetricsNode(collector?: MetricsCollector) {
  const impl = collector || defaultCollector;

  return async (state: WrapUpState): Promise<Partial<WrapUpState>> => {
    const { input } = state;

    const extra = await impl.collect(input.projectPath, input.projectTitle);

    const metrics: ProjectMetrics = {
      totalFeatures: input.totalFeatures,
      shippedFeatures: extra.shippedFeatures || input.totalFeatures,
      failedFeatures: extra.failedFeatures || input.failureCount,
      totalCostUsd: input.totalCostUsd,
      totalMilestones: input.totalMilestones,
      milestoneBreakdown: input.milestoneSummaries,
      prUrls: extra.prUrls,
      dataSummary: buildDataSummary(input, {
        shipped: extra.shippedFeatures || input.totalFeatures,
        failed: extra.failedFeatures || input.failureCount,
      }),
    };

    return {
      stage: 'gathering_metrics',
      metrics,
    };
  };
}

/** Default node using input-derived metrics */
export const gatherMetricsNode = createGatherMetricsNode();
