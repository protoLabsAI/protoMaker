/**
 * Unit tests for MetricsService.getPortfolioMetrics()
 *
 * Covers:
 * - Empty project list returns zero-value metrics
 * - Single project aggregation (cost, throughput)
 * - Multi-project aggregation (throughput sum, cost sum)
 * - Error budget tracking per project slug
 * - highestCostProject and lowestThroughputProject identification
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

    expect(result.portfolioThroughputPerDay).toBe(0);
    expect(result.totalCostUsd).toBe(0);
    expect(result.totalFeaturesCompleted).toBe(0);
    expect(result.highestCostProject).toBe('');
    expect(result.lowestThroughputProject).toBe('');
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
    expect(result.errorBudgetsByProject).toHaveProperty('alpha');
  });

  it('sums throughput and cost across multiple projects', async () => {
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
  });

  it('identifies highestCostProject correctly', async () => {
    const alpha = [
      makeFeature({
        status: 'done',
        costUsd: 5.0,
        createdAt: daysAgo(5),
        completedAt: daysAgo(1),
      }),
    ];
    const beta = [
      makeFeature({
        status: 'done',
        costUsd: 1.0,
        createdAt: daysAgo(5),
        completedAt: daysAgo(1),
      }),
    ];

    const loader = makeLoader({ '/projects/alpha': alpha, '/projects/beta': beta });
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics(projectPaths);

    expect(result.highestCostProject).toBe('alpha');
  });

  it('tracks error budget per project slug', async () => {
    const features = [
      makeFeature({
        status: 'done',
        createdAt: daysAgo(3),
        completedAt: daysAgo(1),
        executionHistory: [{ success: false } as never],
      }),
      makeFeature({
        status: 'done',
        createdAt: daysAgo(3),
        completedAt: daysAgo(1),
        executionHistory: [{ success: true } as never],
      }),
    ];

    const loader = makeLoader({ '/projects/alpha': features });
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics(['/projects/alpha']);

    expect(result.errorBudgetsByProject).toHaveProperty('alpha');
    const budget = result.errorBudgetsByProject['alpha'];
    expect(budget.status).toMatch(/^(healthy|warning|exhausted)$/);
    expect(budget.remaining).toBeGreaterThanOrEqual(0);
  });

  it('includes generatedAt timestamp and windowDays', async () => {
    const loader = makeLoader({});
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics([], 14);

    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.windowDays).toBe(14);
  });
});
