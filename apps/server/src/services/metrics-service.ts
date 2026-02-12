/**
 * MetricsService - Compute project metrics from feature.json data
 * Provides analytics for project performance, cost tracking, and capacity planning
 */

import { createLogger } from '@automaker/utils';
import type { Feature, ExecutionRecord } from '@automaker/types';
import { FeatureLoader } from './feature-loader.js';

const logger = createLogger('MetricsService');

/**
 * Normalize model identifiers to canonical short names (sonnet, opus, haiku).
 * Falls back to 'sonnet' since it's the default agent model.
 */
function normalizeModelKey(model: string | undefined | null): string {
  if (!model) return 'sonnet';
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('haiku')) return 'haiku';
  if (lower.includes('sonnet')) return 'sonnet';
  // Unknown model string — default to sonnet (the standard agent model)
  return 'sonnet';
}

export interface ProjectMetrics {
  // Timing metrics (in milliseconds)
  avgCycleTimeMs: number; // Average time from start to done
  avgAgentTimeMs: number; // Average agent execution time
  avgPrReviewTimeMs: number; // Average PR review time

  // Cost metrics
  totalCostUsd: number; // Total cost across all features
  costByModel: Record<string, number>; // Cost breakdown by model

  // Performance metrics
  successRate: number; // Percentage of features that succeeded (0-100)
  throughputPerDay: number; // Average features completed per day

  // Token usage (aggregated from SDK if available)
  tokenUsage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };

  // Metadata
  totalFeatures: number;
  completedFeatures: number;
  failedFeatures: number;
  inProgressFeatures: number;
  periodStart?: string; // ISO date of first feature
  periodEnd?: string; // ISO date of last feature
}

export interface CapacityMetrics {
  // Current capacity utilization
  currentConcurrency: number; // Number of features currently in progress
  maxConcurrency: number; // Max features that can run concurrently

  // Workload distribution
  backlogSize: number; // Features waiting to be started
  blockedCount: number; // Features currently blocked
  reviewCount: number; // Features in review

  // Velocity metrics
  avgCompletionTimeMs: number; // Average time to complete a feature
  estimatedBacklogTimeMs: number; // Estimated time to clear backlog

  // Resource utilization
  utilizationPercent: number; // Current capacity utilization (0-100)
}

export class MetricsService {
  private featureLoader: FeatureLoader;

  constructor(featureLoader: FeatureLoader) {
    this.featureLoader = featureLoader;
  }

  /**
   * Compute aggregated project metrics from all features
   */
  async getProjectMetrics(projectPath: string): Promise<ProjectMetrics> {
    const features = await this.featureLoader.getAll(projectPath);

    // Initialize metrics
    let totalCycleTimeMs = 0;
    let totalAgentTimeMs = 0;
    let totalPrReviewTimeMs = 0;
    let totalCostUsd = 0;
    const costByModel: Record<string, number> = {};
    let completedCount = 0;
    let failedCount = 0;
    let cycleTimeCount = 0;
    let agentTimeCount = 0;
    let prReviewTimeCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let periodStart: string | undefined;
    let periodEnd: string | undefined;

    // Process each feature
    for (const feature of features) {
      // Track costs and tokens from executionHistory (primary source)
      if (feature.executionHistory?.length) {
        for (const exec of feature.executionHistory) {
          if (exec.costUsd != null) {
            totalCostUsd += exec.costUsd;
            const modelKey = normalizeModelKey(exec.model);
            costByModel[modelKey] = (costByModel[modelKey] || 0) + exec.costUsd;
          }
          if (exec.inputTokens != null) totalInputTokens += exec.inputTokens;
          if (exec.outputTokens != null) totalOutputTokens += exec.outputTokens;
        }
      } else if (feature.costUsd) {
        // Fallback: aggregate cost from feature-level field
        totalCostUsd += feature.costUsd;
        const modelKey = normalizeModelKey(feature.model);
        costByModel[modelKey] = (costByModel[modelKey] || 0) + feature.costUsd;
      }

      // Track completion status
      if (feature.status === 'done' || feature.status === 'verified') {
        completedCount++;
      }
      // Count failures from executionHistory (blocked is temporary, not a failure)
      if (feature.executionHistory?.some((exec) => !exec.success)) {
        failedCount++;
      }

      // Calculate cycle time (createdAt to completedAt)
      const isDone = feature.status === 'done' || feature.status === 'verified';
      if (isDone && feature.createdAt && feature.completedAt) {
        const cycleTime =
          new Date(feature.completedAt).getTime() - new Date(feature.createdAt).getTime();
        if (cycleTime > 0) {
          totalCycleTimeMs += cycleTime;
          cycleTimeCount++;
        }
      }

      // Calculate agent execution time from executionHistory
      if (feature.executionHistory?.length) {
        for (const exec of feature.executionHistory) {
          if (exec.durationMs && exec.durationMs > 0) {
            totalAgentTimeMs += exec.durationMs;
            agentTimeCount++;
          }
        }
      }

      // Calculate PR review time from prReviewDurationMs (computed at merge time)
      if (feature.prReviewDurationMs && feature.prReviewDurationMs > 0) {
        totalPrReviewTimeMs += feature.prReviewDurationMs;
        prReviewTimeCount++;
      }

      // Track time period using completed features only for accurate throughput
      if (isDone && feature.completedAt) {
        if (!periodStart || feature.completedAt < periodStart) periodStart = feature.completedAt;
        if (!periodEnd || feature.completedAt > periodEnd) periodEnd = feature.completedAt;
      }
    }

    // Calculate averages
    const avgCycleTimeMs = cycleTimeCount > 0 ? totalCycleTimeMs / cycleTimeCount : 0;
    const avgAgentTimeMs = agentTimeCount > 0 ? totalAgentTimeMs / agentTimeCount : 0;
    const avgPrReviewTimeMs = prReviewTimeCount > 0 ? totalPrReviewTimeMs / prReviewTimeCount : 0;

    // Calculate success rate
    const totalAttempted = completedCount + failedCount;
    const successRate = totalAttempted > 0 ? (completedCount / totalAttempted) * 100 : 0;

    // Calculate throughput (features per day)
    let throughputPerDay = 0;
    if (periodStart && periodEnd && completedCount > 0) {
      const durationMs = new Date(periodEnd).getTime() - new Date(periodStart).getTime();
      const durationDays = durationMs / (1000 * 60 * 60 * 24);
      throughputPerDay = durationDays > 0 ? completedCount / durationDays : 0;
    }

    return {
      avgCycleTimeMs,
      avgAgentTimeMs,
      avgPrReviewTimeMs,
      totalCostUsd,
      costByModel,
      successRate,
      throughputPerDay,
      tokenUsage: {
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
      totalFeatures: features.length,
      completedFeatures: completedCount,
      failedFeatures: failedCount,
      inProgressFeatures: features.filter((f) => f.status === 'in_progress').length,
      periodStart,
      periodEnd,
    };
  }

  /**
   * Compute capacity and utilization metrics
   */
  async getCapacityMetrics(
    projectPath: string,
    maxConcurrency: number = 3
  ): Promise<CapacityMetrics> {
    const features = await this.featureLoader.getAll(projectPath);

    // Count features by status
    const inProgressCount = features.filter((f) => f.status === 'in_progress').length;
    const backlogCount = features.filter((f) => f.status === 'backlog').length;
    const blockedCount = features.filter((f) => f.status === 'blocked').length;
    const reviewCount = features.filter((f) => f.status === 'review').length;

    // Calculate average completion time from completed features
    let totalCompletionTimeMs = 0;
    let completionCount = 0;

    for (const feature of features) {
      if ((feature.status === 'done' || feature.status === 'verified') && feature.startedAt) {
        const startTime = new Date(feature.startedAt).getTime();
        const endTime = this.getFeatureEndTime(feature);
        if (endTime) {
          totalCompletionTimeMs += endTime - startTime;
          completionCount++;
        }
      }
    }

    const avgCompletionTimeMs = completionCount > 0 ? totalCompletionTimeMs / completionCount : 0;

    // Estimate time to clear backlog
    const estimatedBacklogTimeMs =
      backlogCount > 0 && avgCompletionTimeMs > 0
        ? (backlogCount * avgCompletionTimeMs) / maxConcurrency
        : 0;

    // Calculate utilization (capped at 100%)
    const utilizationPercent =
      maxConcurrency > 0 ? Math.min((inProgressCount / maxConcurrency) * 100, 100) : 0;

    return {
      currentConcurrency: inProgressCount,
      maxConcurrency,
      backlogSize: backlogCount,
      blockedCount,
      reviewCount,
      avgCompletionTimeMs,
      estimatedBacklogTimeMs,
      utilizationPercent,
    };
  }

  /**
   * Get the end time for a feature (when it was completed)
   * Uses completedAt (set when feature transitions to done/verified)
   */
  private getFeatureEndTime(feature: Feature): number | null {
    if (feature.completedAt) {
      return new Date(feature.completedAt).getTime();
    }
    return null;
  }
}
