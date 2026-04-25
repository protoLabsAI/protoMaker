import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature } from '@protolabsai/types';

// Mock exec/execFile before importing the service
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
}));
vi.mock('util', () => ({
  promisify: (fn: unknown) => fn,
}));

import { checkAndRecoverUncommittedWork } from '@/services/worktree-recovery-service.js';
import { exec, execFile } from 'child_process';

const mockExec = exec as unknown as ReturnType<typeof vi.fn>;
const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

const baseFeature: Feature = {
  id: 'feature-test-001',
  title: 'Test feature',
  description: 'Test feature description',
  status: 'in_progress',
  branchName: 'feature/test-branch',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  order: 0,
};

describe('worktree-recovery-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAndRecoverUncommittedWork', () => {
    it('returns detected=false when worktree is clean', async () => {
      // git status --short returns empty
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await checkAndRecoverUncommittedWork(
        baseFeature,
        '/mock/worktree',
        '/fake/project'
      );

      expect(result.detected).toBe(false);
      expect(result.recovered).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('returns detected=true, error when feature has no branchName', async () => {
      // git status --short returns uncommitted changes
      mockExec.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });

      const featureNoBranch: Feature = { ...baseFeature, branchName: undefined };
      const result = await checkAndRecoverUncommittedWork(
        featureNoBranch,
        '/mock/worktree',
        '/fake/project'
      );

      expect(result.detected).toBe(true);
      expect(result.recovered).toBe(false);
      expect(result.error).toContain('no branchName set on feature');
    });

    it('successfully recovers uncommitted work (commit + push + PR)', async () => {
      // git status --short: uncommitted files
      mockExec.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });
      // git add (step 1: stage)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached --name-only (staging verification)
      mockExec.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // git diff --cached --name-only --diff-filter=ACMR (step 1.5: prettier file list)
      mockExec.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // node prettier --write
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git add (re-stage after prettier)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git commit (execFile)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git fetch origin dev (rebase step)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git rebase origin/dev (rebase step)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git push --force-with-lease
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // gh pr create (execFileAsync)
      mockExecFile.mockResolvedValueOnce({
        stdout: 'https://github.com/owner/repo/pull/42\n',
        stderr: '',
      });

      const result = await checkAndRecoverUncommittedWork(
        baseFeature,
        '/mock/worktree',
        '/fake/project'
      );

      expect(result.detected).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/42');
      expect(result.prNumber).toBe(42);
      expect(result.prCreatedAt).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('invokes project-local prettier with --ignore-path /dev/null on staged files', async () => {
      // git status --short: uncommitted files
      mockExec.mockResolvedValueOnce({ stdout: 'A  src/new-file.ts\n', stderr: '' });
      // git add (stage)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached (verify staging)
      mockExec.mockResolvedValueOnce({ stdout: 'src/new-file.ts\n', stderr: '' });
      // git diff --cached --diff-filter=ACMR (prettier file list)
      mockExec.mockResolvedValueOnce({ stdout: 'src/new-file.ts\n', stderr: '' });
      // node prettier --write (captured for assertion)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git add (re-stage after prettier)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git commit
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git fetch
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git rebase
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git push
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // gh pr create
      mockExecFile.mockResolvedValueOnce({
        stdout: 'https://github.com/owner/repo/pull/10\n',
        stderr: '',
      });

      await checkAndRecoverUncommittedWork(baseFeature, '/mock/worktree', '/fake/project');

      // Find the prettier invocation among all exec calls
      const allCalls = mockExec.mock.calls.map((call: unknown[]) => String(call[0]));
      const prettierCall = allCalls.find((cmd) => cmd.includes('prettier'));
      expect(prettierCall).toBeDefined();
      expect(prettierCall).toContain('--ignore-path /dev/null');
      expect(prettierCall).toContain('--write');
      // Uses the project-local binary path (node_modules/.bin/prettier)
      expect(prettierCall).toContain('/fake/project/node_modules/.bin/prettier');
    });

    it('returns error when commit step fails', async () => {
      // git status --short: uncommitted files
      mockExec.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });
      // git add (stage)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached --name-only (staging verification)
      mockExec.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // git diff --cached --diff-filter=ACMR (prettier list — empty, skip prettier)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git commit (execFile) fails
      mockExecFile.mockRejectedValueOnce(new Error('nothing to commit, working tree clean'));

      const result = await checkAndRecoverUncommittedWork(
        baseFeature,
        '/mock/worktree',
        '/fake/project'
      );

      expect(result.detected).toBe(true);
      expect(result.recovered).toBe(false);
      expect(result.error).toContain('git workflow failed');
    });

    it('returns error when push step fails', async () => {
      // git status --short
      mockExec.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });
      // git add (stage)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached --name-only (staging verification)
      mockExec.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // git diff --cached --diff-filter=ACMR (prettier list — empty, skip prettier)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git commit succeeds
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git fetch origin dev (rebase step)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git rebase origin/dev (rebase step)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git push fails
      mockExec.mockRejectedValueOnce(new Error('remote: Permission denied'));

      const result = await checkAndRecoverUncommittedWork(
        baseFeature,
        '/mock/worktree',
        '/fake/project'
      );

      expect(result.detected).toBe(true);
      expect(result.recovered).toBe(false);
      expect(result.error).toContain('git workflow failed');
    });

    it('continues recovery even if prettier formatting fails', async () => {
      // git status --short
      mockExec.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });
      // git add (stage)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached --name-only (staging verification)
      mockExec.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // git diff --cached --diff-filter=ACMR (prettier list)
      mockExec.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // node prettier fails (non-fatal)
      mockExec.mockRejectedValueOnce(new Error('prettier not found'));
      // git commit succeeds
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git fetch origin dev (rebase step)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git rebase origin/dev (rebase step)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git push --force-with-lease succeeds
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // gh pr create (execFileAsync)
      mockExecFile.mockResolvedValueOnce({
        stdout: 'https://github.com/owner/repo/pull/99\n',
        stderr: '',
      });

      const result = await checkAndRecoverUncommittedWork(
        baseFeature,
        '/mock/worktree',
        '/fake/project'
      );

      // Recovery should succeed even though formatting failed
      expect(result.detected).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.prNumber).toBe(99);
    });

    it('recovers when rebase conflicts — pushes without force-with-lease', async () => {
      // git status --short
      mockExec.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });
      // git add (stage)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached --name-only (staging verification)
      mockExec.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // git diff --cached --diff-filter=ACMR (prettier list)
      mockExec.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // node prettier --write
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git add (re-stage after prettier)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git commit (execFile)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git fetch origin dev (rebase step)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git rebase origin/dev FAILS with CONFLICT
      mockExec.mockRejectedValueOnce(
        new Error('CONFLICT (content): Merge conflict in src/index.ts')
      );
      // git rebase --abort (best-effort)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git push (NO --force-with-lease since rebase was aborted)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // gh pr create (execFileAsync)
      mockExecFile.mockResolvedValueOnce({
        stdout: 'https://github.com/owner/repo/pull/55\n',
        stderr: '',
      });

      const result = await checkAndRecoverUncommittedWork(
        baseFeature,
        '/mock/worktree',
        '/fake/project'
      );

      expect(result.detected).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.prNumber).toBe(55);
    });

    it('recovers when rebase fails for non-conflict reason — aborts and pushes normally', async () => {
      // git status --short
      mockExec.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });
      // git add (stage)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached --name-only (staging verification)
      mockExec.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // git diff --cached --diff-filter=ACMR (prettier list)
      mockExec.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // node prettier --write
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git add (re-stage after prettier)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git commit (execFile)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git fetch origin dev — fails (network error)
      mockExec.mockRejectedValueOnce(new Error('fatal: unable to access remote'));
      // git rebase --abort (best-effort after non-conflict failure)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git push (NO --force-with-lease)
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // gh pr create (execFileAsync)
      mockExecFile.mockResolvedValueOnce({
        stdout: 'https://github.com/owner/repo/pull/77\n',
        stderr: '',
      });

      const result = await checkAndRecoverUncommittedWork(
        baseFeature,
        '/mock/worktree',
        '/fake/project'
      );

      expect(result.detected).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.prNumber).toBe(77);
    });
  });
});
