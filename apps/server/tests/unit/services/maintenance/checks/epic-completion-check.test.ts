import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpicCompletionCheck } from '@/services/maintenance/checks/epic-completion-check.js';
import type { Feature } from '@protolabsai/types';

function makeFeature(overrides: Partial<Feature>): Feature {
  return { id: 'feat-1', title: 'Test', status: 'backlog', ...overrides } as Feature;
}

describe('EpicCompletionCheck', () => {
  let check: EpicCompletionCheck;
  let mockFeatureLoader: { getAll: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockFeatureLoader = {
      getAll: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    };
    check = new EpicCompletionCheck(mockFeatureLoader as any);
  });

  it('returns no issues when epic is already done', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ id: 'epic-1', isEpic: true, status: 'done' }),
      makeFeature({ id: 'c1', epicId: 'epic-1', status: 'done' }),
    ]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns no issues when epic has no children', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ id: 'epic-1', isEpic: true, status: 'in_progress' }),
    ]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns no issues when not all children are done', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ id: 'epic-1', isEpic: true, status: 'in_progress' }),
      makeFeature({ id: 'c1', epicId: 'epic-1', status: 'done' }),
      makeFeature({ id: 'c2', epicId: 'epic-1', status: 'review' }),
    ]);
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('detects epic with all children done but epic not done', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ id: 'epic-1', isEpic: true, status: 'in_progress' }),
      makeFeature({ id: 'c1', epicId: 'epic-1', status: 'done' }),
      makeFeature({ id: 'c2', epicId: 'epic-1', status: 'done' }),
    ]);

    const issues = await check.run('/project');

    expect(issues).toHaveLength(1);
    expect(issues[0].checkId).toBe('epic-completion');
    expect(issues[0].featureId).toBe('epic-1');
    expect(issues[0].autoFixable).toBe(true);
  });

  it('marks git-backed epics as NOT auto-fixable', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ id: 'epic-1', isEpic: true, status: 'in_progress', branchName: 'epic/test' }),
      makeFeature({ id: 'c1', epicId: 'epic-1', status: 'done' }),
    ]);

    const issues = await check.run('/project');

    expect(issues[0].autoFixable).toBe(false);
    expect(issues[0].fixDescription).toContain('CompletionDetectorService');
  });

  it('fix sets non-git epic to done', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ id: 'epic-1', isEpic: true, status: 'in_progress' }),
      makeFeature({ id: 'c1', epicId: 'epic-1', status: 'done' }),
    ]);

    const issues = await check.run('/project');
    await check.fix!('/project', issues[0]);

    expect(mockFeatureLoader.update).toHaveBeenCalledWith('/project', 'epic-1', {
      status: 'done',
    });
  });

  it('fix skips git-backed epics', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ id: 'epic-1', isEpic: true, status: 'in_progress', branchName: 'epic/test' }),
      makeFeature({ id: 'c1', epicId: 'epic-1', status: 'done' }),
    ]);

    const issues = await check.run('/project');
    await check.fix!('/project', issues[0]);

    expect(mockFeatureLoader.update).not.toHaveBeenCalled();
  });

  it('returns empty array when featureLoader throws', async () => {
    mockFeatureLoader.getAll.mockRejectedValue(new Error('error'));
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });
});
