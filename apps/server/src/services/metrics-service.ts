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
  costPerFeature: number; // Average cost per completed feature

  // Performance metrics
  successRate: number; // Percentage of features that succeeded (0-100)
  failureRate: number; // Percentage of features that failed (0-100)
  throughputPerDay: number; // Average features completed per day

  // Quality metrics
  escalationCount: number; // Total number of escalations
  escalationRate: number; // Percentage of features escalated (0-100)

  // Model distribution (percentage of usage per model)
  modelDistribution: Record<string, number>; // Percentage by model

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
    let escalationCount = 0;
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

      // Track escalations - count features that have failureCount > 0
      // This indicates the feature required escalation (model upgrade or manual intervention)
      if (feature.failureCount && feature.failureCount > 0) {
        escalationCount++;
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

    // Calculate cost per feature
    const costPerFeature = completedCount > 0 ? totalCostUsd / completedCount : 0;

    // Calculate success and failure rates
    const totalAttempted = completedCount + failedCount;
    const successRate = totalAttempted > 0 ? (completedCount / totalAttempted) * 100 : 0;
    const failureRate = totalAttempted > 0 ? (failedCount / totalAttempted) * 100 : 0;

    // Calculate escalation rate
    const escalationRate = features.length > 0 ? (escalationCount / features.length) * 100 : 0;

    // Calculate model distribution (percentage of total cost)
    const modelDistribution: Record<string, number> = {};
    if (totalCostUsd > 0) {
      for (const [model, cost] of Object.entries(costByModel)) {
        modelDistribution[model] = (cost / totalCostUsd) * 100;
      }
    }

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
      costPerFeature,
      successRate,
      failureRate,
      throughputPerDay,
      escalationCount,
      escalationRate,
      modelDistribution,
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

  /**
   * Generate Project Impact Report with historical comparison
   * Returns a markdown-formatted report with cost, time, quality metrics
   * and comparison to historical baseline if provided
   */
  async generateImpactReport(
    projectPath: string,
    historicalBaseline?: ProjectMetrics
  ): Promise<string> {
    const currentMetrics = await this.getProjectMetrics(projectPath);
    const lines: string[] = [];

    // Header
    lines.push('# Project Impact Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    // Executive Summary
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(`- **Total Features:** ${currentMetrics.totalFeatures}`);
    lines.push(`- **Completed:** ${currentMetrics.completedFeatures}`);
    lines.push(`- **Failed:** ${currentMetrics.failedFeatures}`);
    lines.push(`- **In Progress:** ${currentMetrics.inProgressFeatures}`);
    lines.push(`- **Success Rate:** ${currentMetrics.successRate.toFixed(1)}%`);
    lines.push('');

    // Cost Analysis
    lines.push('## Cost Analysis');
    lines.push('');
    lines.push(`- **Total Cost:** $${currentMetrics.totalCostUsd.toFixed(2)}`);
    lines.push(`- **Cost per Feature:** $${currentMetrics.costPerFeature.toFixed(2)}`);
    lines.push('');

    // Cost by Model
    if (Object.keys(currentMetrics.costByModel).length > 0) {
      lines.push('### Cost Breakdown by Model');
      lines.push('');
      for (const [model, cost] of Object.entries(currentMetrics.costByModel)) {
        const percentage = currentMetrics.modelDistribution[model] || 0;
        lines.push(`- **${model}:** $${cost.toFixed(2)} (${percentage.toFixed(1)}%)`);
      }
      lines.push('');
    }

    // Time Analysis
    lines.push('## Time Analysis');
    lines.push('');
    lines.push(`- **Average Cycle Time:** ${this.formatDuration(currentMetrics.avgCycleTimeMs)}`);
    lines.push(`- **Average Agent Time:** ${this.formatDuration(currentMetrics.avgAgentTimeMs)}`);
    lines.push(
      `- **Average PR Review Time:** ${this.formatDuration(currentMetrics.avgPrReviewTimeMs)}`
    );
    lines.push(`- **Throughput:** ${currentMetrics.throughputPerDay.toFixed(2)} features/day`);
    lines.push('');

    // Quality Metrics
    lines.push('## Quality Metrics');
    lines.push('');
    lines.push(`- **Success Rate:** ${currentMetrics.successRate.toFixed(1)}%`);
    lines.push(`- **Failure Rate:** ${currentMetrics.failureRate.toFixed(1)}%`);
    lines.push(`- **Escalation Count:** ${currentMetrics.escalationCount}`);
    lines.push(`- **Escalation Rate:** ${currentMetrics.escalationRate.toFixed(1)}%`);
    lines.push('');

    // Model Distribution
    if (Object.keys(currentMetrics.modelDistribution).length > 0) {
      lines.push('## Agent Model Distribution');
      lines.push('');
      for (const [model, percentage] of Object.entries(currentMetrics.modelDistribution)) {
        lines.push(`- **${model}:** ${percentage.toFixed(1)}%`);
      }
      lines.push('');
    }

    // Historical Comparison
    if (historicalBaseline) {
      lines.push('## Historical Comparison');
      lines.push('');

      // Cost comparison
      const costDiff = currentMetrics.costPerFeature - historicalBaseline.costPerFeature;
      const costChange =
        historicalBaseline.costPerFeature > 0
          ? ((costDiff / historicalBaseline.costPerFeature) * 100).toFixed(1)
          : 'N/A';
      const costTrend = costDiff > 0 ? '📈' : costDiff < 0 ? '📉' : '➡️';
      lines.push(
        `- **Cost per Feature:** ${costTrend} ${costChange !== 'N/A' ? `${costChange}%` : costChange} ` +
          `($${historicalBaseline.costPerFeature.toFixed(2)} → $${currentMetrics.costPerFeature.toFixed(2)})`
      );

      // Cycle time comparison
      const cycleTimeDiff = currentMetrics.avgCycleTimeMs - historicalBaseline.avgCycleTimeMs;
      const cycleTimeChange =
        historicalBaseline.avgCycleTimeMs > 0
          ? ((cycleTimeDiff / historicalBaseline.avgCycleTimeMs) * 100).toFixed(1)
          : 'N/A';
      const cycleTimeTrend = cycleTimeDiff > 0 ? '📈' : cycleTimeDiff < 0 ? '📉' : '➡️';
      lines.push(
        `- **Cycle Time:** ${cycleTimeTrend} ${cycleTimeChange !== 'N/A' ? `${cycleTimeChange}%` : cycleTimeChange} ` +
          `(${this.formatDuration(historicalBaseline.avgCycleTimeMs)} → ${this.formatDuration(currentMetrics.avgCycleTimeMs)})`
      );

      // Success rate comparison
      const successRateDiff = currentMetrics.successRate - historicalBaseline.successRate;
      const successRateTrend = successRateDiff > 0 ? '📈' : successRateDiff < 0 ? '📉' : '➡️';
      lines.push(
        `- **Success Rate:** ${successRateTrend} ${successRateDiff > 0 ? '+' : ''}${successRateDiff.toFixed(1)}% ` +
          `(${historicalBaseline.successRate.toFixed(1)}% → ${currentMetrics.successRate.toFixed(1)}%)`
      );

      // Failure rate comparison
      const failureRateDiff = currentMetrics.failureRate - historicalBaseline.failureRate;
      const failureRateTrend = failureRateDiff > 0 ? '📈' : failureRateDiff < 0 ? '📉' : '➡️';
      lines.push(
        `- **Failure Rate:** ${failureRateTrend} ${failureRateDiff > 0 ? '+' : ''}${failureRateDiff.toFixed(1)}% ` +
          `(${historicalBaseline.failureRate.toFixed(1)}% → ${currentMetrics.failureRate.toFixed(1)}%)`
      );

      // Escalation rate comparison
      const escalationRateDiff = currentMetrics.escalationRate - historicalBaseline.escalationRate;
      const escalationRateTrend =
        escalationRateDiff > 0 ? '📈' : escalationRateDiff < 0 ? '📉' : '➡️';
      lines.push(
        `- **Escalation Rate:** ${escalationRateTrend} ${escalationRateDiff > 0 ? '+' : ''}${escalationRateDiff.toFixed(1)}% ` +
          `(${historicalBaseline.escalationRate.toFixed(1)}% → ${currentMetrics.escalationRate.toFixed(1)}%)`
      );
      lines.push('');
    }

    // Token Usage
    lines.push('## Token Usage');
    lines.push('');
    lines.push(`- **Total Tokens:** ${currentMetrics.tokenUsage.totalTokens.toLocaleString()}`);
    lines.push(
      `- **Input Tokens:** ${currentMetrics.tokenUsage.totalInputTokens.toLocaleString()}`
    );
    lines.push(
      `- **Output Tokens:** ${currentMetrics.tokenUsage.totalOutputTokens.toLocaleString()}`
    );
    lines.push('');

    // Project Period
    if (currentMetrics.periodStart && currentMetrics.periodEnd) {
      lines.push('## Project Timeline');
      lines.push('');
      lines.push(`- **Start:** ${new Date(currentMetrics.periodStart).toISOString()}`);
      lines.push(`- **End:** ${new Date(currentMetrics.periodEnd).toISOString()}`);
      const durationMs =
        new Date(currentMetrics.periodEnd).getTime() -
        new Date(currentMetrics.periodStart).getTime();
      lines.push(`- **Duration:** ${this.formatDuration(durationMs)}`);
      lines.push('');
    }

    // Was it worth it?
    lines.push('## Bottom Line: Was It Worth It?');
    lines.push('');

    const worthItScore = this.calculateWorthItScore(currentMetrics, historicalBaseline);
    lines.push(`**Worth It Score:** ${worthItScore.score}/100`);
    lines.push('');
    lines.push(worthItScore.summary);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format duration in milliseconds to human-readable string
   */
  private formatDuration(ms: number): string {
    if (ms === 0) return '0ms';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    }
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
    if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    return `${seconds}s`;
  }

  /**
   * Calculate a "worth it" score based on project metrics
   * Returns a score 0-100 and a summary statement
   */
  private calculateWorthItScore(
    current: ProjectMetrics,
    baseline?: ProjectMetrics
  ): { score: number; summary: string } {
    let score = 50; // Start neutral
    const factors: string[] = [];

    // Success rate impact (0-30 points)
    if (current.successRate >= 90) {
      score += 30;
      factors.push('excellent success rate');
    } else if (current.successRate >= 75) {
      score += 20;
      factors.push('good success rate');
    } else if (current.successRate >= 50) {
      score += 10;
      factors.push('moderate success rate');
    } else {
      score -= 10;
      factors.push('low success rate');
    }

    // Cost efficiency (0-20 points)
    if (current.costPerFeature < 1.0) {
      score += 20;
      factors.push('highly cost-efficient');
    } else if (current.costPerFeature < 5.0) {
      score += 10;
      factors.push('cost-efficient');
    } else if (current.costPerFeature > 10.0) {
      score -= 10;
      factors.push('high cost per feature');
    }

    // Escalation rate impact (0-15 points)
    if (current.escalationRate < 5) {
      score += 15;
      factors.push('minimal escalations');
    } else if (current.escalationRate < 15) {
      score += 5;
      factors.push('some escalations');
    } else {
      score -= 10;
      factors.push('high escalation rate');
    }

    // Historical improvement (0-20 points)
    if (baseline) {
      let improvements = 0;

      if (current.costPerFeature < baseline.costPerFeature) {
        improvements++;
        factors.push('improved cost efficiency');
      }
      if (current.avgCycleTimeMs < baseline.avgCycleTimeMs) {
        improvements++;
        factors.push('faster cycle time');
      }
      if (current.successRate > baseline.successRate) {
        improvements++;
        factors.push('better success rate');
      }
      if (current.escalationRate < baseline.escalationRate) {
        improvements++;
        factors.push('fewer escalations');
      }

      score += improvements * 5;
    }

    // Throughput bonus (0-15 points)
    if (current.throughputPerDay >= 5) {
      score += 15;
      factors.push('high throughput');
    } else if (current.throughputPerDay >= 2) {
      score += 10;
      factors.push('good throughput');
    } else if (current.throughputPerDay >= 1) {
      score += 5;
      factors.push('moderate throughput');
    }

    // Clamp score to 0-100
    score = Math.max(0, Math.min(100, score));

    // Generate summary
    let summary = '';
    if (score >= 80) {
      summary = `✅ **Highly Successful** - This project delivered exceptional value with ${factors.join(', ')}.`;
    } else if (score >= 60) {
      summary = `👍 **Successful** - This project delivered solid results with ${factors.join(', ')}.`;
    } else if (score >= 40) {
      summary = `⚠️ **Mixed Results** - This project had both successes and challenges: ${factors.join(', ')}.`;
    } else {
      summary = `❌ **Needs Improvement** - This project faced significant challenges including ${factors.join(', ')}.`;
    }

    return { score, summary };
  }
}
