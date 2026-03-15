import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DanglingDependencyCheck } from '@/services/maintenance/checks/dangling-dependency-check.js';
import type { Feature } from '@protolabsai/types';

function makeFeature(overrides: Partial<Feature>): Feature {
  return { id: 'feat-1', title: 'Test Feature', status: 'backlog', ...overrides } as Feature;
}

describe('DanglingDependencyCheck', () => {
  let check: DanglingDependencyCheck;
  let mockFeatureLoader: { getAll: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockFeatureLoader = {
      getAll: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    };
    check = new DanglingDependencyCheck(mockFeatureLoader as any);
  });

  it('returns no issues when no dangling deps', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ id: 'a' }),
      makeFeature({ id: 'b', dependencies: ['a'] }),
    ]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns no issues when feature has no dependencies', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ id: 'a', dependencies: [] })]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('detects dangling dependency', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ id: 'a', dependencies: ['deleted-feat'] }),
    ]);

    const issues = await check.run('/project');

    expect(issues).toHaveLength(1);
    expect(issues[0].checkId).toBe('dangling-dependency');
    expect(issues[0].featureId).toBe('a');
    expect(issues[0].message).toContain('deleted-feat');
    expect(issues[0].autoFixable).toBe(true);
  });

  it('includes valid dep IDs in context for fix', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ id: 'exists' }),
      makeFeature({ id: 'a', dependencies: ['exists', 'gone'] }),
    ]);

    const issues = await check.run('/project');
    expect(issues[0].context?.validIds).toEqual(['exists']);
  });

  it('fix removes dangling dependencies', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ id: 'a', dependencies: ['exists', 'gone'] }),
      makeFeature({ id: 'exists' }),
    ]);

    const issues = await check.run('/project');
    await check.fix!('/project', issues[0]);

    expect(mockFeatureLoader.update).toHaveBeenCalledWith('/project', 'a', {
      dependencies: ['exists'],
    });
  });

  it('returns empty array when featureLoader throws', async () => {
    mockFeatureLoader.getAll.mockRejectedValue(new Error('error'));
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });
});
