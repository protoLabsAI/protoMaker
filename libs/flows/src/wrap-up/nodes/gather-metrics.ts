/**
 * Gather Metrics Node — Collects project statistics
 *
 * Pure function: formats input data into a structured metrics object
 * and a pre-formatted text summary for LLM consumption.
 *
 * Enhanced to track complexity prediction accuracy by comparing predicted
 * vs actual feature complexity based on execution metrics.
 */

import type { WrapUpState, ProjectMetrics, ComplexityAccuracyMetrics } from '../types.js';

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
    complexityAccuracy?: ComplexityAccuracyMetrics;
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
  extra: { shipped: number; failed: number; complexityAccuracy?: ComplexityAccuracyMetrics }
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

  // Add complexity prediction accuracy if available
  if (extra.complexityAccuracy) {
    const ca = extra.complexityAccuracy;
    lines.push('');
    lines.push('Complexity Prediction Accuracy:');
    lines.push(`  - Predictions: ${ca.totalPredictions}`);
    lines.push(`  - Accuracy: ${ca.accuracyPercent.toFixed(1)}%`);
    lines.push('  - By Complexity:');
    lines.push(
      `    • Small: ${ca.byComplexity.small.accurate}/${ca.byComplexity.small.predicted} accurate (${ca.byComplexity.small.predicted > 0 ? ((ca.byComplexity.small.accurate / ca.byComplexity.small.predicted) * 100).toFixed(1) : 0}%)`
    );
    lines.push(
      `    • Medium: ${ca.byComplexity.medium.accurate}/${ca.byComplexity.medium.predicted} accurate (${ca.byComplexity.medium.predicted > 0 ? ((ca.byComplexity.medium.accurate / ca.byComplexity.medium.predicted) * 100).toFixed(1) : 0}%)`
    );
    lines.push(
      `    • Large: ${ca.byComplexity.large.accurate}/${ca.byComplexity.large.predicted} accurate (${ca.byComplexity.large.predicted > 0 ? ((ca.byComplexity.large.accurate / ca.byComplexity.large.predicted) * 100).toFixed(1) : 0}%)`
    );
    lines.push(
      `    • Architectural: ${ca.byComplexity.architectural.accurate}/${ca.byComplexity.architectural.predicted} accurate (${ca.byComplexity.architectural.predicted > 0 ? ((ca.byComplexity.architectural.accurate / ca.byComplexity.architectural.predicted) * 100).toFixed(1) : 0}%)`
    );
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
        complexityAccuracy: extra.complexityAccuracy,
      }),
      complexityAccuracy: extra.complexityAccuracy,
    };

    return {
      stage: 'gathering_metrics',
      metrics,
    };
  };
}

/** Default node using input-derived metrics */
export const gatherMetricsNode = createGatherMetricsNode();
