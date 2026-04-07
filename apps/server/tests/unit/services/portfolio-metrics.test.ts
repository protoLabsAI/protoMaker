/**
 * Unit tests for MetricsService.getPortfolioMetrics()
 *
 * Covers:
 * - Empty project list returns zero-value metrics
 * - Single project aggregation (cost, throughput, flow efficiency)
 * - Multi-project aggregation (totals sum correctly)
 * - Flow efficiency calculation (completedInWindow / totalFeatures)
 * - highestCostProject / lowestThroughputProject identification
 * - windowDays parameter scoping (features outside window not counted)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { MetricsService } from '@/services/metrics-service.js';
import type { Feature } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Feature',
    status: 'backlog',
    description: '',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Feature;
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MetricsService.getPortfolioMetrics()', () => {
  let service: MetricsService;
  const projectPaths = ['/projects/alpha', '/projects/beta'];

  const makeLoader = (featuresByPath: Record<string, Feature[]>) => ({
    getAll: vi.fn().mockImplementation((path: string) => {
      return Promise.resolve(featuresByPath[path] ?? []);
    }),
  });

  it('returns zero metrics for empty projectPaths[]', async () => {
    const loader = makeLoader({});
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics([]);

    expect(result.totalCostUsd).toBe(0);
    expect(result.totalFeaturesCompleted).toBe(0);
    expect(result.portfolioThroughputPerDay).toBe(0);
    expect(result.portfolioFlowEfficiency).toBe(0);
    expect(result.errorBudgetsByProject).toEqual({});
  });

  it('returns single project metrics when one path provided', async () => {
    const features = [
      makeFeature({
        status: 'done',
        costUsd: 2.5,
        createdAt: daysAgo(10),
        completedAt: daysAgo(1),
      }),
      makeFeature({ status: 'backlog' }),
    ];

    const loader = makeLoader({ '/projects/alpha': features });
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics(['/projects/alpha']);

    expect(result.totalCostUsd).toBeCloseTo(2.5, 1);
    expect(result.totalFeaturesCompleted).toBe(1);
    expect(result.highestCostProject).toBe('alpha');
    expect(result.portfolioFlowEfficiency).toBeGreaterThan(0); // 1 done / 2 total = 0.5
    expect(result.portfolioFlowEfficiency).toBeLessThanOrEqual(1);
    expect(result.errorBudgetsByProject['alpha']).toBeDefined();
  });

  it('sums cost across multiple projects', async () => {
    const alpha = [
      makeFeature({
        status: 'done',
        costUsd: 1.0,
        createdAt: daysAgo(7),
        completedAt: daysAgo(1),
      }),
    ];
    const beta = [
      makeFeature({
        status: 'done',
        costUsd: 3.0,
        createdAt: daysAgo(14),
        completedAt: daysAgo(2),
      }),
    ];

    const loader = makeLoader({ '/projects/alpha': alpha, '/projects/beta': beta });
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics(projectPaths);

    expect(result.totalCostUsd).toBeCloseTo(4.0, 1);
    expect(result.totalFeaturesCompleted).toBe(2);
    expect(result.errorBudgetsByProject['alpha']).toBeDefined();
    expect(result.errorBudgetsByProject['beta']).toBeDefined();
  });

  it('calculates flow efficiency as completedInWindow / totalFeatures across projects', async () => {
    const alpha = [
      makeFeature({ status: 'done', createdAt: daysAgo(5), completedAt: daysAgo(1) }),
      makeFeature({ status: 'done', createdAt: daysAgo(5), completedAt: daysAgo(1) }),
      makeFeature({ status: 'backlog' }),
      makeFeature({ status: 'backlog' }),
    ];
    // 2 completed (within 7-day window) / 4 total = 0.5

    const loader = makeLoader({ '/projects/alpha': alpha });
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics(['/projects/alpha']);

    expect(result.portfolioFlowEfficiency).toBeCloseTo(0.5, 1);
  });

  it('identifies highestCostProject correctly', async () => {
    const alpha = [
      makeFeature({
        status: 'done',
        costUsd: 10.0,
        createdAt: daysAgo(3),
        completedAt: daysAgo(1),
      }),
    ];
    const beta = [
      makeFeature({ status: 'done', costUsd: 1.0, createdAt: daysAgo(3), completedAt: daysAgo(1) }),
    ];

    const loader = makeLoader({ '/projects/alpha': alpha, '/projects/beta': beta });
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics(projectPaths);

    expect(result.highestCostProject).toBe('alpha');
  });

  it('identifies lowestThroughputProject correctly', async () => {
    const alpha = [
      makeFeature({ status: 'done', costUsd: 1.0, createdAt: daysAgo(3), completedAt: daysAgo(1) }),
      makeFeature({ status: 'done', costUsd: 1.0, createdAt: daysAgo(3), completedAt: daysAgo(1) }),
    ];
    const beta: Feature[] = []; // no completed features → lowest throughput

    const loader = makeLoader({ '/projects/alpha': alpha, '/projects/beta': beta });
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics(projectPaths);

    expect(result.lowestThroughputProject).toBe('beta');
  });

  it('only counts features completed within the windowDays', async () => {
    const features = [
      // Within window (last 7 days)
      makeFeature({ status: 'done', costUsd: 1.0, createdAt: daysAgo(5), completedAt: daysAgo(1) }),
      // Outside window (completed 10 days ago)
      makeFeature({
        status: 'done',
        costUsd: 50.0,
        createdAt: daysAgo(20),
        completedAt: daysAgo(10),
      }),
    ];

    const loader = makeLoader({ '/projects/alpha': features });
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics(['/projects/alpha'], 7);

    // Only 1 feature within window; old feature excluded from cost and count
    expect(result.totalFeaturesCompleted).toBe(1);
    expect(result.totalCostUsd).toBeCloseTo(1.0, 1);
  });
});
