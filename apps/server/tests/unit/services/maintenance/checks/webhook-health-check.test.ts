import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WebhookHealthCheck,
  WEBHOOK_HEALTH_GRACE_PERIOD_MS,
} from '@/services/maintenance/checks/webhook-health-check.js';
import type { Feature } from '@protolabsai/types';

function makeReviewFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    title: 'My Feature',
    category: 'feature',
    description: '',
    status: 'review',
    prNumber: 42,
    prTrackedSince: new Date(Date.now() - WEBHOOK_HEALTH_GRACE_PERIOD_MS * 2).toISOString(),
    ...overrides,
  } as Feature;
}

describe('WebhookHealthCheck', () => {
  let check: WebhookHealthCheck;
  let mockFeatureLoader: { getAll: ReturnType<typeof vi.fn> };
  let mockNowMs: ReturnType<typeof vi.fn>;

  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureLoader = { getAll: vi.fn() };
    mockNowMs = vi.fn().mockReturnValue(NOW);
    check = new WebhookHealthCheck(mockFeatureLoader as any, mockNowMs);
  });

  it('returns no issues when no features are in review', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeReviewFeature({ status: 'backlog' })]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns no issues when feature has a lastCheckSuiteId (CI seen)', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeReviewFeature({ lastCheckSuiteId: 12345 })]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns no issues when within grace period', async () => {
    const recentTrackedSince = new Date(NOW - WEBHOOK_HEALTH_GRACE_PERIOD_MS / 2).toISOString();
    mockFeatureLoader.getAll.mockResolvedValue([
      makeReviewFeature({ prTrackedSince: recentTrackedSince }),
    ]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('warns when PR in review has no CI events after grace period', async () => {
    const oldTrackedSince = new Date(NOW - WEBHOOK_HEALTH_GRACE_PERIOD_MS * 2).toISOString();
    mockFeatureLoader.getAll.mockResolvedValue([
      makeReviewFeature({ prTrackedSince: oldTrackedSince }),
    ]);

    const issues = await check.run('/project');

    expect(issues).toHaveLength(1);
    expect(issues[0].checkId).toBe('webhook-health');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].featureId).toBe('feat-1');
    expect(issues[0].autoFixable).toBe(false);
    expect(issues[0].message).toContain('#42');
    expect(issues[0].message).toContain('no CI events');
  });

  it('falls back to reviewStartedAt when prTrackedSince is absent', async () => {
    const oldStartedAt = new Date(NOW - WEBHOOK_HEALTH_GRACE_PERIOD_MS * 2).toISOString();
    mockFeatureLoader.getAll.mockResolvedValue([
      makeReviewFeature({ prTrackedSince: undefined, reviewStartedAt: oldStartedAt }),
    ]);

    const issues = await check.run('/project');
    expect(issues).toHaveLength(1);
    expect(issues[0].featureId).toBe('feat-1');
  });

  it('skips features with no timestamp (prTrackedSince and reviewStartedAt absent)', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeReviewFeature({ prTrackedSince: undefined, reviewStartedAt: undefined }),
    ]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('skips features with no prNumber', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeReviewFeature({ prNumber: undefined })]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns empty array when featureLoader throws', async () => {
    mockFeatureLoader.getAll.mockRejectedValue(new Error('disk error'));
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('detects multiple PRs needing CI events', async () => {
    const oldTrackedSince = new Date(NOW - WEBHOOK_HEALTH_GRACE_PERIOD_MS * 3).toISOString();
    mockFeatureLoader.getAll.mockResolvedValue([
      makeReviewFeature({ id: 'feat-1', prNumber: 10, prTrackedSince: oldTrackedSince }),
      makeReviewFeature({ id: 'feat-2', prNumber: 20, prTrackedSince: oldTrackedSince }),
    ]);

    const issues = await check.run('/project');
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.featureId)).toEqual(['feat-1', 'feat-2']);
  });

  it('stores elapsed minutes and projectPath in context', async () => {
    const oldTrackedSince = new Date(NOW - WEBHOOK_HEALTH_GRACE_PERIOD_MS * 2).toISOString();
    mockFeatureLoader.getAll.mockResolvedValue([
      makeReviewFeature({ prTrackedSince: oldTrackedSince }),
    ]);

    const issues = await check.run('/my-project');
    expect(issues[0].context?.projectPath).toBe('/my-project');
    expect(typeof issues[0].context?.elapsedMinutes).toBe('number');
    expect(issues[0].context?.prNumber).toBe(42);
  });
});
