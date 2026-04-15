import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RestartSafetyCheckService } from '@/services/restart-safety-check-service.js';
import type { Feature } from '@protolabsai/types';

// Mock fs/promises access
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

// Mock child_process execFileCb (the service wraps it in an explicit promise)
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execFile: vi.fn(), exec: vi.fn() };
});

// Mock the startup-recovery-service's recoverDirtyWorktree function
vi.mock('@/services/startup-recovery-service.js', () => ({
  recoverDirtyWorktree: vi.fn(),
}));

import { access } from 'node:fs/promises';
import { execFile } from 'child_process';
import { recoverDirtyWorktree } from '@/services/startup-recovery-service.js';

function mockExecFileWithOutput(stdout: string): void {
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    const callback = args[args.length - 1] as (
      err: null | Error,
      stdout: string,
      stderr: string
    ) => void;
    callback(null, stdout, '');
    return {} as ReturnType<typeof execFile>;
  });
}

function mockExecFileError(err: Error): void {
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    const callback = args[args.length - 1] as (err: Error) => void;
    callback(err);
    return {} as ReturnType<typeof execFile>;
  });
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feature-abc-123',
    title: 'Test feature',
    description: 'A test feature',
    status: 'in_progress',
    projectSlug: 'test-project',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Feature;
}

const PROJECT_PATH = '/test/project';

describe('RestartSafetyCheckService', () => {
  let service: RestartSafetyCheckService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RestartSafetyCheckService();
  });

  describe('check()', () => {
    describe('when feature has a prNumber', () => {
      it('returns to_review without checking worktree', async () => {
        const feature = makeFeature({ prNumber: 42 });
        const result = await service.check(feature, PROJECT_PATH);

        expect(result.action).toBe('to_review');
        expect(result.reason).toContain('42');
        // access should not have been called — no need to check worktree
        expect(access).not.toHaveBeenCalled();
      });
    });

    describe('when feature has no prNumber and no worktree', () => {
      it('returns resume when worktree path does not exist', async () => {
        const feature = makeFeature({ branchName: 'feature/my-branch' });
        vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

        const result = await service.check(feature, PROJECT_PATH);

        expect(result.action).toBe('resume');
      });

      it('returns resume when feature has no branchName and no worktree', async () => {
        const feature = makeFeature({ branchName: undefined });
        vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

        const result = await service.check(feature, PROJECT_PATH);

        expect(result.action).toBe('resume');
      });
    });

    describe('when worktree exists and is clean', () => {
      it('returns resume', async () => {
        const feature = makeFeature({ branchName: 'feature/clean-branch' });
        vi.mocked(access).mockResolvedValue(undefined);
        mockExecFileWithOutput(''); // No output = clean worktree

        const result = await service.check(feature, PROJECT_PATH);

        expect(result.action).toBe('resume');
      });
    });

    describe('when worktree exists and is dirty (auto-recovery)', () => {
      it('returns recovered when auto-recovery succeeds', async () => {
        const feature = makeFeature({ branchName: 'feature/dirty-branch' });
        vi.mocked(access).mockResolvedValue(undefined);
        mockExecFileWithOutput(' M src/some-file.ts\n?? newfile.ts\n');
        vi.mocked(recoverDirtyWorktree).mockResolvedValue('recovery/feature-abc-123-1713200000000');

        const result = await service.check(feature, PROJECT_PATH);

        expect(result.action).toBe('recovered');
        expect(result.reason).toContain('Uncommitted WIP preserved to recovery/');
        expect(result.recoveryBranch).toBe('recovery/feature-abc-123-1713200000000');
        expect(result.worktreePath).toContain('.worktrees/feature-dirty-branch');
        expect(recoverDirtyWorktree).toHaveBeenCalledWith(
          expect.stringContaining('.worktrees/feature-dirty-branch'),
          'feature/dirty-branch',
          'feature-abc-123'
        );
      });

      it('returns block when auto-recovery fails', async () => {
        const feature = makeFeature({ branchName: 'feature/dirty-branch' });
        vi.mocked(access).mockResolvedValue(undefined);
        mockExecFileWithOutput(' M src/some-file.ts\n');
        vi.mocked(recoverDirtyWorktree).mockRejectedValue(new Error('stash lock exists'));

        const result = await service.check(feature, PROJECT_PATH);

        expect(result.action).toBe('block');
        expect(result.reason).toContain('auto-recovery failed');
        expect(result.reason).toContain('stash lock exists');
        expect(result.worktreePath).toBeDefined();
      });

      it('returns block when dirty worktree has no branchName (cannot auto-recover)', async () => {
        const feature = makeFeature({ branchName: undefined });
        vi.mocked(access).mockResolvedValue(undefined);
        mockExecFileWithOutput(' M src/some-file.ts\n');

        const result = await service.check(feature, PROJECT_PATH);

        expect(result.action).toBe('block');
        expect(result.reason).toContain('no branch name');
        expect(result.reason).toContain('cannot auto-recover');
      });
    });

    describe('when worktree exists and has merge conflicts', () => {
      it('returns block with merge conflicts reason for UU prefix', async () => {
        const feature = makeFeature({ branchName: 'feature/conflict-branch' });
        vi.mocked(access).mockResolvedValue(undefined);
        mockExecFileWithOutput('UU src/conflicted-file.ts\n');

        const result = await service.check(feature, PROJECT_PATH);

        expect(result.action).toBe('block');
        expect(result.reason).toContain('merge conflicts');
        // Auto-recovery should NOT be attempted for conflicts
        expect(recoverDirtyWorktree).not.toHaveBeenCalled();
      });

      it('returns block for AA (both added) conflict', async () => {
        const feature = makeFeature({ branchName: 'feature/conflict-branch' });
        vi.mocked(access).mockResolvedValue(undefined);
        mockExecFileWithOutput('AA src/new-file.ts\n');

        const result = await service.check(feature, PROJECT_PATH);

        expect(result.action).toBe('block');
        expect(result.reason).toContain('merge conflicts');
      });

      it('returns block for DD (both deleted) conflict', async () => {
        const feature = makeFeature({ branchName: 'feature/conflict-branch' });
        vi.mocked(access).mockResolvedValue(undefined);
        mockExecFileWithOutput('DD src/deleted-file.ts\n');

        const result = await service.check(feature, PROJECT_PATH);

        expect(result.action).toBe('block');
        expect(result.reason).toContain('merge conflicts');
      });
    });

    describe('when git status command fails', () => {
      it('defaults to resume (safer than blocking)', async () => {
        const feature = makeFeature({ branchName: 'feature/some-branch' });
        vi.mocked(access).mockResolvedValue(undefined);
        mockExecFileError(new Error('git: not a repository'));

        const result = await service.check(feature, PROJECT_PATH);

        expect(result.action).toBe('resume');
      });
    });
  });

  describe('resolveWorktreePath()', () => {
    it('uses branchName when set', () => {
      const feature = makeFeature({ branchName: 'feature/my-branch' });
      const result = service.resolveWorktreePath(feature, PROJECT_PATH);
      expect(result).toBe('/test/project/.worktrees/feature-my-branch');
    });

    it('sanitizes branchName by replacing non-alphanumeric chars with dashes', () => {
      const feature = makeFeature({ branchName: 'feature/test_branch.v2' });
      const result = service.resolveWorktreePath(feature, PROJECT_PATH);
      expect(result).toBe('/test/project/.worktrees/feature-test_branch-v2');
    });

    it('falls back to featureId when branchName is not set', () => {
      const feature = makeFeature({ id: 'feature-abc-123', branchName: undefined });
      const result = service.resolveWorktreePath(feature, PROJECT_PATH);
      expect(result).toBe('/test/project/.worktrees/feature-abc-123');
    });

    it('sanitizes featureId similarly', () => {
      const feature = makeFeature({ id: 'feature:special.chars', branchName: undefined });
      const result = service.resolveWorktreePath(feature, PROJECT_PATH);
      expect(result).toBe('/test/project/.worktrees/feature-special-chars');
    });

    it('returns null when both branchName and id are absent', () => {
      const feature = { status: 'in_progress' } as Feature;
      const result = service.resolveWorktreePath(feature, PROJECT_PATH);
      expect(result).toBeNull();
    });
  });
});
