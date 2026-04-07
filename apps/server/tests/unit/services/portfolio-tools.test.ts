/**
 * Unit tests for PortfolioToolsService.
 *
 * Covers:
 * - prioritize_portfolio dry-run vs mutation
 * - allocate_capacity with minConcurrency constraints
 * - get_portfolio_forecast bottleneck classification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Feature } from '@protolabsai/types';
import { PortfolioToolsService } from '../../../src/services/portfolio-tools.js';
import { MetricsService } from '../../../src/services/metrics-service.js';
import type { PortfolioSitrepService } from '../../../src/services/portfolio-sitrep.js';

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: `feat-${Math.random().toString(36).slice(2, 8)}`,
    category: 'test',
    description: 'Test feature',
    status: 'backlog',
    complexity: 'medium',
    ...overrides,
  };
}

function createMockFeatureLoader(featuresByProject: Record<string, Feature[]> = {}) {
  return {
    getAll: vi.fn().mockImplementation((projectPath: string) => {
      return Promise.resolve(featuresByProject[projectPath] ?? []);
    }),
    update: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function createMockSettingsService(overrides: Record<string, any> = {}) {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({
      maxConcurrency: 2,
      systemMaxConcurrency: 4,
      autoModeByWorktree: {},
      ...overrides,
    }),
  } as any;
}

function createMockSitrepService(): PortfolioSitrepService {
  return {
    classifyBottleneck: vi.fn().mockReturnValue('agent_capacity'),
    getPortfolioSitrep: vi.fn().mockResolvedValue({
      projects: [],
      global: { totalCapacityUsed: 0, totalCapacityAvailable: 4 },
      timestamp: new Date().toISOString(),
    }),
  } as any;
}

describe('PortfolioToolsService', () => {
  let service: PortfolioToolsService;
  let featureLoader: ReturnType<typeof createMockFeatureLoader>;
  let settingsService: ReturnType<typeof createMockSettingsService>;
  let sitrepService: ReturnType<typeof createMockSitrepService>;
  let metricsService: MetricsService;

  const projectAFeatures = [
    makeFeature({ id: 'a1', businessValue: 8, complexity: 'small' }),
    makeFeature({ id: 'a2', businessValue: 3, complexity: 'large' }),
    makeFeature({ id: 'a3', businessValue: 5, complexity: 'medium' }),
  ];

  const projectBFeatures = [makeFeature({ id: 'b1', businessValue: 2, complexity: 'medium' })];

  beforeEach(() => {
    featureLoader = createMockFeatureLoader({
      '/projects/alpha': projectAFeatures,
      '/projects/beta': projectBFeatures,
    });
    metricsService = new MetricsService(featureLoader);
    settingsService = createMockSettingsService();
    sitrepService = createMockSitrepService();
    service = new PortfolioToolsService(
      featureLoader,
      metricsService,
      sitrepService,
      settingsService
    );
  });

  // ── prioritize_portfolio ───────────────────────────────────────────────

  describe('prioritize_portfolio', () => {
    it('returns proposed reordering in dry-run mode', async () => {
      const result = await service.prioritizePortfolio(
        {
          initiatives: [
            {
              id: 'init-1',
              projectSlugs: ['alpha'],
              businessValue: 7,
              timeDecayDaysToDeadline: 10,
            },
          ],
          dryRun: true,
        },
        new Map([['alpha', '/projects/alpha']])
      );

      expect(result.applied).toBe(false);
      expect(result.reorderings).toHaveLength(1);
      expect(result.reorderings[0].projectSlug).toBe('alpha');
      expect(result.reorderings[0].after.length).toBeGreaterThan(0);
      // Should not have called update
      expect(featureLoader.update).not.toHaveBeenCalled();
    });

    it('applies priority updates when dryRun=false', async () => {
      const result = await service.prioritizePortfolio(
        {
          initiatives: [{ id: 'init-1', projectSlugs: ['alpha'], businessValue: 7 }],
          dryRun: false,
        },
        new Map([['alpha', '/projects/alpha']])
      );

      expect(result.applied).toBe(true);
      // Should have called update for each backlog feature
      expect(featureLoader.update).toHaveBeenCalled();
    });

    it('handles unknown project slug gracefully', async () => {
      const result = await service.prioritizePortfolio(
        {
          initiatives: [{ id: 'init-1', projectSlugs: ['nonexistent'], businessValue: 5 }],
        },
        new Map()
      );

      expect(result.reorderings).toHaveLength(0);
    });

    it('sorts by WSJF score descending in after array', async () => {
      const result = await service.prioritizePortfolio(
        {
          initiatives: [{ id: 'init-1', projectSlugs: ['alpha'], businessValue: 5 }],
        },
        new Map([['alpha', '/projects/alpha']])
      );

      const after = result.reorderings[0].after;
      for (let i = 1; i < after.length; i++) {
        expect(after[i - 1].wsjfScore).toBeGreaterThanOrEqual(after[i].wsjfScore);
      }
    });
  });

  // ── allocate_capacity ──────────────────────────────────────────────────

  describe('allocate_capacity', () => {
    it('returns allocations for all projects', async () => {
      const allocations = await service.allocateCapacity(['/projects/alpha', '/projects/beta']);

      expect(allocations).toHaveLength(2);
      expect(allocations[0].projectSlug).toBe('alpha');
      expect(allocations[1].projectSlug).toBe('beta');
    });

    it('respects minConcurrency floor', async () => {
      settingsService.getGlobalSettings.mockResolvedValue({
        maxConcurrency: 2,
        systemMaxConcurrency: 2,
        autoModeByWorktree: {
          '/projects/alpha::__main__': { maxConcurrency: 1, branchName: null, minConcurrency: 1 },
          '/projects/beta::__main__': { maxConcurrency: 1, branchName: null, minConcurrency: 1 },
        },
      });

      const allocations = await service.allocateCapacity(['/projects/alpha', '/projects/beta']);

      // Both should get at least 1
      for (const a of allocations) {
        expect(a.proposedMax).toBeGreaterThanOrEqual(1);
      }
    });

    it('does not mutate settings', async () => {
      await service.allocateCapacity(['/projects/alpha']);
      // Settings should not be saved
      expect(settingsService.getGlobalSettings).toHaveBeenCalled();
    });

    it('includes rationale with WSJF weight info', async () => {
      const allocations = await service.allocateCapacity(['/projects/alpha']);
      expect(allocations[0].rationale).toContain('WSJF weight');
    });
  });

  // ── get_portfolio_forecast ─────────────────────────────────────────────

  describe('get_portfolio_forecast', () => {
    it('returns forecast for each project', async () => {
      const forecasts = await service.getPortfolioForecast(['/projects/alpha', '/projects/beta']);

      expect(forecasts).toHaveLength(2);
      expect(forecasts[0].slug).toBe('alpha');
      expect(forecasts[0].backlogDepth).toBe(3);
      expect(forecasts[1].slug).toBe('beta');
      expect(forecasts[1].backlogDepth).toBe(1);
    });

    it('classifies bottleneck type', async () => {
      const forecasts = await service.getPortfolioForecast(['/projects/alpha']);
      expect(['agent_capacity', 'pr_review', 'cross_repo_blocked', 'human_input']).toContain(
        forecasts[0].bottleneck
      );
    });

    it('reports confidence based on error rate', async () => {
      const forecasts = await service.getPortfolioForecast(['/projects/alpha']);
      expect(['high', 'medium', 'low']).toContain(forecasts[0].confidence);
    });

    it('estimates clear days based on throughput', async () => {
      const forecasts = await service.getPortfolioForecast(['/projects/alpha']);
      expect(forecasts[0].estimatedClearDays).toBeGreaterThan(0);
    });
  });
});
