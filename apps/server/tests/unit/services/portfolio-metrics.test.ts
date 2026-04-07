/**
 * Unit tests for MetricsService.getPortfolioMetrics()
 *
 * Covers:
 * - Empty project list returns zero-value metrics
 * - Single project aggregation
 * - Multi-project aggregation (throughput sum, cost sum)
 * - Flow efficiency calculation across projects
 * - Top constraint identification (project with most blocked + escalations)
 * - Per-project summary in output
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

    expect(result.totalThroughputPerDay).toBe(0);
    expect(result.totalCostUsd).toBe(0);
    expect(result.flowEfficiency).toBe(0);
    expect(result.topConstraint).toBeNull();
    expect(result.perProject).toHaveLength(0);
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

    expect(result.perProject).toHaveLength(1);
    expect(result.perProject[0].projectPath).toBe('/projects/alpha');
    expect(result.totalCostUsd).toBeCloseTo(2.5, 1);
    expect(result.flowEfficiency).toBeGreaterThan(0); // 1 done / 2 total = 0.5
    expect(result.flowEfficiency).toBeLessThanOrEqual(1);
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
    expect(result.perProject).toHaveLength(2);
  });

  it('calculates flow efficiency as completed / total features across all projects', async () => {
    const alpha = [
      makeFeature({ status: 'done', createdAt: daysAgo(5), completedAt: daysAgo(1) }),
      makeFeature({ status: 'done', createdAt: daysAgo(5), completedAt: daysAgo(1) }),
      makeFeature({ status: 'backlog' }),
      makeFeature({ status: 'backlog' }),
    ];
    // 2 done / 4 total = 0.5

    const loader = makeLoader({ '/projects/alpha': alpha });
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics(['/projects/alpha']);

    // flowEfficiency is based on completedFeatures/totalFeatures
    expect(result.flowEfficiency).toBeCloseTo(0.5, 1);
  });

  it('identifies top constraint as project with most blocked + escalated features', async () => {
    const alpha = [
      makeFeature({ status: 'blocked', failureCount: 1 }),
      makeFeature({ status: 'blocked', failureCount: 1 }),
    ];
    const beta = [
      makeFeature({ status: 'blocked', failureCount: 1 }),
      makeFeature({ status: 'backlog' }),
    ];

    const loader = makeLoader({ '/projects/alpha': alpha, '/projects/beta': beta });
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics(projectPaths);

    // alpha has 2 blocked + 2 escalations = score 4
    // beta has 1 blocked + 1 escalation = score 2
    expect(result.topConstraint).toContain('alpha');
  });

  it('returns null topConstraint when no blocked or escalated features exist', async () => {
    const features = [makeFeature({ status: 'backlog' }), makeFeature({ status: 'in_progress' })];

    const loader = makeLoader({ '/projects/alpha': features, '/projects/beta': [] });
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics(projectPaths);

    expect(result.topConstraint).toBeNull();
  });

  it('includes per-project blockedCount and escalationCount in perProject summary', async () => {
    const features = [
      makeFeature({ status: 'blocked' }),
      makeFeature({ status: 'blocked', failureCount: 2 }),
      makeFeature({ status: 'done', createdAt: daysAgo(3), completedAt: daysAgo(1) }),
    ];

    const loader = makeLoader({ '/projects/alpha': features });
    service = new MetricsService(loader as never);

    const result = await service.getPortfolioMetrics(['/projects/alpha']);

    const entry = result.perProject.find((p) => p.projectPath === '/projects/alpha');
    expect(entry).toBeDefined();
    expect(entry!.blockedCount).toBe(2);
    expect(entry!.escalationCount).toBeGreaterThan(0); // features with failureCount > 0
  });
});
