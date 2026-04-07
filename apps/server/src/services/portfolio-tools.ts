/**
 * PortfolioToolsService - MCP tools for cross-project portfolio management
 *
 * Provides three MCP tools:
 * 1. prioritize_portfolio - Recompute WSJF and propose feature reordering
 * 2. allocate_capacity - Compute priority-weighted capacity allocation
 * 3. get_portfolio_forecast - Per-project backlog forecast with bottleneck classification
 */

import type { Feature } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import type { FeatureLoader } from './feature-loader.js';
import type { MetricsService } from './metrics-service.js';
import type { PortfolioSitrepService, BottleneckType } from './portfolio-sitrep.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('PortfolioTools');

// ── Tool input/output types ─────────────────────────────────────────────────

export interface InitiativeInput {
  id: string;
  projectSlugs: string[];
  businessValue: number;
  timeDecayDaysToDeadline?: number;
}

export interface PrioritizePortfolioInput {
  initiatives: InitiativeInput[];
  dryRun?: boolean;
}

export interface ProjectReordering {
  projectSlug: string;
  before: Array<{ id: string; title?: string; wsjfScore: number }>;
  after: Array<{ id: string; title?: string; wsjfScore: number }>;
}

export interface PrioritizePortfolioResult {
  reorderings: ProjectReordering[];
  applied: boolean;
}

export interface CapacityAllocation {
  projectSlug: string;
  projectPath: string;
  currentMax: number;
  proposedMax: number;
  rationale: string;
}

export interface PortfolioForecast {
  slug: string;
  backlogDepth: number;
  avgThroughputPerDay: number;
  estimatedClearDays: number;
  bottleneck: BottleneckType;
  confidence: 'high' | 'medium' | 'low';
}

// ── Service ─────────────────────────────────────────────────────────────────

export class PortfolioToolsService {
  private featureLoader: FeatureLoader;
  private metricsService: MetricsService;
  private sitrepService: PortfolioSitrepService;
  private settingsService: SettingsService;

  constructor(
    featureLoader: FeatureLoader,
    metricsService: MetricsService,
    sitrepService: PortfolioSitrepService,
    settingsService: SettingsService
  ) {
    this.featureLoader = featureLoader;
    this.metricsService = metricsService;
    this.sitrepService = sitrepService;
    this.settingsService = settingsService;
  }

  /**
   * Recompute WSJF for features affected by initiatives and propose reordering.
   * With dryRun=false, applies priority field updates.
   */
  async prioritizePortfolio(
    input: PrioritizePortfolioInput,
    projectPathsBySlug: Map<string, string>
  ): Promise<PrioritizePortfolioResult> {
    const dryRun = input.dryRun !== false; // Default true
    const reorderings: ProjectReordering[] = [];
    const now = new Date();

    for (const initiative of input.initiatives) {
      for (const slug of initiative.projectSlugs) {
        const projectPath = projectPathsBySlug.get(slug);
        if (!projectPath) {
          logger.warn(`[prioritize_portfolio] Unknown project slug: ${slug}`);
          continue;
        }

        const features = await this.featureLoader.getAll(projectPath);
        const backlogFeatures = features.filter((f) => f.status === 'backlog');

        // Propagate epic business values
        this.metricsService.propagateEpicBusinessValue(features);

        // Apply initiative-level businessValue override
        for (const f of backlogFeatures) {
          if (f.businessValue == null) {
            f.businessValue = initiative.businessValue;
          }
          if (initiative.timeDecayDaysToDeadline != null && !f.timeDecayDeadline) {
            const deadline = new Date(now);
            deadline.setDate(deadline.getDate() + initiative.timeDecayDaysToDeadline);
            f.timeDecayDeadline = deadline.toISOString().split('T')[0];
          }
        }

        const durationByComplexity =
          await this.metricsService.getAvgDurationByComplexity(projectPath);

        // Compute before ordering
        const before = backlogFeatures.map((f) => ({
          id: f.id,
          title: f.title,
          wsjfScore: this.metricsService.computeWsjfScore(f, durationByComplexity, now),
        }));

        // Compute WSJF scores and sort
        for (const f of backlogFeatures) {
          f.wsjfScore = this.metricsService.computeWsjfScore(f, durationByComplexity, now);
        }

        const sorted = [...backlogFeatures].sort((a, b) => (b.wsjfScore ?? 0) - (a.wsjfScore ?? 0));

        const after = sorted.map((f) => ({
          id: f.id,
          title: f.title,
          wsjfScore: f.wsjfScore ?? 0,
        }));

        reorderings.push({ projectSlug: slug, before, after });

        // Apply priority updates if not dry run
        if (!dryRun) {
          for (let i = 0; i < sorted.length; i++) {
            const feature = sorted[i];
            // Map WSJF rank to priority: top 25% → 1 (urgent), next 25% → 2 (high), etc.
            const quartile = Math.floor((i / sorted.length) * 4);
            const priority = Math.min(quartile + 1, 4) as 1 | 2 | 3 | 4;
            await this.featureLoader.update(projectPath, feature.id, {
              priority,
              wsjfScore: feature.wsjfScore,
              businessValue: feature.businessValue,
              timeDecayDeadline: feature.timeDecayDeadline,
            });
          }
          logger.info(
            `[prioritize_portfolio] Applied priority updates for ${sorted.length} features in ${slug}`
          );
        }
      }
    }

    return { reorderings, applied: !dryRun };
  }

  /**
   * Compute priority-weighted capacity allocation across projects.
   * Does NOT mutate settings — returns a proposal.
   */
  async allocateCapacity(projectPaths: string[]): Promise<CapacityAllocation[]> {
    const settings = await this.settingsService.getGlobalSettings();
    const totalCapacity = settings.systemMaxConcurrency ?? settings.maxConcurrency ?? 2;
    const now = new Date();
    const allocations: CapacityAllocation[] = [];

    // Compute aggregate WSJF weight per project
    const projectWeights: Array<{
      path: string;
      slug: string;
      weight: number;
      currentMax: number;
      minConcurrency: number;
    }> = [];

    for (const projectPath of projectPaths) {
      const features = await this.featureLoader.getAll(projectPath);
      this.metricsService.propagateEpicBusinessValue(features);
      const durationByComplexity =
        await this.metricsService.getAvgDurationByComplexity(projectPath);

      const backlog = features.filter((f) => f.status === 'backlog');
      let totalWeight = 0;
      for (const f of backlog) {
        totalWeight += this.metricsService.computeWsjfScore(f, durationByComplexity, now);
      }

      const slug = projectPath.split('/').pop() ?? projectPath;
      const loopKey = `${projectPath}::__main__`;
      const worktreeConfig = settings.autoModeByWorktree?.[loopKey];
      const currentMax = worktreeConfig?.maxConcurrency ?? 1;
      const minConcurrency = worktreeConfig?.minConcurrency ?? 1;

      projectWeights.push({
        path: projectPath,
        slug,
        weight: totalWeight,
        currentMax,
        minConcurrency,
      });
    }

    // Weighted allocation with minConcurrency floor
    const totalWeight = projectWeights.reduce((s, p) => s + p.weight, 0);
    let remainingCapacity = totalCapacity;

    // First pass: assign minConcurrency floor
    for (const pw of projectWeights) {
      pw.currentMax = Math.min(pw.minConcurrency, remainingCapacity);
      remainingCapacity -= pw.minConcurrency;
    }
    remainingCapacity = Math.max(0, remainingCapacity);

    // Second pass: distribute remaining capacity proportionally by WSJF weight
    if (totalWeight > 0 && remainingCapacity > 0) {
      for (const pw of projectWeights) {
        const extraSlots = Math.floor((pw.weight / totalWeight) * remainingCapacity);
        pw.currentMax = pw.minConcurrency + extraSlots;
      }
    }

    // Build result
    for (const pw of projectWeights) {
      const loopKey = `${pw.path}::__main__`;
      const worktreeConfig = settings.autoModeByWorktree?.[loopKey];
      const originalMax = worktreeConfig?.maxConcurrency ?? 1;

      allocations.push({
        projectSlug: pw.slug,
        projectPath: pw.path,
        currentMax: originalMax,
        proposedMax: Math.max(pw.minConcurrency, pw.currentMax),
        rationale:
          pw.weight > 0
            ? `WSJF weight ${pw.weight.toFixed(1)} of total ${totalWeight.toFixed(1)} (${((pw.weight / totalWeight) * 100).toFixed(0)}%)`
            : 'No scored backlog features',
      });
    }

    return allocations;
  }

  /**
   * Per-project backlog forecast with bottleneck classification.
   */
  async getPortfolioForecast(projectPaths: string[]): Promise<PortfolioForecast[]> {
    const forecasts: PortfolioForecast[] = [];

    for (const projectPath of projectPaths) {
      const features = await this.featureLoader.getAll(projectPath);
      const slug = projectPath.split('/').pop() ?? projectPath;

      const backlog = features.filter((f) => f.status === 'backlog');
      const metrics = await this.metricsService.getProjectMetrics(projectPath);
      const bottleneck = this.sitrepService.classifyBottleneck(features);

      const throughput = metrics.throughputPerDay;
      const estimatedClearDays = throughput > 0 ? backlog.length / throughput : backlog.length * 2; // Fallback estimate

      // Confidence based on error rate
      const errorRate = metrics.failureRate / 100;
      let confidence: 'high' | 'medium' | 'low';
      if (errorRate < 0.1) confidence = 'high';
      else if (errorRate < 0.25) confidence = 'medium';
      else confidence = 'low';

      forecasts.push({
        slug,
        backlogDepth: backlog.length,
        avgThroughputPerDay: Math.round(throughput * 100) / 100,
        estimatedClearDays: Math.round(estimatedClearDays * 10) / 10,
        bottleneck,
        confidence,
      });
    }

    return forecasts;
  }
}
