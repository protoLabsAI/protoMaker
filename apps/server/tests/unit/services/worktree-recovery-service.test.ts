import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Feature } from '@protolabsai/types';

// Mock execFile before importing the service. After the shell-string →
// argv migration (#3597 part 2), every external command in this service
// goes through execFile via safeGit/safeExec; the bare `exec` symbol is
// no longer used by production code.
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
}));
vi.mock('util', () => ({
  promisify: (fn: unknown) => fn,
}));

import {
  checkAndRecoverUncommittedWork,
  recoverNestedWorktreeWork,
} from '@/services/worktree-recovery-service.js';
import { execFile } from 'child_process';

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
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

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
      mockExecFile.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });

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
      mockExecFile.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });
      // git add (step 1: stage)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached --name-only (staging verification)
      mockExecFile.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // git diff --cached --name-only --diff-filter=ACMR (step 1.5: prettier file list)
      mockExecFile.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // node prettier --write
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git add (re-stage after prettier)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git commit (execFile)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git fetch origin dev (rebase step)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git rebase origin/dev (rebase step)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git push --force-with-lease
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
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
      mockExecFile.mockResolvedValueOnce({ stdout: 'A  src/new-file.ts\n', stderr: '' });
      // git add (stage)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached (verify staging)
      mockExecFile.mockResolvedValueOnce({ stdout: 'src/new-file.ts\n', stderr: '' });
      // git diff --cached --diff-filter=ACMR (prettier file list)
      mockExecFile.mockResolvedValueOnce({ stdout: 'src/new-file.ts\n', stderr: '' });
      // node prettier --write (captured for assertion)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git add (re-stage after prettier)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git commit
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git fetch
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git rebase
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git push
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // gh pr create
      mockExecFile.mockResolvedValueOnce({
        stdout: 'https://github.com/owner/repo/pull/10\n',
        stderr: '',
      });

      await checkAndRecoverUncommittedWork(baseFeature, '/mock/worktree', '/fake/project');

      // Find the prettier invocation among the execFile calls. After the
      // shell-string → argv migration, prettier is invoked as
      //   execFile('node', [prettierBin, '--ignore-path', '/dev/null', '--write', ...files])
      // so we look at the argv array (call[1]) instead of a joined command string.
      const prettierCall = mockExecFile.mock.calls.find(
        (call: unknown[]) =>
          call[0] === 'node' &&
          Array.isArray(call[1]) &&
          (call[1] as string[]).some((arg) => arg.includes('prettier'))
      );
      expect(prettierCall).toBeDefined();
      const argv = prettierCall![1] as string[];
      expect(argv).toContain('--ignore-path');
      expect(argv).toContain('/dev/null');
      expect(argv).toContain('--write');
      // Uses the project-local binary path (node_modules/.bin/prettier)
      expect(argv.some((arg) => arg.includes('/fake/project/node_modules/.bin/prettier'))).toBe(
        true
      );
    });

    it('returns error when commit step fails', async () => {
      // git status --short: uncommitted files
      mockExecFile.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });
      // git add (stage)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached --name-only (staging verification)
      mockExecFile.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // git diff --cached --diff-filter=ACMR (prettier list — empty, skip prettier)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
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
      mockExecFile.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });
      // git add (stage)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached --name-only (staging verification)
      mockExecFile.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // git diff --cached --diff-filter=ACMR (prettier list — empty, skip prettier)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git commit succeeds
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git fetch origin dev (rebase step)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git rebase origin/dev (rebase step)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git push fails
      mockExecFile.mockRejectedValueOnce(new Error('remote: Permission denied'));

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
      mockExecFile.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });
      // git add (stage)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached --name-only (staging verification)
      mockExecFile.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // git diff --cached --diff-filter=ACMR (prettier list)
      mockExecFile.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // node prettier fails (non-fatal)
      mockExecFile.mockRejectedValueOnce(new Error('prettier not found'));
      // git commit succeeds
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git fetch origin dev (rebase step)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git rebase origin/dev (rebase step)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git push --force-with-lease succeeds
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
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
      mockExecFile.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });
      // git add (stage)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached --name-only (staging verification)
      mockExecFile.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // git diff --cached --diff-filter=ACMR (prettier list)
      mockExecFile.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // node prettier --write
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git add (re-stage after prettier)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git commit (execFile)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git fetch origin dev (rebase step)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git rebase origin/dev FAILS with CONFLICT
      mockExecFile.mockRejectedValueOnce(
        new Error('CONFLICT (content): Merge conflict in src/index.ts')
      );
      // git rebase --abort (best-effort)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git push (NO --force-with-lease since rebase was aborted)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
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
      mockExecFile.mockResolvedValueOnce({ stdout: 'M  src/index.ts\n', stderr: '' });
      // git add (stage)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git diff --cached --name-only (staging verification)
      mockExecFile.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // git diff --cached --diff-filter=ACMR (prettier list)
      mockExecFile.mockResolvedValueOnce({ stdout: 'src/index.ts\n', stderr: '' });
      // node prettier --write
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git add (re-stage after prettier)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git commit (execFile)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git fetch origin dev — fails (network error)
      mockExecFile.mockRejectedValueOnce(new Error('fatal: unable to access remote'));
      // git rebase --abort (best-effort after non-conflict failure)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // git push (NO --force-with-lease)
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
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

  describe('recoverNestedWorktreeWork', () => {
    let tempMainWorktree: string;
    let tempNestedWorktree: string;

    afterEach(async () => {
      try {
        await fs.rm(tempMainWorktree, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    });

    it('applies deletes, renames, and modified files from nested worktree', async () => {
      // Create main worktree with initial files
      tempMainWorktree = await fs.mkdtemp(path.join(os.tmpdir(), 'main-wt-'));
      tempNestedWorktree = path.join(tempMainWorktree, '.claude', 'worktrees', 'agent-test');
      await fs.mkdir(tempNestedWorktree, { recursive: true });

      // a.ts — will be deleted in nested (D status)
      await fs.writeFile(path.join(tempMainWorktree, 'a.ts'), 'deleted content');
      await fs.writeFile(path.join(tempNestedWorktree, 'a.ts'), 'deleted content');

      // b.ts → c.ts — will be renamed in nested (R status)
      await fs.writeFile(path.join(tempMainWorktree, 'b.ts'), 'old name');
      await fs.writeFile(path.join(tempNestedWorktree, 'c.ts'), 'renamed content');

      // d.ts — modified in nested (M status)
      await fs.writeFile(path.join(tempMainWorktree, 'd.ts'), 'original');
      await fs.writeFile(path.join(tempNestedWorktree, 'd.ts'), 'modified');

      // Mock git status --short for the nested worktree
      // D = deleted, R = renamed, M = modified
      const statusOutput = 'D  a.ts\nR100 b.ts -> c.ts\nM  d.ts\n';

      mockExecFile
        // git status --short (nested worktree)
        .mockResolvedValueOnce({ stdout: statusOutput, stderr: '' });

      const result = await recoverNestedWorktreeWork(tempMainWorktree);

      expect(result.found).toBe(true);
      expect(result.worktreesWithChanges).toContain(tempNestedWorktree);

      // a.ts should be removed from main worktree (was deleted in nested)
      try {
        await fs.access(path.join(tempMainWorktree, 'a.ts'));
        expect(false).toBe(true); // Should not reach here
      } catch {
        // Expected — file was deleted
      }

      // b.ts should be removed from main worktree (was renamed in nested)
      try {
        await fs.access(path.join(tempMainWorktree, 'b.ts'));
        expect(false).toBe(true); // Should not reach here
      } catch {
        // Expected — old path was removed
      }

      // c.ts should exist in main worktree (rename target)
      const cContent = await fs.readFile(path.join(tempMainWorktree, 'c.ts'), 'utf-8');
      expect(cContent).toBe('renamed content');

      // d.ts should have modified content in main worktree
      const dContent = await fs.readFile(path.join(tempMainWorktree, 'd.ts'), 'utf-8');
      expect(dContent).toBe('modified');

      // Nested worktree should be cleaned up
      try {
        await fs.access(tempNestedWorktree);
        expect(false).toBe(true); // Should not reach here
      } catch {
        // Expected — nested worktree was removed
      }

      expect(result.errors).toHaveLength(0);
    });
  });
});
