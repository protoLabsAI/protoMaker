import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrphanedWorktreeCheck } from '@/services/maintenance/checks/orphaned-worktree-check.js';
import type { Feature } from '@protolabsai/types';

// Mock secure-fs and child_process to avoid real filesystem/git calls
vi.mock('@/lib/secure-fs.js', () => ({
  readdir: vi.fn(),
  rm: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import * as secureFs from '@/lib/secure-fs.js';
import { exec } from 'child_process';

const mockedReaddir = vi.mocked(secureFs.readdir);
const mockedExec = vi.mocked(exec);

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

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureLoader = { getAll: vi.fn() };
    check = new OrphanedWorktreeCheck(mockFeatureLoader as any);
  });

  it('returns no issues when .worktrees directory does not exist', async () => {
    mockedReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    mockFeatureLoader.getAll.mockResolvedValue([]);

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns no issues when all worktrees have matching features', async () => {
    mockedReaddir.mockResolvedValue([
      { name: 'my-feature', isDirectory: () => true } as any,
    ]);
    mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ branchName: 'feature/my-feature' })]);

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('skips main and master worktree directories', async () => {
    mockedReaddir.mockResolvedValue([
      { name: 'main', isDirectory: () => true } as any,
      { name: 'master', isDirectory: () => true } as any,
    ]);
    mockFeatureLoader.getAll.mockResolvedValue([]);

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('detects orphaned worktree with no uncommitted changes and merged branch', async () => {
    mockedReaddir.mockResolvedValue([
      { name: 'orphaned-branch', isDirectory: () => true } as any,
    ]);
    mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ branchName: 'feature/other' })]);

    // Mock exec: git status returns clean, git branch returns branch, merge-base succeeds
    mockedExec
      .mockImplementationOnce((_cmd, _opts, cb: any) => cb(null, { stdout: '' }, ''))
      .mockImplementationOnce((_cmd, _opts, cb: any) => cb(null, { stdout: 'orphaned-branch\n' }, ''))
      .mockImplementationOnce((_cmd, _opts, cb: any) => cb(null, { stdout: '' }, '')); // merge-base succeeds = merged

    const issues = await check.run('/project');
    expect(issues).toHaveLength(1);
    expect(issues[0].checkId).toBe('orphaned-worktree');
    expect(issues[0].autoFixable).toBe(true);
  });

  it('returns empty array when featureLoader throws', async () => {
    mockedReaddir.mockResolvedValue([{ name: 'some-branch', isDirectory: () => true } as any]);
    mockFeatureLoader.getAll.mockRejectedValue(new Error('error'));

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });
});
