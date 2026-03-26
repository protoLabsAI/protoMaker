/**
 * Unit tests for the PR creation recovery path in GitWorkflowService.
 *
 * Covers the bug where `gh pr create` returning "already exists" would
 * permanently block a feature. The fix uses `gh pr list --state all` to
 * find the existing PR and return prAlreadyExisted: true without throwing.
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
  buildGitAddCommand: vi.fn().mockReturnValue(['git', 'add', '-A']),
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
    getGitRepositoryDiffs: vi.fn().mockResolvedValue(''),
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
import { updateWorktreePRInfo } from '@/lib/worktree-metadata.js';
import type { Feature } from '@protolabsai/types';

// When exec is mocked with vi.fn(), promisify uses standard (non-custom) behavior:
// it resolves with the first value after err. So we must pass a single {stdout,stderr}
// object as the result arg — not separate stdout/stderr strings — so the service's
// `const { stdout } = await execAsync(...)` destructuring works correctly.
type ExecResultCallback = (err: Error | null, result?: { stdout: string; stderr: string }) => void;

type ExecFileCallback = (err: Error | null, result?: { stdout: string; stderr: string }) => void;

/**
 * Build an exec mock that responds to calls in order from the provided queue.
 * Each entry is either `{ stdout }` for success or `{ error }` for failure.
 */
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

/**
 * Build an execFile mock that responds to calls in order from the provided queue.
 * Each entry is either `{ stdout }` for success or `{ error }` for failure.
 * Supports the execFile signature: (file, args, opts, cb).
 */
function makeExecFileQueue(
  responses: Array<{ stdout: string } | { error: Error }>
): ReturnType<typeof vi.fn> {
  let idx = 0;
  return vi.fn((_file: string, _args: string[], _optsOrCb: unknown, maybeCb?: unknown) => {
    const cb: ExecFileCallback =
      typeof _optsOrCb === 'function'
        ? (_optsOrCb as ExecFileCallback)
        : (maybeCb as ExecFileCallback);
    const response = responses[idx++];
    if (!response) {
      throw new Error(
        `makeExecFileQueue: unexpected execFile call #${idx} (only ${responses.length} provided). File: ${_file}, Args: ${JSON.stringify(_args)}`
      );
    }
    if ('error' in response) {
      cb(response.error, { stdout: '', stderr: response.error.message });
    } else {
      cb(null, { stdout: response.stdout, stderr: '' });
    }
    return {} as ReturnType<typeof execFile>;
  });
}

const FAKE_FEATURE: Feature = {
  id: 'feat-test-recovery',
  title: 'Test PR Recovery Feature',
  description: 'Tests the recovery path for already-existing PRs',
  status: 'in_progress',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const WORK_DIR = '/project/.worktrees/feat-test-recovery';
const PROJECT_PATH = '/project';
const BRANCH_NAME = 'feat-test-recovery';
const BASE_BRANCH = 'dev';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GitWorkflowService – createPullRequest recovery path', () => {
  let service: { createPullRequest: (...args: unknown[]) => Promise<unknown> };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Bypass retry delays so tests run fast
    vi.spyOn(global, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    const mod = await import('@/services/git-workflow-service.js');
    const { GitWorkflowService } = mod as unknown as {
      GitWorkflowService: new () => typeof service & {
        validateCIWorkflowTriggers: () => Promise<void>;
      };
    };
    const instance = new GitWorkflowService();
    // Silence the CI workflow validator — not relevant to these tests
    vi.spyOn(instance as never, 'validateCIWorkflowTriggers').mockResolvedValue(undefined);
    service = instance as unknown as typeof service;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── exec response builders ────────────────────────────────────────────────

  /** Standard exec preamble: gh available + git remote -v (shell commands only) */
  function preambleResponses(): Array<{ stdout: string } | { error: Error }> {
    return [
      { stdout: '/usr/bin/gh\n' }, // command -v gh
      { stdout: 'origin\thttps://github.com/org/repo.git (fetch)\n' }, // git remote -v
    ];
  }

  it('returns prAlreadyExisted:true when recovery finds an OPEN PR', async () => {
    const alreadyExistsError = new Error(
      'a pull request for branch "feat-test-recovery" already exists'
    );

    vi.mocked(exec).mockImplementation(
      makeExecQueue([...preambleResponses()]) as ReturnType<typeof exec>
    );
    vi.mocked(execFile).mockImplementation(
      makeExecFileQueue([
        { stdout: '[]' }, // pre-check: no open PRs
        { error: alreadyExistsError }, // gh pr create attempt 1
        { error: alreadyExistsError }, // gh pr create attempt 2 (retry)
        { error: alreadyExistsError }, // gh pr create attempt 3 (retry, final)
        {
          stdout: JSON.stringify([
            {
              number: 42,
              title: 'Test PR Recovery Feature',
              url: 'https://github.com/org/repo/pull/42',
              state: 'OPEN',
            },
          ]),
        }, // gh pr list --state all (recovery)
      ]) as ReturnType<typeof execFile>
    );

    const result = await service.createPullRequest(
      WORK_DIR,
      PROJECT_PATH,
      FAKE_FEATURE,
      BRANCH_NAME,
      BASE_BRANCH
    );

    expect(result).toMatchObject({
      prUrl: 'https://github.com/org/repo/pull/42',
      prNumber: 42,
      prAlreadyExisted: true,
    });
    expect(vi.mocked(updateWorktreePRInfo)).toHaveBeenCalledOnce();
  });

  it('returns prAlreadyExisted:true when recovery finds a MERGED PR', async () => {
    const alreadyExistsError = new Error(
      'a pull request for branch "feat-test-recovery" already exists'
    );

    vi.mocked(exec).mockImplementation(
      makeExecQueue([...preambleResponses()]) as ReturnType<typeof exec>
    );
    vi.mocked(execFile).mockImplementation(
      makeExecFileQueue([
        { stdout: '[]' }, // pre-check: no open PRs
        { error: alreadyExistsError }, // gh pr create attempt 1
        { error: alreadyExistsError }, // gh pr create attempt 2 (retry)
        { error: alreadyExistsError }, // gh pr create attempt 3 (retry, final)
        {
          stdout: JSON.stringify([
            {
              number: 99,
              title: 'Test PR Recovery Feature',
              url: 'https://github.com/org/repo/pull/99',
              state: 'MERGED',
            },
          ]),
        }, // recovery
      ]) as ReturnType<typeof execFile>
    );

    const result = await service.createPullRequest(
      WORK_DIR,
      PROJECT_PATH,
      FAKE_FEATURE,
      BRANCH_NAME,
      BASE_BRANCH
    );

    expect(result).toMatchObject({
      prUrl: 'https://github.com/org/repo/pull/99',
      prNumber: 99,
      prAlreadyExisted: true,
    });
  });

  it('returns prAlreadyExisted:true when recovery finds a CLOSED PR', async () => {
    const alreadyExistsError = new Error(
      'a pull request for branch "feat-test-recovery" already exists'
    );

    vi.mocked(exec).mockImplementation(
      makeExecQueue([...preambleResponses()]) as ReturnType<typeof exec>
    );
    vi.mocked(execFile).mockImplementation(
      makeExecFileQueue([
        { stdout: '[]' }, // pre-check: no open PRs
        { error: alreadyExistsError }, // gh pr create attempt 1
        { error: alreadyExistsError }, // gh pr create attempt 2 (retry)
        { error: alreadyExistsError }, // gh pr create attempt 3 (retry, final)
        {
          stdout: JSON.stringify([
            {
              number: 7,
              title: 'Test PR Recovery Feature',
              url: 'https://github.com/org/repo/pull/7',
              state: 'CLOSED',
            },
          ]),
        }, // recovery
      ]) as ReturnType<typeof execFile>
    );

    const result = await service.createPullRequest(
      WORK_DIR,
      PROJECT_PATH,
      FAKE_FEATURE,
      BRANCH_NAME,
      BASE_BRANCH
    );

    expect(result).toMatchObject({
      prAlreadyExisted: true,
      prNumber: 7,
    });
  });

  it('rethrows the original error when recovery finds no PR', async () => {
    const alreadyExistsError = new Error(
      'a pull request for branch "feat-test-recovery" already exists'
    );

    vi.mocked(exec).mockImplementation(
      makeExecQueue([...preambleResponses()]) as ReturnType<typeof exec>
    );
    vi.mocked(execFile).mockImplementation(
      makeExecFileQueue([
        { stdout: '[]' }, // pre-check: no open PRs
        { error: alreadyExistsError }, // gh pr create attempt 1
        { error: alreadyExistsError }, // gh pr create attempt 2 (retry)
        { error: alreadyExistsError }, // gh pr create attempt 3 (retry, final)
        { stdout: '[]' }, // recovery: empty list
      ]) as ReturnType<typeof execFile>
    );

    await expect(
      service.createPullRequest(WORK_DIR, PROJECT_PATH, FAKE_FEATURE, BRANCH_NAME, BASE_BRANCH)
    ).rejects.toThrow(alreadyExistsError);
  });

  it('rethrows the original error when recovery gh pr list itself throws', async () => {
    const alreadyExistsError = new Error(
      'a pull request for branch "feat-test-recovery" already exists'
    );

    vi.mocked(exec).mockImplementation(
      makeExecQueue([...preambleResponses()]) as ReturnType<typeof exec>
    );
    vi.mocked(execFile).mockImplementation(
      makeExecFileQueue([
        { stdout: '[]' }, // pre-check: no open PRs
        { error: alreadyExistsError }, // gh pr create attempt 1
        { error: alreadyExistsError }, // gh pr create attempt 2 (retry)
        { error: alreadyExistsError }, // gh pr create attempt 3 (retry, final)
        { error: new Error('gh: not authenticated') }, // recovery fails
      ]) as ReturnType<typeof execFile>
    );

    await expect(
      service.createPullRequest(WORK_DIR, PROJECT_PATH, FAKE_FEATURE, BRANCH_NAME, BASE_BRANCH)
    ).rejects.toThrow(alreadyExistsError);
  });

  it('pre-check short-circuits creation when an OPEN PR already exists', async () => {
    // Pre-check finds an open PR immediately — no gh pr create call at all
    vi.mocked(exec).mockImplementation(
      makeExecQueue([
        { stdout: '/usr/bin/gh\n' }, // command -v gh
        { stdout: 'origin\thttps://github.com/org/repo.git (fetch)\n' }, // git remote -v
      ]) as ReturnType<typeof exec>
    );
    // Pre-check via execFileAsync finds the open PR — creation is skipped
    vi.mocked(execFile).mockImplementation(
      makeExecFileQueue([
        {
          stdout: JSON.stringify([
            {
              number: 55,
              title: 'Existing PR',
              url: 'https://github.com/org/repo/pull/55',
              state: 'OPEN',
            },
          ]),
        }, // gh pr list (pre-check finds it)
      ]) as ReturnType<typeof execFile>
    );

    const result = await service.createPullRequest(
      WORK_DIR,
      PROJECT_PATH,
      FAKE_FEATURE,
      BRANCH_NAME,
      BASE_BRANCH
    );

    expect(result).toMatchObject({
      prUrl: 'https://github.com/org/repo/pull/55',
      prNumber: 55,
      prAlreadyExisted: true,
    });
    // Only 1 execFile call (pre-check), no create or recovery
    expect(vi.mocked(execFile)).toHaveBeenCalledTimes(1);
  });
});
