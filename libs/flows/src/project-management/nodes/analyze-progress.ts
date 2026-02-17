/**
 * Analyze Progress Node
 *
 * Analyzes gathered metrics to determine project health, velocity,
 * and bottlenecks. Uses heuristic rules for deterministic analysis.
 *
 * Will be enhanced with LLM-powered analysis for nuanced interpretation
 * in a future iteration.
 */

import type { ProjectStatusState, ProgressAnalysis, HealthStatus } from '../types.js';
import { createLogger } from '@automaker/utils';

/**
 * Determine project health from metrics
 */
function assessHealth(state: ProjectStatusState): HealthStatus {
  const board = state.boardMetrics;
  if (!board) return 'at-risk';

  const completion = board.completionPercentage;
  const blockedCount = board.blockedFeatures.length;
  const staleCount = board.staleFeatures.length;

  // Critical: many blocked features or very low completion with stale work
  if (blockedCount >= 3 || (completion < 20 && staleCount >= 2)) {
    return 'behind';
  }

  // At risk: some blocked/stale features or agents failing
  if (blockedCount >= 1 || staleCount >= 2 || (state.agentMetrics?.failureRate ?? 0) > 0.2) {
    return 'at-risk';
  }

  return 'on-track';
}

/**
 * Calculate velocity: features completed per hour
 */
function calculateVelocity(state: ProjectStatusState): number {
  const board = state.boardMetrics;
  if (!board) return 0;

  const agents = state.agentMetrics;
  if (!agents || agents.avgExecutionTimeMs === 0) return 0;

  // Features done / avg time per feature * conversion to hourly
  const completed = board.byStatus['done'] ?? 0;
  const reviewed = board.byStatus['review'] ?? 0;
  const total = completed + reviewed;

  if (total === 0) return 0;

  const avgHoursPerFeature = agents.avgExecutionTimeMs / 3_600_000;
  return avgHoursPerFeature > 0 ? 1 / avgHoursPerFeature : 0;
}

/**
 * Identify bottlenecks from metrics
 */
function identifyBottlenecks(state: ProjectStatusState): string[] {
  const bottlenecks: string[] = [];

  // PR bottleneck: too many open PRs or conflicts
  if (state.prMetrics) {
    if (state.prMetrics.conflicting > 0) {
      bottlenecks.push(`${state.prMetrics.conflicting} PR(s) have merge conflicts`);
    }
    if (state.prMetrics.pendingReview > 3) {
      bottlenecks.push(`${state.prMetrics.pendingReview} PRs pending review — pipeline backing up`);
    }
  }

  // Dependency bottleneck
  if (state.dependencyMetrics) {
    const unsatisfied =
      state.dependencyMetrics.totalDependencies - state.dependencyMetrics.satisfiedDependencies;
    if (unsatisfied > 3) {
      bottlenecks.push(`${unsatisfied} unsatisfied dependencies blocking progress`);
    }
    if (state.dependencyMetrics.blockingChains.length > 0) {
      bottlenecks.push(
        `${state.dependencyMetrics.blockingChains.length} dependency chain(s) blocking features`
      );
    }
  }

  // Agent bottleneck
  if (state.agentMetrics) {
    if (state.agentMetrics.failureRate > 0.1) {
      bottlenecks.push(
        `Agent failure rate at ${(state.agentMetrics.failureRate * 100).toFixed(0)}%`
      );
    }
  }

  // Board bottleneck: too many stale or blocked
  if (state.boardMetrics) {
    if (state.boardMetrics.blockedFeatures.length > 0) {
      bottlenecks.push(
        `${state.boardMetrics.blockedFeatures.length} feature(s) blocked: ${state.boardMetrics.blockedFeatures.join(', ')}`
      );
    }
    if (state.boardMetrics.staleFeatures.length > 0) {
      bottlenecks.push(
        `${state.boardMetrics.staleFeatures.length} stale feature(s) need attention`
      );
    }
  }

  return bottlenecks;
}

/**
 * Identify positive highlights
 */
function identifyHighlights(state: ProjectStatusState): string[] {
  const highlights: string[] = [];

  if (state.boardMetrics) {
    if (state.boardMetrics.recentlyCompleted.length > 0) {
      const names = state.boardMetrics.recentlyCompleted.map((f) => f.title);
      highlights.push(`Recently completed: ${names.join(', ')}`);
    }
    if (state.boardMetrics.completionPercentage > 50) {
      highlights.push(
        `Project is ${state.boardMetrics.completionPercentage}% complete — past halfway`
      );
    }
  }

  if (state.prMetrics) {
    if (state.prMetrics.mergedToday > 0) {
      highlights.push(`${state.prMetrics.mergedToday} PR(s) merged today`);
    }
    if (state.prMetrics.conflicting === 0 && state.prMetrics.openPRs > 0) {
      highlights.push('All open PRs are conflict-free');
    }
  }

  if (state.agentMetrics && state.agentMetrics.failureRate === 0) {
    highlights.push('Zero agent failures — clean execution');
  }

  return highlights;
}

const logger = createLogger('AnalyzeProgressNode');

/**
 * Analyze progress node — deterministic heuristic analysis
 */
export async function analyzeProgress(
  state: ProjectStatusState
): Promise<Partial<ProjectStatusState>> {
  const nodeName = 'analyze_progress';
  const startTime = new Date();
  let spanId: string | undefined;

  try {
    if (state.error) return {};

    // Create trace span if Langfuse is available
    if (state.langfuseClient?.isAvailable() && state.traceId) {
      spanId = `${nodeName}-${Date.now()}`;
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: {
          health: state.boardMetrics?.completionPercentage,
          features: state.boardMetrics?.totalFeatures,
        },
        metadata: { nodeType: 'analysis' },
        startTime,
      });
    }

    const health = assessHealth(state);
    const velocity = calculateVelocity(state);
    const bottlenecks = identifyBottlenecks(state);
    const highlights = identifyHighlights(state);

    // Estimate completion time
    const board = state.boardMetrics;
    let estimatedCompletion: string | undefined;
    if (board && velocity > 0) {
      const remaining = board.totalFeatures - (board.byStatus['done'] ?? 0);
      const hoursRemaining = remaining / velocity;
      const completionDate = new Date(Date.now() + hoursRemaining * 3_600_000);
      estimatedCompletion = completionDate.toISOString();
    }

    const progressAnalysis: ProgressAnalysis = {
      health,
      velocity,
      estimatedCompletion,
      bottlenecks,
      highlights,
    };

    const endTime = new Date();

    // Update span with output
    if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: {
          health: state.boardMetrics?.completionPercentage,
          features: state.boardMetrics?.totalFeatures,
        },
        output: { health, velocity: velocity.toFixed(2), bottlenecks: bottlenecks.length },
        metadata: {
          nodeType: 'analysis',
          success: true,
          health,
          bottleneckCount: bottlenecks.length,
        },
        startTime,
        endTime,
      });
      await state.langfuseClient.flush();
    }

    return { progressAnalysis };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[${nodeName}] Failed:`, error);

    // Update span with error
    if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { features: state.boardMetrics?.totalFeatures },
        output: '',
        metadata: { nodeType: 'analysis', success: false, error: errorMsg },
        startTime,
        endTime: new Date(),
      });
      await state.langfuseClient.flush();
    }

    throw error;
  }
}
