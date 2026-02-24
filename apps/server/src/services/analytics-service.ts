/**
 * Analytics Service
 *
 * Aggregates performance data across completed features:
 * - Phase duration statistics (mean, median, p95)
 * - Slowest tools by total execution time
 * - Retry trends across multiple attempts
 */

import { createLogger } from '@automaker/utils';
import type { PipelinePhase } from '@automaker/types';
import { FeatureLoader } from './feature-loader.js';

const logger = createLogger('AnalyticsService');

export interface PhaseStats {
  mean: number;
  median: number;
  p95: number;
}

export interface ToolStats {
  name: string;
  totalMs: number;
  count: number;
  avgMs: number;
}

export interface RetryTrend {
  featureId: string;
  title: string;
  attempts: number;
  durations: number[];
}

export interface AgentPerformanceAnalytics {
  phaseAverages: Record<PipelinePhase, PhaseStats>;
  slowestTools: ToolStats[];
  retryTrends: RetryTrend[];
  totalFeaturesAnalyzed: number;
}

export class AnalyticsService {
  private featureLoader: FeatureLoader;
  private cache: {
    data?: AgentPerformanceAnalytics;
    timestamp?: number;
  } = {};
  private readonly CACHE_TTL_MS = 30 * 1000; // 30 seconds

  constructor() {
    this.featureLoader = new FeatureLoader();
  }

  /**
   * Get agent performance analytics across all completed features
   */
  async getAgentPerformance(projectPath: string): Promise<AgentPerformanceAnalytics> {
    // Check cache
    if (this.cache.data && this.cache.timestamp) {
      const age = Date.now() - this.cache.timestamp;
      if (age < this.CACHE_TTL_MS) {
        logger.debug('Returning cached analytics');
        return this.cache.data;
      }
    }

    logger.info('Computing agent performance analytics...');

    // Load all completed features (done or verified)
    const allFeatures = await this.featureLoader.getAll(projectPath);
    const completedFeatures = allFeatures.filter(
      (f) => f.status === 'done' || f.status === 'verified'
    );

    logger.info(
      `Analyzing ${completedFeatures.length} completed features (out of ${allFeatures.length} total)`
    );

    // Extract phase durations
    const phaseDurationsMap = new Map<PipelinePhase, number[]>();
    const toolExecutionsMap = new Map<string, { totalMs: number; count: number }>();
    const retryTrends: RetryTrend[] = [];

    for (const feature of completedFeatures) {
      // Extract phase durations from pipelineState
      if (feature.pipelineState?.phaseDurations) {
        for (const [phase, duration] of Object.entries(feature.pipelineState.phaseDurations)) {
          if (typeof duration === 'number' && duration > 0) {
            const existing = phaseDurationsMap.get(phase as PipelinePhase) || [];
            existing.push(duration);
            phaseDurationsMap.set(phase as PipelinePhase, existing);
          }
        }
      }

      // Extract tool executions
      if (feature.pipelineState?.toolExecutions) {
        for (const tool of feature.pipelineState.toolExecutions) {
          const existing = toolExecutionsMap.get(tool.name) || { totalMs: 0, count: 0 };
          existing.totalMs += tool.durationMs;
          existing.count += 1;
          toolExecutionsMap.set(tool.name, existing);
        }
      }

      // Extract retry trends from executionHistory
      if (feature.executionHistory && feature.executionHistory.length >= 2) {
        const durations = feature.executionHistory
          .filter((e) => e.durationMs !== undefined)
          .map((e) => e.durationMs!);

        if (durations.length >= 2) {
          retryTrends.push({
            featureId: feature.id,
            title: feature.title || feature.id,
            attempts: feature.executionHistory.length,
            durations,
          });
        }
      }
    }

    // Calculate phase averages
    const phaseAverages: Partial<Record<PipelinePhase, PhaseStats>> = {};
    for (const [phase, durations] of phaseDurationsMap.entries()) {
      if (durations.length > 0) {
        phaseAverages[phase] = this.calculateStats(durations);
      }
    }

    // Calculate slowest tools (top 10 by total time)
    const slowestTools = Array.from(toolExecutionsMap.entries())
      .map(([name, stats]) => ({
        name,
        totalMs: stats.totalMs,
        count: stats.count,
        avgMs: Math.round(stats.totalMs / stats.count),
      }))
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, 10);

    const result: AgentPerformanceAnalytics = {
      phaseAverages: phaseAverages as Record<PipelinePhase, PhaseStats>,
      slowestTools,
      retryTrends,
      totalFeaturesAnalyzed: completedFeatures.length,
    };

    // Update cache
    this.cache = {
      data: result,
      timestamp: Date.now(),
    };

    logger.info(`Analytics computed for ${completedFeatures.length} features`);

    return result;
  }

  /**
   * Calculate mean, median, and p95 for a set of durations
   */
  private calculateStats(durations: number[]): PhaseStats {
    if (durations.length === 0) {
      return { mean: 0, median: 0, p95: 0 };
    }

    // Sort for median and p95
    const sorted = [...durations].sort((a, b) => a - b);

    // Mean
    const mean = Math.round(sorted.reduce((sum, d) => sum + d, 0) / sorted.length);

    // Median
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];

    // P95 (95th percentile)
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Index] || sorted[sorted.length - 1];

    return { mean, median, p95 };
  }
}
