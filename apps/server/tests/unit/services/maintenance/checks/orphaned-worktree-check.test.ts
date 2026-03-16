import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrphanedWorktreeCheck } from '@/services/maintenance/checks/orphaned-worktree-check.js';
import type { Feature } from '@protolabsai/types';

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    title: 'Test',
    status: 'in_progress',
    branchName: 'feature/my-feature',
    ...overrides,
  } as Feature;
}

describe('OrphanedWorktreeCheck', () => {
  let check: OrphanedWorktreeCheck;
  let mockFeatureLoader: { getAll: ReturnType<typeof vi.fn> };
  let mockExecAsync: ReturnType<typeof vi.fn>;
  let mockReaddir: ReturnType<typeof vi.fn>;
  let mockRm: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureLoader = { getAll: vi.fn() };
    mockExecAsync = vi.fn();
    mockReaddir = vi.fn();
    mockRm = vi.fn().mockResolvedValue(undefined);

    check = new OrphanedWorktreeCheck(mockFeatureLoader as any, {
      execAsync: mockExecAsync,
      readdirFn: mockReaddir,
      rmFn: mockRm,
    });
  });

  it('returns no issues when .worktrees directory does not exist', async () => {
    mockReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    mockFeatureLoader.getAll.mockResolvedValue([]);

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns no issues when all worktrees have matching features', async () => {
    mockReaddir.mockResolvedValue([{ name: 'my-feature', isDirectory: () => true }]);
    mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ branchName: 'feature/my-feature' })]);

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('skips main and master worktree directories', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'main', isDirectory: () => true },
      { name: 'master', isDirectory: () => true },
    ]);
    mockFeatureLoader.getAll.mockResolvedValue([]);

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('detects orphaned worktree with no uncommitted changes and merged branch', async () => {
    mockReaddir.mockResolvedValue([{ name: 'orphaned-branch', isDirectory: () => true }]);
    mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ branchName: 'feature/other' })]);

    mockExecAsync
      .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status clean
      .mockResolvedValueOnce({ stdout: 'orphaned-branch\n', stderr: '' }) // git branch --show-current
      .mockResolvedValueOnce({ stdout: '', stderr: '' }); // merge-base --is-ancestor succeeds

    const issues = await check.run('/project');
    expect(issues).toHaveLength(1);
    expect(issues[0].checkId).toBe('orphaned-worktree');
    expect(issues[0].autoFixable).toBe(true);
    expect(issues[0].severity).toBe('info');
  });

  it('does not flag worktree with uncommitted changes', async () => {
    mockReaddir.mockResolvedValue([{ name: 'dirty-branch', isDirectory: () => true }]);
    mockFeatureLoader.getAll.mockResolvedValue([]);

    mockExecAsync.mockResolvedValueOnce({ stdout: ' M somefile.ts\n', stderr: '' });

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('does not flag worktree that is not merged', async () => {
    mockReaddir.mockResolvedValue([{ name: 'active-branch', isDirectory: () => true }]);
    mockFeatureLoader.getAll.mockResolvedValue([]);

    mockExecAsync
      .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status clean
      .mockResolvedValueOnce({ stdout: 'active-branch\n', stderr: '' }) // git branch
      .mockRejectedValueOnce(new Error('not merged')) // merge-base main fails
      .mockRejectedValueOnce(new Error('not merged')); // merge-base master fails

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('fix removes orphaned worktree', async () => {
    mockReaddir.mockResolvedValue([{ name: 'orphaned', isDirectory: () => true }]);
    mockFeatureLoader.getAll.mockResolvedValue([]);

    mockExecAsync
      .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status
      .mockResolvedValueOnce({ stdout: 'orphaned\n', stderr: '' }) // git branch
      .mockResolvedValueOnce({ stdout: '', stderr: '' }); // merge-base

    const issues = await check.run('/project');
    expect(issues).toHaveLength(1);

    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' }); // git worktree remove
    await check.fix!('/project', issues[0]);

    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining('git worktree remove'),
      expect.objectContaining({ cwd: '/project' })
    );
  });

  it('returns empty array when featureLoader throws', async () => {
    mockReaddir.mockResolvedValue([{ name: 'some-branch', isDirectory: () => true }]);
    mockFeatureLoader.getAll.mockRejectedValue(new Error('error'));

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });
});
