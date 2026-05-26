/**
 * Unit tests for lockfile-sync enforcement in GitWorkflowService.commitChanges().
 *
 * Covers:
 * - No-op when no package.json manifest changed
 * - Sync + stage when manifest changed
 * - Gate off when syncLockfileOnManifestChange is false
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks (hoisted) ──────────────────────────────────────────────────

vi.mock('child_process', () => {
  const exec = vi.fn();
  const execFile = vi.fn();
  return { exec, execFile };
});

vi.mock('@/lib/worktree-metadata.js', () => ({
  updateWorktreePRInfo: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/routes/github/utils/pr-ownership.js', () => ({
  buildPROwnershipWatermark: vi.fn().mockReturnValue('<!-- watermark -->'),
}));

vi.mock('@/lib/git-staging-utils.js', () => ({
  buildGitAddCommand: vi.fn().mockReturnValue('git add -A'),
}));

vi.mock('@/services/github-merge-service.js', () => ({
  githubMergeService: { checkPRStatus: vi.fn() },
}));

vi.mock('@/services/coderabbit-resolver-service.js', () => ({
  codeRabbitResolverService: { resolveThreads: vi.fn() },
}));

vi.mock('@protolabsai/git-utils', async () => {
  const actual =
    await vi.importActual<typeof import('@protolabsai/git-utils')>('@protolabsai/git-utils');
  return {
    ...actual,
    createGitExecEnv: vi.fn().mockReturnValue({}),
    extractTitleFromDescription: vi.fn().mockReturnValue('Test Feature'),
  };
});

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual('@protolabsai/utils');
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  return { ...actual, createLogger: () => mockLogger };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { exec, execFile } from 'child_process';
import type { Feature } from '@protolabsai/types';

type ExecResultCallback = (err: Error | null, result?: { stdout: string; stderr: string }) => void;

function makeExecQueue(
  responses: Array<{ stdout: string } | { error: Error }>
): ReturnType<typeof vi.fn> {
  let idx = 0;
  return vi.fn((_cmd: string, _optsOrCb: unknown, maybeCb?: unknown) => {
    const cb: ExecResultCallback =
      typeof _optsOrCb === 'function'
        ? (_optsOrCb as ExecResultCallback)
        : (maybeCb as ExecResultCallback);
    const response = responses[idx++];
    if (!response) {
      throw new Error(
        `makeExecQueue: unexpected exec call #${idx} (only ${responses.length} responses provided). Command: ${_cmd}`
      );
    }
    if ('error' in response) {
      cb(response.error);
    } else {
      cb(null, { stdout: response.stdout, stderr: '' });
    }
    return {} as ReturnType<typeof exec>;
  });
}

const FAKE_FEATURE: Feature = {
  id: 'feat-lockfile-sync',
  title: 'Test Lockfile Sync Feature',
  description: 'Tests lockfile sync enforcement',
  status: 'in_progress',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const WORK_DIR = '/project/.worktrees/feat-lockfile-sync';
const PROJECT_PATH = '/project';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GitWorkflowService – lockfile sync on manifest change', () => {
  let service: { commitChanges: (...args: unknown[]) => Promise<string | null> };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Bypass retry delays so tests run fast
    vi.spyOn(global, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    const mod = await import('@/services/git-workflow-service.js');
    const { GitWorkflowService } = mod as unknown as {
      GitWorkflowService: new () => typeof service;
    };
    service = new GitWorkflowService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a no-op when no package.json manifest changed', async () => {
    // git status (has changes), git add, hasManifestChange (no package.json),
    // git diff --cached (no formattable files), generateChangeset (no staged libs/),
    // git commit (execFile), git rev-parse HEAD
    vi.mocked(exec).mockImplementation(
      makeExecQueue([
        { stdout: ' M someFile.ts\n' }, // git status --porcelain
        { stdout: '' }, // git add -A
        { stdout: '' }, // hasManifestChange: no package.json in staged
        { stdout: '' }, // git diff --cached (no formattable files)
        { stdout: 'someFile.ts\n' }, // generateChangeset: staged files (no libs/ touched)
        { stdout: 'abc12345\n' }, // git rev-parse HEAD
      ]) as ReturnType<typeof exec>
    );
    vi.mocked(execFile).mockImplementation(
      vi.fn((_file: string, _args: string[], _optsOrCb: unknown, maybeCb?: unknown) => {
        const cb: ExecResultCallback =
          typeof _optsOrCb === 'function' ? _optsOrCb : (maybeCb as ExecResultCallback);
        cb(null, { stdout: '', stderr: '' });
        return {} as ReturnType<typeof execFile>;
      }) as ReturnType<typeof execFile>
    );

    const result = await service.commitChanges(
      WORK_DIR,
      FAKE_FEATURE,
      PROJECT_PATH,
      undefined,
      true,
      true
    );

    expect(result).toBe('abc12345');

    // Verify npm install was NOT called
    const execCalls = vi.mocked(exec).mock.calls;
    const npmInstallCalled = execCalls.some(
      (call) => typeof call[0] === 'string' && call[0].includes('npm install')
    );
    expect(npmInstallCalled).toBe(false);
  });

  it('syncs and stages lockfile when package.json changed', async () => {
    // git status, git add, hasManifestChange (package.json found),
    // npm install (exec), git add package-lock.json, git add -- '*.lock' ...,
    // git diff --cached (no formattable files), generateChangeset (no staged libs/),
    // git rev-parse HEAD
    vi.mocked(exec).mockImplementation(
      makeExecQueue([
        { stdout: ' M package.json\n M src/index.ts\n' }, // git status
        { stdout: '' }, // git add -A
        { stdout: 'package.json\n' }, // hasManifestChange: package.json is staged
        { stdout: '' }, // npm install --package-lock-only --ignore-scripts
        { stdout: '' }, // git add package-lock.json
        { error: new Error('nothing to stage') }, // git add -- '*.lock' ... (no other locks)
        { stdout: '' }, // git diff --cached (no formattable files)
        { stdout: 'package.json\nsrc/index.ts\n' }, // generateChangeset staged files
        { stdout: 'def67890\n' }, // git rev-parse HEAD
      ]) as ReturnType<typeof exec>
    );
    vi.mocked(execFile).mockImplementation(
      vi.fn((_file: string, _args: string[], _optsOrCb: unknown, maybeCb?: unknown) => {
        const cb: ExecResultCallback =
          typeof _optsOrCb === 'function' ? _optsOrCb : (maybeCb as ExecResultCallback);
        cb(null, { stdout: '', stderr: '' });
        return {} as ReturnType<typeof execFile>;
      }) as ReturnType<typeof execFile>
    );

    const result = await service.commitChanges(
      WORK_DIR,
      FAKE_FEATURE,
      PROJECT_PATH,
      undefined,
      true,
      true
    );

    expect(result).toBe('def67890');

    // Verify npm install WAS called
    const execCalls = vi.mocked(exec).mock.calls;
    const npmInstallCalled = execCalls.some(
      (call) => typeof call[0] === 'string' && call[0].includes('npm install')
    );
    expect(npmInstallCalled).toBe(true);

    // Verify it ran from projectPath (repo root), not workDir
    const npmInstallCall = execCalls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('npm install')
    );
    expect(npmInstallCall).toBeDefined();
    const npmOpts = npmInstallCall![1] as { cwd?: string };
    expect(npmOpts.cwd).toBe(PROJECT_PATH);
  });

  it('skips lockfile sync when syncLockfileOnManifestChange is false', async () => {
    // git status, git add, git diff --cached, generateChangeset, git rev-parse HEAD
    vi.mocked(exec).mockImplementation(
      makeExecQueue([
        { stdout: ' M package.json\n' }, // git status
        { stdout: '' }, // git add -A
        { stdout: '' }, // git diff --cached (no formattable files)
        { stdout: 'package.json\n' }, // generateChangeset staged files
        { stdout: 'abc12345\n' }, // git rev-parse HEAD
      ]) as ReturnType<typeof exec>
    );
    vi.mocked(execFile).mockImplementation(
      vi.fn((_file: string, _args: string[], _optsOrCb: unknown, maybeCb?: unknown) => {
        const cb: ExecResultCallback =
          typeof _optsOrCb === 'function' ? _optsOrCb : (maybeCb as ExecResultCallback);
        cb(null, { stdout: '', stderr: '' });
        return {} as ReturnType<typeof execFile>;
      }) as ReturnType<typeof execFile>
    );

    const result = await service.commitChanges(
      WORK_DIR,
      FAKE_FEATURE,
      PROJECT_PATH,
      undefined,
      true,
      false // syncLockfileOnManifestChange = false
    );

    expect(result).toBe('abc12345');

    // Verify npm install was NOT called
    const execCalls = vi.mocked(exec).mock.calls;
    const npmInstallCalled = execCalls.some(
      (call) => typeof call[0] === 'string' && call[0].includes('npm install')
    );
    expect(npmInstallCalled).toBe(false);
  });
});
