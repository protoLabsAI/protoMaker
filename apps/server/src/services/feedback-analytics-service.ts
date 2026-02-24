/**
 * Feedback Analytics Service
 *
 * Tracks metrics across PR review feedback cycles:
 * - Threads by severity per PR
 * - Denial rates (accepted vs denied threads)
 * - Most-flagged files
 * - Recurring feedback categories
 *
 * Aggregated after each PR feedback cycle and stored in .automaker/analytics/
 */

import { createLogger } from '@protolabs-ai/utils';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { ReviewThreadFeedback } from '@protolabs-ai/types';

const logger = createLogger('FeedbackAnalytics');

export interface FeedbackMetrics {
  /** Total threads analyzed */
  totalThreads: number;
  /** Threads by severity */
  bySeverity: {
    critical: number;
    warning: number;
    suggestion: number;
    info: number;
  };
  /** Denial rate (denied / total) */
  denialRate: number;
  /** Accepted threads */
  acceptedCount: number;
  /** Denied threads */
  deniedCount: number;
  /** Pending threads (not yet decided) */
  pendingCount: number;
  /** Most flagged files */
  mostFlaggedFiles: Array<{ file: string; count: number }>;
  /** Recurring categories */
  recurringCategories: Array<{ category: string; count: number }>;
}

export interface PRAnalytics {
  prNumber: number;
  featureId: string;
  projectPath: string;
  timestamp: string;
  metrics: FeedbackMetrics;
}

export interface FilePattern {
  file: string;
  totalOccurrences: number;
  categories: Map<string, number>;
  firstSeen: string;
  lastSeen: string;
}

export interface CategoryPattern {
  category: string;
  totalOccurrences: number;
  files: Set<string>;
  firstSeen: string;
  lastSeen: string;
}

export class FeedbackAnalyticsService {
  private analyticsDir: string;
  private metricsFile: string;
  private filePatterns: Map<string, FilePattern> = new Map();
  private categoryPatterns: Map<string, CategoryPattern> = new Map();

  constructor(projectPath: string) {
    this.analyticsDir = join(projectPath, '.automaker', 'analytics');
    this.metricsFile = join(this.analyticsDir, 'pr-feedback-metrics.json');
  }

  /**
   * Aggregate metrics from PR feedback threads
   */
  async aggregateMetrics(
    prNumber: number,
    featureId: string,
    projectPath: string,
    threads: ReviewThreadFeedback[],
    threadDetails?: Array<{
      threadId: string;
      severity?: 'critical' | 'warning' | 'suggestion' | 'info';
      category?: string;
      file?: string;
    }>
  ): Promise<PRAnalytics> {
    logger.info(`Aggregating metrics for PR #${prNumber}, ${threads.length} threads`);

    // Count by status
    const acceptedCount = threads.filter((t) => t.status === 'accepted').length;
    const deniedCount = threads.filter((t) => t.status === 'denied').length;
    const pendingCount = threads.filter((t) => t.status === 'pending').length;

    // Count by severity (from threadDetails if provided)
    const severityCounts = {
      critical: 0,
      warning: 0,
      suggestion: 0,
      info: 0,
    };

    const fileCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();

    if (threadDetails) {
      for (const detail of threadDetails) {
        // Count severity
        if (detail.severity) {
          severityCounts[detail.severity]++;
        }

        // Count files
        if (detail.file) {
          fileCounts.set(detail.file, (fileCounts.get(detail.file) || 0) + 1);

          // Update global file patterns
          this.updateFilePattern(detail.file, detail.category);
        }

        // Count categories
        if (detail.category) {
          categoryCounts.set(detail.category, (categoryCounts.get(detail.category) || 0) + 1);

          // Update global category patterns
          this.updateCategoryPattern(detail.category, detail.file);
        }
      }
    }

    // Sort and limit to top entries
    const mostFlaggedFiles = Array.from(fileCounts.entries())
      .map(([file, count]) => ({ file, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const recurringCategories = Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const metrics: FeedbackMetrics = {
      totalThreads: threads.length,
      bySeverity: severityCounts,
      denialRate: threads.length > 0 ? deniedCount / threads.length : 0,
      acceptedCount,
      deniedCount,
      pendingCount,
      mostFlaggedFiles,
      recurringCategories,
    };

    const analytics: PRAnalytics = {
      prNumber,
      featureId,
      projectPath,
      timestamp: new Date().toISOString(),
      metrics,
    };

    // Persist to disk
    await this.saveAnalytics(analytics);

    logger.info(
      `Metrics aggregated: ${threads.length} threads, denial rate ${(metrics.denialRate * 100).toFixed(1)}%`
    );

    return analytics;
  }

  /**
   * Update file pattern tracking
   */
  private updateFilePattern(file: string, category?: string): void {
    const now = new Date().toISOString();
    let pattern = this.filePatterns.get(file);

    if (!pattern) {
      pattern = {
        file,
        totalOccurrences: 0,
        categories: new Map(),
        firstSeen: now,
        lastSeen: now,
      };
      this.filePatterns.set(file, pattern);
    }

    pattern.totalOccurrences++;
    pattern.lastSeen = now;

    if (category) {
      pattern.categories.set(category, (pattern.categories.get(category) || 0) + 1);
    }
  }

  /**
   * Update category pattern tracking
   */
  private updateCategoryPattern(category: string, file?: string): void {
    const now = new Date().toISOString();
    let pattern = this.categoryPatterns.get(category);

    if (!pattern) {
      pattern = {
        category,
        totalOccurrences: 0,
        files: new Set(),
        firstSeen: now,
        lastSeen: now,
      };
      this.categoryPatterns.set(category, pattern);
    }

    pattern.totalOccurrences++;
    pattern.lastSeen = now;

    if (file) {
      pattern.files.add(file);
    }
  }

  /**
   * Get file patterns (for pattern detection)
   */
  getFilePatterns(): Map<string, FilePattern> {
    return this.filePatterns;
  }

  /**
   * Get category patterns (for pattern detection)
   */
  getCategoryPatterns(): Map<string, CategoryPattern> {
    return this.categoryPatterns;
  }

  /**
   * Save analytics to disk
   */
  private async saveAnalytics(analytics: PRAnalytics): Promise<void> {
    try {
      await mkdir(this.analyticsDir, { recursive: true });

      // Load existing data
      let allAnalytics: PRAnalytics[] = [];
      try {
        const existing = await readFile(this.metricsFile, 'utf-8');
        allAnalytics = JSON.parse(existing);
      } catch {
        // File doesn't exist yet
      }

      // Append new analytics
      allAnalytics.push(analytics);

      // Save back
      await writeFile(this.metricsFile, JSON.stringify(allAnalytics, null, 2));

      logger.debug(`Analytics saved to ${this.metricsFile}`);
    } catch (error) {
      logger.error('Failed to save analytics:', error);
      throw error;
    }
  }

  /**
   * Load all historical analytics
   */
  async loadAllAnalytics(): Promise<PRAnalytics[]> {
    try {
      const data = await readFile(this.metricsFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Get analytics for a specific PR
   */
  async getAnalyticsForPR(prNumber: number): Promise<PRAnalytics[]> {
    const all = await this.loadAllAnalytics();
    return all.filter((a) => a.prNumber === prNumber);
  }

  /**
   * Get analytics for a specific feature
   */
  async getAnalyticsForFeature(featureId: string): Promise<PRAnalytics[]> {
    const all = await this.loadAllAnalytics();
    return all.filter((a) => a.featureId === featureId);
  }

  /**
   * Get summary statistics across all PRs
   */
  async getSummaryStats(): Promise<{
    totalPRs: number;
    totalThreads: number;
    avgDenialRate: number;
    topFiles: Array<{ file: string; count: number }>;
    topCategories: Array<{ category: string; count: number }>;
  }> {
    const all = await this.loadAllAnalytics();

    const totalPRs = all.length;
    const totalThreads = all.reduce((sum, a) => sum + a.metrics.totalThreads, 0);
    const avgDenialRate =
      all.length > 0 ? all.reduce((sum, a) => sum + a.metrics.denialRate, 0) / all.length : 0;

    // Aggregate file patterns
    const topFiles = Array.from(this.filePatterns.values())
      .map((p) => ({ file: p.file, count: p.totalOccurrences }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Aggregate category patterns
    const topCategories = Array.from(this.categoryPatterns.values())
      .map((p) => ({ category: p.category, count: p.totalOccurrences }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalPRs,
      totalThreads,
      avgDenialRate,
      topFiles,
      topCategories,
    };
  }
}
