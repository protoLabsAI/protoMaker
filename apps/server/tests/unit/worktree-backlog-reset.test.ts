import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { execSync } from 'child_process';
import { WorktreeLifecycleService } from '@/services/worktree-lifecycle-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import type { EventEmitter } from '@/lib/events.js';

vi.mock('child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    promises: {
      access: vi.fn(),
      rename: vi.fn(),
      readdir: vi.fn(),
      stat: vi.fn(),
      lstat: vi.fn(),
      symlink: vi.fn(),
    },
  },
}));

vi.mock('@/lib/secure-fs.js', () => ({
  access: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock('@/lib/worktree-lock.js', () => ({
  isWorktreeLocked: vi.fn().mockResolvedValue(false),
}));

vi.mock('@protolabsai/platform', () => ({
  getFeatureDir: (projectPath: string, featureId: string) =>
    `${projectPath}/.automaker/features/${featureId}`,
}));

function createMockEvents(): EventEmitter {
  return {
    emit: vi.fn(),
    broadcast: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  } as unknown as EventEmitter;
}

function createMockFeatureLoader(feature?: Record<string, unknown>): FeatureLoader {
  return {
    get: vi.fn().mockResolvedValue(feature ?? null),
    getAll: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  } as unknown as FeatureLoader;
}

describe('WorktreeLifecycleService.cleanupForBacklogReset', () => {
  let service: WorktreeLifecycleService;
  let events: EventEmitter;
  let featureLoader: FeatureLoader;
  const projectPath = '/test/project';
  const featureId = 'test-feature-123';
  const branchName = 'feature/test-branch';
  const worktreeName = 'feature-test-branch';

  beforeEach(() => {
    events = createMockEvents();
    featureLoader = createMockFeatureLoader({
      id: featureId,
      branchName,
      status: 'backlog',
    });
    service = new WorktreeLifecycleService(events, featureLoader);
  });

  it('removes worktree, deletes branch, and renames stale files', async () => {
    vi.mocked(fs.promises.access).mockResolvedValue(undefined);
    vi.mocked(fs.promises.rename).mockResolvedValue(undefined);
    vi.mocked(fs.promises.readdir).mockResolvedValue([
      'handoff-EXECUTE.json',
      'handoff-PLAN.json',
      'feature.json',
    ] as unknown as fs.Dirent[]);
    vi.mocked(execSync).mockReturnValue('');

    await service.cleanupForBacklogReset(projectPath, featureId);

    // Should remove worktree
    expect(execSync).toHaveBeenCalledWith(
      `git worktree remove "${projectPath}/.worktrees/${worktreeName}" --force`,
      expect.objectContaining({ cwd: projectPath })
    );

    // Should force-delete branch
    expect(execSync).toHaveBeenCalledWith(
      `git branch -D "${branchName}"`,
      expect.objectContaining({ cwd: projectPath })
    );

    // Should prune worktree metadata
    expect(execSync).toHaveBeenCalledWith(
      'git worktree prune',
      expect.objectContaining({ cwd: projectPath })
    );

    // Should rename agent-output.md
    expect(fs.promises.rename).toHaveBeenCalledWith(
      `${projectPath}/.automaker/features/${featureId}/agent-output.md`,
      `${projectPath}/.automaker/features/${featureId}/agent-output.md.stale`
    );

    // Should rename handoff files (but not feature.json)
    expect(fs.promises.rename).toHaveBeenCalledWith(
      `${projectPath}/.automaker/features/${featureId}/handoff-EXECUTE.json`,
      `${projectPath}/.automaker/features/${featureId}/handoff-EXECUTE.json.stale`
    );
    expect(fs.promises.rename).toHaveBeenCalledWith(
      `${projectPath}/.automaker/features/${featureId}/handoff-PLAN.json`,
      `${projectPath}/.automaker/features/${featureId}/handoff-PLAN.json.stale`
    );

    // Should emit cleanup event
    expect(events.emit).toHaveBeenCalledWith(
      'feature:worktree-cleaned',
      expect.objectContaining({
        projectPath,
        branchName,
        featureId,
        reason: 'backlog-reset',
      })
    );
  });

  it('skips worktree and branch cleanup when feature has no branch', async () => {
    featureLoader = createMockFeatureLoader({
      id: featureId,
      status: 'backlog',
      // no branchName
    });
    service = new WorktreeLifecycleService(events, featureLoader);

    // Still rename stale files even without branch
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.promises.readdir).mockRejectedValue(new Error('ENOENT'));

    await service.cleanupForBacklogReset(projectPath, featureId);

    // Should NOT call git commands
    expect(execSync).not.toHaveBeenCalled();

    // Should NOT emit cleanup event (no branch to report)
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('does not throw when worktree removal fails', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('worktree remove')) {
        throw new Error('worktree not found');
      }
      return '';
    });
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.promises.readdir).mockRejectedValue(new Error('ENOENT'));

    // Should not throw
    await expect(service.cleanupForBacklogReset(projectPath, featureId)).resolves.toBeUndefined();

    // Branch deletion should still be attempted
    expect(execSync).toHaveBeenCalledWith(
      `git branch -D "${branchName}"`,
      expect.objectContaining({ cwd: projectPath })
    );
  });

  it('does not throw when branch deletion fails', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('branch -D')) {
        throw new Error('branch not found');
      }
      return '';
    });
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.promises.readdir).mockRejectedValue(new Error('ENOENT'));

    // Should not throw
    await expect(service.cleanupForBacklogReset(projectPath, featureId)).resolves.toBeUndefined();
  });

  it('does not throw when feature cannot be loaded', async () => {
    featureLoader = createMockFeatureLoader();
    (featureLoader.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('feature not found')
    );
    service = new WorktreeLifecycleService(events, featureLoader);

    await expect(service.cleanupForBacklogReset(projectPath, featureId)).resolves.toBeUndefined();
  });

  it('handles missing agent-output.md gracefully', async () => {
    vi.mocked(execSync).mockReturnValue('');
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.promises.readdir).mockResolvedValue([] as unknown as fs.Dirent[]);

    await expect(service.cleanupForBacklogReset(projectPath, featureId)).resolves.toBeUndefined();

    // rename should not be called for agent-output.md since access failed
    expect(fs.promises.rename).not.toHaveBeenCalledWith(
      expect.stringContaining('agent-output.md'),
      expect.any(String)
    );
  });
});
