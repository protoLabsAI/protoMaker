/**
 * Generate Report Node
 *
 * Assembles all gathered metrics and analysis into a structured StatusReport.
 * Deterministic assembly — no LLM calls.
 */

import type { ProjectStatusState, StatusReport } from '../types.js';

/**
 * Generate status report from gathered data
 */
export async function generateReport(
  state: ProjectStatusState
): Promise<Partial<ProjectStatusState>> {
  if (state.error) return {};

  const board = state.boardMetrics ?? {
    totalFeatures: 0,
    byStatus: {},
    completionPercentage: 0,
    blockedFeatures: [],
    staleFeatures: [],
    recentlyCompleted: [],
  };

  const prs = state.prMetrics ?? {
    openPRs: 0,
    mergedToday: 0,
    conflicting: 0,
    pendingReview: 0,
    prDetails: [],
  };

  const deps = state.dependencyMetrics ?? {
    totalDependencies: 0,
    satisfiedDependencies: 0,
    blockingChains: [],
    criticalPath: [],
  };

  const agents = state.agentMetrics ?? {
    runningAgents: 0,
    totalCostUsd: 0,
    avgExecutionTimeMs: 0,
    failureRate: 0,
    agentDetails: [],
  };

  const analysis = state.progressAnalysis ?? {
    health: 'at-risk' as const,
    velocity: 0,
    bottlenecks: ['No analysis available'],
    highlights: [],
  };

  // Generate recommendations based on analysis
  const recommendations: string[] = [];

  if (analysis.health === 'behind') {
    recommendations.push('Increase agent concurrency or reduce feature scope');
  }

  if (analysis.bottlenecks.length > 0) {
    recommendations.push(
      `Address ${analysis.bottlenecks.length} bottleneck(s) to unblock progress`
    );
  }

  if (prs.conflicting > 0) {
    recommendations.push(`Rebase ${prs.conflicting} conflicting PR(s) before merging new work`);
  }

  if (prs.pendingReview > 3) {
    recommendations.push('Process review backlog — consider enabling auto-merge');
  }

  const highRisks = state.risks.filter((r) => r.severity === 'high' || r.severity === 'critical');
  if (highRisks.length > 0) {
    recommendations.push(
      `Mitigate ${highRisks.length} high/critical risk(s): ${highRisks.map((r) => r.description).join('; ')}`
    );
  }

  if (agents.failureRate > 0.1) {
    recommendations.push('Review agent failure patterns and adjust model or context');
  }

  if (recommendations.length === 0) {
    recommendations.push('All systems healthy — continue current pace');
  }

  // Build summary
  const summaryParts: string[] = [
    `Project is **${analysis.health}**`,
    `${board.completionPercentage}% complete (${board.byStatus['done'] ?? 0}/${board.totalFeatures} features done)`,
  ];

  if (agents.runningAgents > 0) {
    summaryParts.push(`${agents.runningAgents} agent(s) currently running`);
  }

  if (prs.openPRs > 0) {
    summaryParts.push(`${prs.openPRs} open PR(s)`);
  }

  if (analysis.estimatedCompletion) {
    const eta = new Date(analysis.estimatedCompletion);
    summaryParts.push(`Estimated completion: ${eta.toLocaleDateString()}`);
  }

  const statusReport: StatusReport = {
    generatedAt: new Date().toISOString(),
    projectPath: state.projectPath,
    projectSlug: state.projectSlug,
    health: analysis.health,
    summary: summaryParts.join('. ') + '.',
    metrics: {
      board,
      prs,
      dependencies: deps,
      agents,
    },
    analysis,
    risks: state.risks,
    milestones: state.milestones,
    recommendations,
  };

  return { statusReport };
}
