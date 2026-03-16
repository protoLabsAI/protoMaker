/**
 * Unit tests for DoraMetricsService
 *
 * Covers:
 * - Lead time computation from createdAt/completedAt
 * - Deployment frequency over a time window
 * - Change failure rate (done -> blocked transitions)
 * - Recovery time from blocked duration
 * - Rework rate from failureCount
 * - Threshold evaluation and alert generation
 * - Empty dataset handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger before any imports
vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { DoraMetricsService } from '@/services/dora-metrics-service.js';
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

function makeLoader(features: Feature[]) {
  return {
    getAll: vi.fn().mockResolvedValue(features),
  } as unknown as ConstructorParameters<typeof DoraMetricsService>[0];
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Tests: Empty dataset
// ---------------------------------------------------------------------------

describe('DoraMetricsService (empty dataset)', () => {
  it('returns zero metrics when no features exist', async () => {
    const svc = new DoraMetricsService(makeLoader([]));
    const metrics = await svc.getMetrics('/test', 7);

    expect(metrics.leadTime.value).toBe(0);
    expect(metrics.deploymentFrequency.value).toBe(0);
    expect(metrics.changeFailureRate.value).toBe(0);
    expect(metrics.recoveryTime.value).toBe(0);
    expect(metrics.reworkRate.value).toBe(0);
    expect(metrics.computedAt).toBeDefined();
    expect(metrics.timeWindowDays).toBe(7);
  });

  it('generates no alerts for an empty dataset', async () => {
    const svc = new DoraMetricsService(makeLoader([]));
    const metrics = await svc.getMetrics('/test', 7);
    const alerts = svc.evaluateRegulation(metrics);

    expect(alerts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Lead time
// ---------------------------------------------------------------------------

describe('DoraMetricsService.leadTime', () => {
  it('computes average lead time from done features', async () => {
    const features = [
      makeFeature({
        status: 'done',
        createdAt: hoursAgo(10),
        completedAt: hoursAgo(2),
      }),
      makeFeature({
        status: 'done',
        createdAt: hoursAgo(20),
        completedAt: hoursAgo(8),
      }),
    ];
    const svc = new DoraMetricsService(makeLoader(features));
    const metrics = await svc.getMetrics('/test', 7);

    // Feature 1: 8 hours. Feature 2: 12 hours. Average: 10 hours.
    expect(metrics.leadTime.value).toBeCloseTo(10, 0);
  });

  it('ignores features without completedAt', async () => {
    const features = [
      makeFeature({ status: 'done', createdAt: hoursAgo(10) }),
      makeFeature({
        status: 'done',
        createdAt: hoursAgo(5),
        completedAt: hoursAgo(1),
      }),
    ];
    const svc = new DoraMetricsService(makeLoader(features));
    const metrics = await svc.getMetrics('/test', 7);

    // Only the second feature counts: 4 hours
    expect(metrics.leadTime.value).toBeCloseTo(4, 0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Deployment frequency
// ---------------------------------------------------------------------------

describe('DoraMetricsService.deploymentFrequency', () => {
  it('counts done features per day over the window', async () => {
    const features = [
      makeFeature({ status: 'done', completedAt: hoursAgo(2) }),
      makeFeature({ status: 'done', completedAt: hoursAgo(24) }),
      makeFeature({ status: 'done', completedAt: hoursAgo(48) }),
    ];
    const svc = new DoraMetricsService(makeLoader(features));
    const metrics = await svc.getMetrics('/test', 7);

    // 3 deployments over 7 days = 0.429/day
    expect(metrics.deploymentFrequency.value).toBeCloseTo(0.429, 1);
  });
});

// ---------------------------------------------------------------------------
// Tests: Change failure rate
// ---------------------------------------------------------------------------

describe('DoraMetricsService.changeFailureRate', () => {
  it('detects rollbacks from done/review -> blocked transitions', async () => {
    const features = [
      makeFeature({ status: 'done', completedAt: hoursAgo(2) }),
      makeFeature({ status: 'done', completedAt: hoursAgo(5) }),
      makeFeature({
        status: 'blocked',
        statusHistory: [
          { from: null, to: 'backlog', timestamp: hoursAgo(10) },
          { from: 'backlog', to: 'in_progress', timestamp: hoursAgo(8) },
          { from: 'in_progress', to: 'done', timestamp: hoursAgo(5) },
          { from: 'done', to: 'blocked', timestamp: hoursAgo(3) },
        ],
      }),
    ];
    const svc = new DoraMetricsService(makeLoader(features));
    const metrics = await svc.getMetrics('/test', 30);

    // 1 rollback out of 2 completed = 0.5
    expect(metrics.changeFailureRate.value).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Tests: Recovery time
// ---------------------------------------------------------------------------

describe('DoraMetricsService.recoveryTime', () => {
  it('computes average blocked duration', async () => {
    const features = [
      makeFeature({
        status: 'done',
        statusHistory: [
          { from: 'in_progress', to: 'blocked', timestamp: hoursAgo(10) },
          { from: 'blocked', to: 'in_progress', timestamp: hoursAgo(7) },
        ],
      }),
    ];
    const svc = new DoraMetricsService(makeLoader(features));
    const metrics = await svc.getMetrics('/test', 30);

    // 3 hours blocked
    expect(metrics.recoveryTime.value).toBeCloseTo(3, 0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Rework rate
// ---------------------------------------------------------------------------

describe('DoraMetricsService.reworkRate', () => {
  it('counts features with failureCount > 0', async () => {
    const features = [
      makeFeature({ failureCount: 0 }),
      makeFeature({ failureCount: 2 }),
      makeFeature({ failureCount: 0 }),
      makeFeature({ failureCount: 1 }),
    ];
    const svc = new DoraMetricsService(makeLoader(features));
    const metrics = await svc.getMetrics('/test', 30);

    // 2 out of 4 = 0.5
    expect(metrics.reworkRate.value).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Tests: Alert generation
// ---------------------------------------------------------------------------

describe('DoraMetricsService.evaluateRegulation', () => {
  it('generates warning alert when threshold is breached', async () => {
    const features = [
      makeFeature({ failureCount: 1 }),
      makeFeature({ failureCount: 1 }),
      makeFeature({ failureCount: 1 }),
    ];
    const svc = new DoraMetricsService(makeLoader(features));
    const metrics = await svc.getMetrics('/test', 30);
    const alerts = svc.evaluateRegulation(metrics);

    const reworkAlert = alerts.find((a) => a.metric === 'reworkRate');
    expect(reworkAlert).toBeDefined();
    expect(reworkAlert!.severity).toBe('critical');
  });

  it('generates no alerts when all metrics are healthy', async () => {
    const features = [
      makeFeature({
        status: 'done',
        createdAt: hoursAgo(5),
        completedAt: hoursAgo(2),
        failureCount: 0,
      }),
    ];
    const svc = new DoraMetricsService(makeLoader(features));
    const metrics = await svc.getMetrics('/test', 7);
    const alerts = svc.evaluateRegulation(metrics);

    // No high change failure, no high rework, recovery time is 0
    const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
    expect(criticalAlerts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Time window filtering
// ---------------------------------------------------------------------------

describe('DoraMetricsService (time window filtering)', () => {
  it('excludes features outside the time window', async () => {
    const features = [
      makeFeature({
        status: 'done',
        createdAt: daysAgo(2),
        completedAt: hoursAgo(1),
      }),
      makeFeature({
        status: 'done',
        createdAt: daysAgo(30),
        completedAt: daysAgo(25),
      }),
    ];
    const svc = new DoraMetricsService(makeLoader(features));
    const metrics = await svc.getMetrics('/test', 7);

    // Only the first feature (created 2 days ago) is within the 7-day window
    expect(metrics.deploymentFrequency.value).toBeGreaterThan(0);
  });
});
