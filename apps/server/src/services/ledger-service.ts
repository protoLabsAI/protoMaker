/**
 * LedgerService - Persistent append-only JSONL ledger for feature completion metrics.
 *
 * Records are written when features reach done/verified status, before archival.
 * Provides time-series analytics that survive feature deletion.
 *
 * File: `.automaker/ledger/metrics.jsonl` (one JSON object per line)
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabs-ai/utils';

const execFileAsync = promisify(execFile);
import type {
  Feature,
  MetricsLedgerRecord,
  LedgerExecution,
  LedgerQueryOptions,
  LedgerAggregateMetrics,
  TimeSeriesData,
  TimeSeriesPoint,
  TimeSeriesMetric,
  TimeGroupBy,
  CycleTimeBucket,
} from '@protolabs-ai/types';
import type { FeatureLoader } from './feature-loader.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('LedgerService');

/** Normalize model strings to canonical short names */
function normalizeModelKey(model: string | undefined | null): string {
  if (!model) return 'sonnet';
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('haiku')) return 'haiku';
  if (lower.includes('sonnet')) return 'sonnet';
  return 'sonnet';
}

function getLedgerPath(projectPath: string): string {
  return path.join(projectPath, '.automaker', 'ledger', 'metrics.jsonl');
}

export class LedgerService {
  private featureLoader: FeatureLoader;
  private events: EventEmitter;
  private unsubscribe?: () => void;

  constructor(featureLoader: FeatureLoader, events: EventEmitter) {
    this.featureLoader = featureLoader;
    this.events = events;
  }

  /**
   * Subscribe to feature:status-changed events to auto-record completions.
   */
  initialize(): void {
    this.unsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'feature:status-changed') {
        const data = payload as {
          projectPath: string;
          featureId: string;
          newStatus: string;
        };
        if (data.newStatus === 'done' || data.newStatus === 'verified') {
          this.handleFeatureCompleted(data.projectPath, data.featureId).catch((err) => {
            logger.error(`Failed to record ledger entry for ${data.featureId}:`, err);
          });
        }
      }
    });
    logger.info('LedgerService initialized, listening for feature completions');
  }

  /**
   * Cleanup event subscription on shutdown
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  /**
   * Handle a feature reaching done/verified — read feature, build record, append.
   */
  private async handleFeatureCompleted(projectPath: string, featureId: string): Promise<void> {
    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        logger.warn(`Feature ${featureId} not found for ledger recording`);
        return;
      }
      await this.recordFeatureCompletion(projectPath, feature);
    } catch (err) {
      logger.error(`Error recording completion for ${featureId}:`, err);
    }
  }

  /**
   * Build and append a ledger record from a completed feature.
   * Idempotent: skips if featureId already exists in the ledger.
   */
  async recordFeatureCompletion(projectPath: string, feature: Feature): Promise<void> {
    const ledgerPath = getLedgerPath(projectPath);

    // Check for existing record (idempotent)
    const existing = await this.hasRecord(projectPath, feature.id);
    if (existing) {
      logger.debug(`Ledger record already exists for feature ${feature.id}, skipping`);
      return;
    }

    const record = await this.buildRecord(feature, projectPath);

    // Ensure directory exists
    const dir = path.dirname(ledgerPath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Append to JSONL
    const line = JSON.stringify(record) + '\n';
    await fs.promises.appendFile(ledgerPath, line, 'utf-8');

    this.events.emit('ledger:record-written', {
      projectPath,
      featureId: feature.id,
      recordId: record.recordId,
      costUsd: record.totalCostUsd,
    });

    logger.debug(`Ledger record written for feature "${feature.title || feature.id}"`);
  }

  /**
   * Check if a record already exists for a given featureId
   */
  async hasRecord(projectPath: string, featureId: string): Promise<boolean> {
    const records = await this.getRecords(projectPath, {});
    return records.some((r) => r.featureId === featureId);
  }

  /**
   * Query GitHub for PR data by branch name.
   * Returns null if no PR found or on failure.
   */
  private async getGitHubPRData(
    projectPath: string,
    branchName: string
  ): Promise<{
    prNumber: number;
    prUrl: string;
    prCreatedAt: string;
    prMergedAt?: string;
    commitCount: number;
  } | null> {
    try {
      // Try merged PRs first, then open
      for (const state of ['merged', 'open'] as const) {
        const { stdout } = await execFileAsync(
          'gh',
          [
            'pr',
            'list',
            '--head',
            branchName,
            '--state',
            state,
            '--limit',
            '1',
            '--json',
            'number,url,createdAt,mergedAt',
          ],
          { cwd: projectPath, timeout: 15000 }
        );
        const prs = JSON.parse(stdout.trim() || '[]');
        if (prs.length > 0) {
          const pr = prs[0];
          // Get commit count separately to avoid GraphQL limits
          let commitCount = 0;
          try {
            const { stdout: countOut } = await execFileAsync(
              'gh',
              ['pr', 'view', String(pr.number), '--json', 'commits', '--jq', '.commits | length'],
              { cwd: projectPath, timeout: 10000 }
            );
            commitCount = parseInt(countOut.trim(), 10) || 0;
          } catch {
            // Leave as 0 on failure
          }
          return {
            prNumber: pr.number,
            prUrl: pr.url,
            prCreatedAt: pr.createdAt,
            prMergedAt: pr.mergedAt || undefined,
            commitCount,
          };
        }
      }
      return null;
    } catch (err) {
      logger.debug(`GitHub PR lookup failed for branch ${branchName}: ${err}`);
      return null;
    }
  }

  /**
   * Build a MetricsLedgerRecord from a Feature object,
   * enriching with GitHub PR data when available.
   */
  private async buildRecord(feature: Feature, projectPath?: string): Promise<MetricsLedgerRecord> {
    const now = new Date().toISOString();
    const completedAt = feature.completedAt || now;
    const createdAt = feature.createdAt || now;

    // Compute cycle time
    const cycleTimeMs =
      feature.createdAt && feature.completedAt
        ? new Date(feature.completedAt).getTime() - new Date(feature.createdAt).getTime()
        : 0;

    // Compute agent time from execution history
    let agentTimeMs = 0;
    let totalCostUsd = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const costByModel: Record<string, number> = {};
    const executions: LedgerExecution[] = [];

    if (feature.executionHistory?.length) {
      for (const exec of feature.executionHistory) {
        if (exec.durationMs && exec.durationMs > 0) {
          agentTimeMs += exec.durationMs;
        }
        const cost = exec.costUsd || 0;
        totalCostUsd += cost;
        totalInputTokens += exec.inputTokens || 0;
        totalOutputTokens += exec.outputTokens || 0;

        const modelKey = normalizeModelKey(exec.model);
        costByModel[modelKey] = (costByModel[modelKey] || 0) + cost;

        executions.push({
          model: normalizeModelKey(exec.model),
          costUsd: cost,
          durationMs: exec.durationMs || 0,
          inputTokens: exec.inputTokens || 0,
          outputTokens: exec.outputTokens || 0,
          success: exec.success,
          trigger: exec.trigger || 'auto',
        });
      }
    } else if (feature.costUsd) {
      totalCostUsd = feature.costUsd;
      const modelKey = normalizeModelKey(feature.model);
      costByModel[modelKey] = feature.costUsd;
    }

    // PR review time
    const prReviewTimeMs = feature.prReviewDurationMs || undefined;

    // Start with feature-level PR data (may be null)
    let prNumber = feature.prNumber;
    let prUrl = feature.prUrl;
    let prCreatedAt = feature.prCreatedAt;
    let prMergedAt = feature.prMergedAt;
    let commitCount: number | undefined;

    // Enrich from GitHub if we have a branch name and missing PR data
    if (projectPath && feature.branchName && (!prCreatedAt || !prMergedAt || !prNumber)) {
      const ghData = await this.getGitHubPRData(projectPath, feature.branchName);
      if (ghData) {
        prNumber = prNumber || ghData.prNumber;
        prUrl = prUrl || ghData.prUrl;
        prCreatedAt = prCreatedAt || ghData.prCreatedAt;
        prMergedAt = prMergedAt || ghData.prMergedAt;
        commitCount = ghData.commitCount;
      }
    }

    // Compute PR review time from enriched data if not already set
    const effectivePrReviewTimeMs =
      prReviewTimeMs ||
      (prCreatedAt && prMergedAt
        ? new Date(prMergedAt).getTime() - new Date(prCreatedAt).getTime()
        : undefined);

    return {
      recordId: randomUUID(),
      recordType: 'feature_completion',
      timestamp: now,
      featureId: feature.id,
      featureTitle: feature.title || 'Untitled',
      category: feature.category,
      epicId: feature.epicId,
      projectSlug: feature.projectSlug,
      milestoneSlug: feature.milestoneSlug,
      isEpic: feature.isEpic || false,
      createdAt,
      startedAt: feature.startedAt,
      reviewStartedAt: feature.reviewStartedAt,
      completedAt,
      cycleTimeMs,
      agentTimeMs,
      prReviewTimeMs: effectivePrReviewTimeMs,
      totalCostUsd,
      costByModel,
      totalInputTokens,
      totalOutputTokens,
      complexity: feature.complexity as MetricsLedgerRecord['complexity'],
      executionCount: feature.executionHistory?.length || 0,
      failureCount: feature.failureCount || 0,
      escalated: (feature.failureCount || 0) > 0,
      finalStatus: (feature.status as string) || 'done',
      executions,
      prNumber,
      prUrl,
      prCreatedAt,
      prMergedAt,
      commitCount,
      branchName: feature.branchName,
      assignedModel: feature.model,
    };
  }

  /**
   * Read all records from the ledger, optionally filtered
   */
  async getRecords(
    projectPath: string,
    filters?: LedgerQueryOptions
  ): Promise<MetricsLedgerRecord[]> {
    const ledgerPath = getLedgerPath(projectPath);

    if (!fs.existsSync(ledgerPath)) {
      return [];
    }

    const records: MetricsLedgerRecord[] = [];
    const fileStream = fs.createReadStream(ledgerPath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record = JSON.parse(trimmed) as MetricsLedgerRecord;
        if (this.matchesFilters(record, filters)) {
          records.push(record);
        }
      } catch {
        logger.warn(`Skipping malformed ledger line: ${trimmed.slice(0, 100)}`);
      }
    }

    return records;
  }

  /**
   * Check if a record matches the given filter criteria
   */
  private matchesFilters(record: MetricsLedgerRecord, filters?: LedgerQueryOptions): boolean {
    if (!filters) return true;

    if (filters.startDate && record.completedAt < filters.startDate) return false;
    if (filters.endDate && record.completedAt > filters.endDate) return false;
    if (filters.projectSlug && record.projectSlug !== filters.projectSlug) return false;
    if (filters.epicId && record.epicId !== filters.epicId) return false;
    if (filters.complexity && record.complexity !== filters.complexity) return false;
    if (filters.minCostUsd != null && record.totalCostUsd < filters.minCostUsd) return false;
    if (filters.maxCostUsd != null && record.totalCostUsd > filters.maxCostUsd) return false;

    return true;
  }

  /**
   * Compute aggregate metrics from ledger records
   */
  async getAggregateMetrics(
    projectPath: string,
    filters?: LedgerQueryOptions
  ): Promise<LedgerAggregateMetrics> {
    const records = await this.getRecords(projectPath, filters);

    if (records.length === 0) {
      return {
        totalFeatures: 0,
        totalCostUsd: 0,
        avgCostPerFeature: 0,
        avgCycleTimeMs: 0,
        avgAgentTimeMs: 0,
        avgPrReviewTimeMs: 0,
        successRate: 0,
        escalationRate: 0,
        throughputPerDay: 0,
        costByModel: {},
        modelDistribution: {},
        tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0 },
        totalPRsMerged: 0,
        prsPerDay: 0,
        prsPerHour: 0,
        totalCommits: 0,
        commitsPerDay: 0,
        commitsPerHour: 0,
      };
    }

    let totalCostUsd = 0;
    let totalCycleTimeMs = 0;
    let totalAgentTimeMs = 0;
    let totalPrReviewTimeMs = 0;
    let cycleTimeCount = 0;
    let agentTimeCount = 0;
    let prReviewCount = 0;
    let failedCount = 0;
    let escalatedCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalPRsMerged = 0;
    let totalCommits = 0;
    const costByModel: Record<string, number> = {};
    let periodStart: string | undefined;
    let periodEnd: string | undefined;

    for (const record of records) {
      totalCostUsd += record.totalCostUsd;
      totalInputTokens += record.totalInputTokens;
      totalOutputTokens += record.totalOutputTokens;

      if (record.cycleTimeMs > 0) {
        totalCycleTimeMs += record.cycleTimeMs;
        cycleTimeCount++;
      }
      if (record.agentTimeMs > 0) {
        totalAgentTimeMs += record.agentTimeMs;
        agentTimeCount++;
      }
      if (record.prReviewTimeMs && record.prReviewTimeMs > 0) {
        totalPrReviewTimeMs += record.prReviewTimeMs;
        prReviewCount++;
      }
      if (record.failureCount > 0) failedCount++;
      if (record.escalated) escalatedCount++;
      if (record.prMergedAt) totalPRsMerged++;
      if (record.commitCount) totalCommits += record.commitCount;

      for (const [model, cost] of Object.entries(record.costByModel)) {
        costByModel[model] = (costByModel[model] || 0) + cost;
      }

      if (!periodStart || record.completedAt < periodStart) periodStart = record.completedAt;
      if (!periodEnd || record.completedAt > periodEnd) periodEnd = record.completedAt;
    }

    const total = records.length;
    const durationMs =
      periodStart && periodEnd
        ? new Date(periodEnd).getTime() - new Date(periodStart).getTime()
        : 0;
    const durationDays = durationMs / (1000 * 60 * 60 * 24);
    const durationHours = durationMs / (1000 * 60 * 60);

    // Model distribution as percentages
    const modelDistribution: Record<string, number> = {};
    if (totalCostUsd > 0) {
      for (const [model, cost] of Object.entries(costByModel)) {
        modelDistribution[model] = (cost / totalCostUsd) * 100;
      }
    }

    return {
      totalFeatures: total,
      totalCostUsd,
      avgCostPerFeature: total > 0 ? totalCostUsd / total : 0,
      avgCycleTimeMs: cycleTimeCount > 0 ? totalCycleTimeMs / cycleTimeCount : 0,
      avgAgentTimeMs: agentTimeCount > 0 ? totalAgentTimeMs / agentTimeCount : 0,
      avgPrReviewTimeMs: prReviewCount > 0 ? totalPrReviewTimeMs / prReviewCount : 0,
      successRate: total > 0 ? ((total - failedCount) / total) * 100 : 0,
      escalationRate: total > 0 ? (escalatedCount / total) * 100 : 0,
      throughputPerDay: durationDays > 0 ? total / durationDays : total,
      costByModel,
      modelDistribution,
      tokenUsage: {
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
      totalPRsMerged,
      prsPerDay: durationDays > 0 ? totalPRsMerged / durationDays : totalPRsMerged,
      prsPerHour: durationHours > 0 ? totalPRsMerged / durationHours : totalPRsMerged,
      totalCommits,
      commitsPerDay: durationDays > 0 ? totalCommits / durationDays : totalCommits,
      commitsPerHour: durationHours > 0 ? totalCommits / durationHours : totalCommits,
      periodStart,
      periodEnd,
    };
  }

  /**
   * Generate time series data for a given metric
   */
  async getTimeSeries(
    projectPath: string,
    metric: TimeSeriesMetric,
    groupBy: TimeGroupBy,
    filters?: LedgerQueryOptions
  ): Promise<TimeSeriesData> {
    const records = await this.getRecords(projectPath, filters);

    // Bucket records by date
    const buckets = new Map<string, MetricsLedgerRecord[]>();
    for (const record of records) {
      const key = this.getDateBucket(record.completedAt, groupBy);
      const bucket = buckets.get(key) || [];
      bucket.push(record);
      buckets.set(key, bucket);
    }

    // Sort bucket keys chronologically
    const sortedKeys = Array.from(buckets.keys()).sort();

    // Build points based on metric type
    const points: TimeSeriesPoint[] = [];
    let total = 0;

    for (const key of sortedKeys) {
      const bucket = buckets.get(key)!;
      let value = 0;

      switch (metric) {
        case 'cost':
          value = bucket.reduce((sum, r) => sum + r.totalCostUsd, 0);
          break;
        case 'throughput':
          value = bucket.length;
          break;
        case 'success_rate': {
          const successes = bucket.filter((r) => r.failureCount === 0).length;
          value = bucket.length > 0 ? (successes / bucket.length) * 100 : 0;
          break;
        }
        case 'cycle_time': {
          const cycleTimes = bucket.filter((r) => r.cycleTimeMs > 0);
          value =
            cycleTimes.length > 0
              ? cycleTimes.reduce((sum, r) => sum + r.cycleTimeMs, 0) / cycleTimes.length
              : 0;
          break;
        }
        case 'pr_throughput':
          value = bucket.filter((r) => r.prMergedAt).length;
          break;
        case 'commit_throughput':
          value = bucket.reduce((sum, r) => sum + (r.commitCount || 0), 0);
          break;
      }

      total += value;
      points.push({ date: key, value });
    }

    return { metric, groupBy, points, total };
  }

  /**
   * Get model cost distribution (for pie chart)
   */
  async getModelDistribution(
    projectPath: string,
    filters?: LedgerQueryOptions
  ): Promise<Record<string, number>> {
    const records = await this.getRecords(projectPath, filters);
    const costByModel: Record<string, number> = {};

    for (const record of records) {
      for (const [model, cost] of Object.entries(record.costByModel)) {
        costByModel[model] = (costByModel[model] || 0) + cost;
      }
    }

    return costByModel;
  }

  /**
   * Get cycle time distribution (histogram buckets)
   */
  async getCycleTimeDistribution(
    projectPath: string,
    filters?: LedgerQueryOptions
  ): Promise<CycleTimeBucket[]> {
    const records = await this.getRecords(projectPath, filters);
    const HOUR = 60 * 60 * 1000;

    const buckets: CycleTimeBucket[] = [
      { label: '0-1h', minMs: 0, maxMs: HOUR, count: 0 },
      { label: '1-2h', minMs: HOUR, maxMs: 2 * HOUR, count: 0 },
      { label: '2-4h', minMs: 2 * HOUR, maxMs: 4 * HOUR, count: 0 },
      { label: '4-8h', minMs: 4 * HOUR, maxMs: 8 * HOUR, count: 0 },
      { label: '8h+', minMs: 8 * HOUR, maxMs: Infinity, count: 0 },
    ];

    for (const record of records) {
      if (record.cycleTimeMs <= 0) continue;
      for (const bucket of buckets) {
        if (record.cycleTimeMs >= bucket.minMs && record.cycleTimeMs < bucket.maxMs) {
          bucket.count++;
          break;
        }
      }
    }

    return buckets;
  }

  /**
   * Get success rate trend over time
   */
  async getSuccessRateTrend(
    projectPath: string,
    groupBy: TimeGroupBy,
    filters?: LedgerQueryOptions
  ): Promise<TimeSeriesData> {
    return this.getTimeSeries(projectPath, 'success_rate', groupBy, filters);
  }

  /**
   * Backfill ledger from existing done/verified features.
   * Idempotent: skips features that already have a ledger record.
   */
  async backfillFromFeatures(projectPath: string): Promise<number> {
    const features = await this.featureLoader.getAll(projectPath);
    const completedFeatures = features.filter(
      (f) => f.status === 'done' || f.status === 'verified'
    );

    let backfillCount = 0;
    for (const feature of completedFeatures) {
      const exists = await this.hasRecord(projectPath, feature.id);
      if (!exists) {
        await this.recordFeatureCompletion(projectPath, feature);
        backfillCount++;
      }
    }

    if (backfillCount > 0) {
      logger.info(`Backfilled ${backfillCount} ledger records for ${projectPath}`);
      this.events.emit('ledger:backfill-completed', {
        projectPath,
        recordCount: backfillCount,
      });
    }

    return backfillCount;
  }

  /**
   * Rewrite all ledger records, enriching PR/commit data from GitHub.
   * Fetches all merged+open PRs in bulk, then rewrites the JSONL file.
   */
  async enrichAllRecords(projectPath: string): Promise<{ updated: number; total: number }> {
    const records = await this.getRecords(projectPath, {});
    if (records.length === 0) return { updated: 0, total: 0 };

    // Bulk-fetch all merged PRs from GitHub (up to 500)
    const prMap = new Map<
      string,
      { number: number; url: string; createdAt: string; mergedAt?: string; commitCount: number }
    >();

    for (const state of ['merged', 'open'] as const) {
      try {
        // Fetch PR metadata (without commits — causes GraphQL explosion on large repos)
        const { stdout } = await execFileAsync(
          'gh',
          [
            'pr',
            'list',
            '--state',
            state,
            '--limit',
            '500',
            '--json',
            'number,headRefName,url,createdAt,mergedAt',
          ],
          { cwd: projectPath, timeout: 30000 }
        );
        const prs = JSON.parse(stdout.trim() || '[]');
        for (const pr of prs) {
          if (pr.headRefName && !prMap.has(pr.headRefName)) {
            prMap.set(pr.headRefName, {
              number: pr.number,
              url: pr.url,
              createdAt: pr.createdAt,
              mergedAt: pr.mergedAt || undefined,
              commitCount: 0,
            });
          }
        }
      } catch (err) {
        logger.warn(`Failed to fetch ${state} PRs from GitHub: ${err}`);
      }
    }

    logger.info(`Fetched ${prMap.size} PRs from GitHub for ledger enrichment`);

    // Fetch commit counts individually for records that need them
    const branchesNeedingCounts = new Set<string>();
    for (const record of records) {
      if (record.branchName && prMap.has(record.branchName) && !record.commitCount) {
        branchesNeedingCounts.add(record.branchName);
      }
    }

    for (const branch of branchesNeedingCounts) {
      const prData = prMap.get(branch);
      if (!prData) continue;
      try {
        const { stdout } = await execFileAsync(
          'gh',
          ['pr', 'view', String(prData.number), '--json', 'commits', '--jq', '.commits | length'],
          { cwd: projectPath, timeout: 10000 }
        );
        prData.commitCount = parseInt(stdout.trim(), 10) || 0;
      } catch {
        // Commit count stays 0 on failure
      }
    }

    // Rewrite records with enriched data
    let updated = 0;
    const enrichedRecords: MetricsLedgerRecord[] = [];

    for (const record of records) {
      let changed = false;
      const enriched = { ...record };

      if (record.branchName) {
        const ghData = prMap.get(record.branchName);
        if (ghData) {
          if (!enriched.prNumber) {
            enriched.prNumber = ghData.number;
            changed = true;
          }
          if (!enriched.prUrl) {
            enriched.prUrl = ghData.url;
            changed = true;
          }
          if (!enriched.prCreatedAt) {
            enriched.prCreatedAt = ghData.createdAt;
            changed = true;
          }
          if (!enriched.prMergedAt && ghData.mergedAt) {
            enriched.prMergedAt = ghData.mergedAt;
            changed = true;
          }
          if (!enriched.commitCount && ghData.commitCount > 0) {
            enriched.commitCount = ghData.commitCount;
            changed = true;
          }
          // Compute PR review time if now available
          if (!enriched.prReviewTimeMs && enriched.prCreatedAt && enriched.prMergedAt) {
            enriched.prReviewTimeMs =
              new Date(enriched.prMergedAt).getTime() - new Date(enriched.prCreatedAt).getTime();
            changed = true;
          }
        }
      }

      if (changed) updated++;
      enrichedRecords.push(enriched);
    }

    // Atomically rewrite the ledger file
    const ledgerPath = getLedgerPath(projectPath);
    const tmpPath = ledgerPath + '.tmp';
    const lines = enrichedRecords.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await fs.promises.writeFile(tmpPath, lines, 'utf-8');
    await fs.promises.rename(tmpPath, ledgerPath);

    logger.info(`Enriched ${updated}/${records.length} ledger records with GitHub PR data`);

    this.events.emit('ledger:enrichment-completed', {
      projectPath,
      updated,
      total: records.length,
    });

    return { updated, total: records.length };
  }

  /**
   * Convert a date to a bucket key based on groupBy
   */
  private getDateBucket(dateStr: string, groupBy: TimeGroupBy): string {
    const date = new Date(dateStr);
    switch (groupBy) {
      case 'day':
        return date.toISOString().slice(0, 10); // YYYY-MM-DD
      case 'week': {
        // Get Monday of the week
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date);
        monday.setDate(diff);
        return monday.toISOString().slice(0, 10);
      }
      case 'month':
        return date.toISOString().slice(0, 7); // YYYY-MM
      default:
        return date.toISOString().slice(0, 10);
    }
  }
}
