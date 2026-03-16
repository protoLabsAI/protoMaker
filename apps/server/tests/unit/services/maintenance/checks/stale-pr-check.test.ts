import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StalePRCheck } from '@/services/maintenance/checks/stale-pr-check.js';
import type { Feature } from '@protolabsai/types';

function makeReviewFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    title: 'My Feature',
    status: 'review',
    prNumber: 42,
    branchName: 'feature/my-feature',
    ...overrides,
  } as Feature;
}

describe('StalePRCheck', () => {
  let check: StalePRCheck;
  let mockFeatureLoader: { getAll: ReturnType<typeof vi.fn> };
  let mockExecFileAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureLoader = { getAll: vi.fn() };
    mockExecFileAsync = vi.fn();
    check = new StalePRCheck(mockFeatureLoader as any, mockExecFileAsync);
  });

  it('returns no issues when no features are in review', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeReviewFeature({ status: 'backlog' })]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
    expect(mockExecFileAsync).not.toHaveBeenCalled();
  });

  it('returns no issues when PR is up to date', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeReviewFeature()]);

    mockExecFileAsync
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          headRefName: 'feature/my-feature',
          baseRefName: 'dev',
          mergeable: 'MERGEABLE',
        }),
        stderr: '',
      })
      .mockResolvedValueOnce({ stdout: '0\n', stderr: '' });

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('detects PR behind base branch', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeReviewFeature()]);

    mockExecFileAsync
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          headRefName: 'feature/my-feature',
          baseRefName: 'dev',
          mergeable: 'BEHIND',
        }),
        stderr: '',
      })
      .mockResolvedValueOnce({ stdout: '3\n', stderr: '' });

    const issues = await check.run('/project');

    expect(issues).toHaveLength(1);
    expect(issues[0].checkId).toBe('stale-pr');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].featureId).toBe('feat-1');
    expect(issues[0].autoFixable).toBe(false);
    expect(issues[0].message).toContain('#42');
    expect(issues[0].message).toContain('3 commit');
  });

  it('skips features missing prNumber', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeReviewFeature({ prNumber: undefined })]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
    expect(mockExecFileAsync).not.toHaveBeenCalled();
  });

  it('returns empty array when featureLoader throws', async () => {
    mockFeatureLoader.getAll.mockRejectedValue(new Error('error'));
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('skips PR when gh CLI fails', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeReviewFeature()]);
    mockExecFileAsync.mockRejectedValueOnce(new Error('gh not found'));

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('stores behindBy count in context', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeReviewFeature()]);

    mockExecFileAsync
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          headRefName: 'feature/my-feature',
          baseRefName: 'main',
          mergeable: 'BEHIND',
        }),
        stderr: '',
      })
      .mockResolvedValueOnce({ stdout: '5\n', stderr: '' });

    const issues = await check.run('/project');
    expect(issues[0].context?.behindBy).toBe(5);
    expect(issues[0].context?.baseBranch).toBe('main');
  });
});
