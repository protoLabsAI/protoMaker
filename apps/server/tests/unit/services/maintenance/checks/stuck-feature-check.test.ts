import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StuckFeatureCheck } from '@/services/maintenance/checks/stuck-feature-check.js';
import type { Feature } from '@protolabsai/types';

const THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function makeFeature(overrides: Partial<Feature>): Feature {
  return {
    id: 'feat-1',
    title: 'Test Feature',
    status: 'in_progress',
    startedAt: new Date(Date.now() - THRESHOLD_MS - 1000).toISOString(),
    ...overrides,
  } as Feature;
}

describe('StuckFeatureCheck', () => {
  let check: StuckFeatureCheck;
  let mockFeatureLoader: { getAll: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockFeatureLoader = {
      getAll: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    };
    check = new StuckFeatureCheck(mockFeatureLoader as any, THRESHOLD_MS);
  });

  it('returns no issues when no features are in_progress', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ status: 'backlog' })]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns no issues when in_progress feature is within threshold', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ startedAt: new Date(Date.now() - 1000).toISOString() }),
    ]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns no issues when in_progress feature has no startedAt', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ startedAt: undefined })]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('detects stuck feature beyond threshold', async () => {
    const feature = makeFeature({});
    mockFeatureLoader.getAll.mockResolvedValue([feature]);

    const issues = await check.run('/project');

    expect(issues).toHaveLength(1);
    expect(issues[0].checkId).toBe('stuck-feature');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].featureId).toBe('feat-1');
    expect(issues[0].autoFixable).toBe(true);
  });

  it('fix resets feature to backlog', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeFeature({})]);
    const issue = (await check.run('/project'))[0];
    await check.fix!('/project', issue);

    expect(mockFeatureLoader.update).toHaveBeenCalledWith('/project', 'feat-1', {
      status: 'backlog',
      startedAt: undefined,
      error: expect.stringContaining('stuck'),
    });
  });

  it('returns empty array when featureLoader throws', async () => {
    mockFeatureLoader.getAll.mockRejectedValue(new Error('disk error'));
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });
});
