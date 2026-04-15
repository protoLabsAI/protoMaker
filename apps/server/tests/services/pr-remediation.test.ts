/**
 * PR Format Remediation — Comprehensive Test Suite
 *
 * Coverage:
 * - Successful remediation (single file, multiple files)
 * - Scope-check validation (out-of-scope drift detected → escalated)
 * - Loop prevention (one-per-PR cap → skipped)
 * - Agent-author verification (non-agent branch → skipped)
 * - Protected branch rejection (main/staging/dev → skipped)
 * - HITL escalation paths (prettier error, push error, scope drift)
 * - pr:remediation-completed event emission on success
 * - Synthesized unformatted PR scenario (regression)
 * - GitHubWebhookHandler: filters non-format CI failures correctly
 * - GitHubWebhookHandler: triggers remediation on format failure confirmation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks (hoisted — declared before any imports)
// ---------------------------------------------------------------------------

// Mock the PrRemediationWorker class so we can control each method in isolation
const mockWorker = {
  createScratchDir: vi.fn(),
  runGit: vi.fn(),
  runGitSafe: vi.fn(),
  getChangedFiles: vi.fn(),
  runPrettier: vi.fn(),
  getModifiedFiles: vi.fn(),
  commitRemediationFix: vi.fn(),
  pushBranch: vi.fn(),
  hasExistingRemediationCommit: vi.fn(),
  cleanup: vi.fn(),
};

vi.mock('../../src/services/pr-remediation-worker.js', () => ({
  PrRemediationWorker: vi.fn().mockImplementation(() => mockWorker),
}));

// Mock child_process.exec — used by promisify() inside remediateFormatFailure
const mockExec = vi.fn();
vi.mock('node:child_process', () => ({
  exec: mockExec,
}));

// Mock fs/promises for PrRemediationWorker base class tests
vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/pr-remediation-test123'),
  rm: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { remediateFormatFailure } from '../../src/services/pr-remediation-service.js';
import { GitHubWebhookHandler } from '../../src/services/github-webhook-handler.js';
import { PrRemediationWorker } from '../../src/services/pr-remediation-worker.js';
import type { EventEmitter } from '../../src/lib/events.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Minimal EventEmitter stub for testing event emission.
 */
function makeEventEmitter() {
  const handlers: Array<(type: string, payload: unknown) => void> = [];
  const emitted: Array<{ type: string; payload: unknown }> = [];

  return {
    subscribe: vi.fn((cb: (type: string, payload: unknown) => void) => {
      handlers.push(cb);
      const unsub = () => {
        const idx = handlers.indexOf(cb);
        if (idx !== -1) handlers.splice(idx, 1);
      };
      return Object.assign(unsub, { unsubscribe: unsub });
    }),
    emit: vi.fn((type: string, payload: unknown) => {
      emitted.push({ type, payload });
      handlers.forEach((h) => h(type, payload));
    }),
    on: vi.fn(),
    getEmitted: () => emitted,
  };
}

/**
 * Configure the exec mock to respond like a working environment.
 *
 * The promisify() wrapper calls exec with a callback:
 *   exec(cmd, opts, callback)
 * The callback receives (error, { stdout, stderr }).
 *
 * `overrides` maps substrings to either a stdout string or an Error to throw.
 */
function setupExecMock(overrides: Record<string, string | Error> = {}): void {
  mockExec.mockImplementation(
    (
      cmd: string,
      _opts: unknown,
      cb: (err: Error | null, result: { stdout: string; stderr: string }) => void
    ) => {
      // Check each override key as a substring of cmd
      for (const [pattern, response] of Object.entries(overrides)) {
        if (cmd.includes(pattern)) {
          if (response instanceof Error) {
            cb(response, { stdout: '', stderr: response.message });
          } else {
            cb(null, { stdout: response, stderr: '' });
          }
          return;
        }
      }

      // Default responses
      if (cmd.includes('test -d')) {
        // Worktree exists
        cb(null, { stdout: '', stderr: '' });
        return;
      }
      if (cmd.includes('gh pr view') && cmd.includes('baseRefName')) {
        cb(null, { stdout: JSON.stringify({ baseRefName: 'dev' }), stderr: '' });
        return;
      }
      if (cmd.includes('gh pr diff') && cmd.includes('--name-only')) {
        cb(null, { stdout: 'src/index.ts\nsrc/utils.ts', stderr: '' });
        return;
      }
      if (cmd.includes('gh api') && cmd.includes('check-runs')) {
        cb(null, {
          stdout: JSON.stringify({
            total_count: 1,
            check_runs: [
              { id: 1, name: 'Check formatting', status: 'completed', conclusion: 'failure' },
            ],
          }),
          stderr: '',
        });
        return;
      }

      cb(null, { stdout: '', stderr: '' });
    }
  );
}

/**
 * Standard happy-path worker mock setup.
 * Override individual methods in tests as needed.
 */
function setupHappyPathWorker(): void {
  mockWorker.hasExistingRemediationCommit.mockResolvedValue(false);
  mockWorker.runPrettier.mockResolvedValue(['src/index.ts']);
  mockWorker.getModifiedFiles.mockResolvedValue(['src/index.ts']);
  mockWorker.commitRemediationFix.mockResolvedValue('abc123sha');
  mockWorker.pushBranch.mockResolvedValue(undefined);
  mockWorker.cleanup.mockResolvedValue(undefined);
  mockWorker.createScratchDir.mockResolvedValue('/tmp/pr-remediation-scratch');
}

// ---------------------------------------------------------------------------
// Test suite: safety guards
// ---------------------------------------------------------------------------

describe('safety guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupExecMock();
    setupHappyPathWorker();
  });

  it('protected branch — main — returns skipped', async () => {
    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 1,
      headBranch: 'main',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toMatch(/protected/i);
    expect(result.details?.guard).toBe('protected-branch');
    // Should never proceed to git operations for protected branches
    expect(mockWorker.runPrettier).not.toHaveBeenCalled();
  });

  it('protected branch — staging — returns skipped', async () => {
    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 2,
      headBranch: 'staging',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('skipped');
    expect(result.details?.guard).toBe('protected-branch');
  });

  it('protected branch — dev — returns skipped', async () => {
    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 3,
      headBranch: 'dev',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('skipped');
    expect(result.details?.guard).toBe('protected-branch');
  });

  it('non-agent branch — no recognized prefix — returns skipped', async () => {
    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 4,
      headBranch: 'johns-random-branch',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('skipped');
    expect(result.details?.guard).toBe('agent-author');
    expect(mockWorker.runPrettier).not.toHaveBeenCalled();
  });

  it('agent branch — feature/ prefix — passes agent guard', async () => {
    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 5,
      headBranch: 'feature/my-feature-abc123',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    // Should NOT be skipped due to agent-author guard
    expect(result.details?.guard).not.toBe('agent-author');
  });

  it('agent branch — fix/ prefix — passes agent guard', async () => {
    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 6,
      headBranch: 'fix/bug-fix-xyz',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.details?.guard).not.toBe('agent-author');
  });

  it('one-remediation cap — existing commit found — returns skipped', async () => {
    mockWorker.hasExistingRemediationCommit.mockResolvedValue(true);

    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 7,
      headBranch: 'feature/auth-abc',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('skipped');
    expect(result.details?.guard).toBe('one-per-pr-cap');
    expect(result.reason).toMatch(/cap/i);
    expect(mockWorker.runPrettier).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test suite: successful remediation
// ---------------------------------------------------------------------------

describe('successful remediation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupExecMock();
    setupHappyPathWorker();
  });

  it('single file — returns success with filesFixed and commitSha', async () => {
    mockWorker.runPrettier.mockResolvedValue(['src/index.ts']);
    mockWorker.getModifiedFiles.mockResolvedValue(['src/index.ts']);
    mockWorker.commitRemediationFix.mockResolvedValue('deadbeef1234');

    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 10,
      headBranch: 'feature/auth-login-abc',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('success');
    expect(result.filesFixed).toEqual(['src/index.ts']);
    expect(result.commitSha).toBe('deadbeef1234');
    expect(result.reason).toMatch(/deadbeef1234/);
  });

  it('multiple files — returns all fixed files', async () => {
    setupExecMock({
      'gh pr diff': 'src/index.ts\nsrc/utils.ts\nsrc/helpers.ts',
    });
    mockWorker.runPrettier.mockResolvedValue(['src/index.ts', 'src/utils.ts', 'src/helpers.ts']);
    mockWorker.getModifiedFiles.mockResolvedValue([
      'src/index.ts',
      'src/utils.ts',
      'src/helpers.ts',
    ]);
    mockWorker.commitRemediationFix.mockResolvedValue('sha-multi');

    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 11,
      headBranch: 'feature/multi-file-xyz',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('success');
    expect(result.filesFixed).toHaveLength(3);
    expect(result.filesFixed).toContain('src/utils.ts');
  });

  it('emits pr:remediation-completed event on success', async () => {
    mockWorker.runPrettier.mockResolvedValue(['src/index.ts']);
    mockWorker.commitRemediationFix.mockResolvedValue('event-test-sha');

    const events = makeEventEmitter();

    await remediateFormatFailure(
      {
        projectPath: '/project',
        prNumber: 12,
        headBranch: 'feature/event-test-abc',
        headSha: 'abc',
        repository: 'owner/repo',
      },
      events as unknown as EventEmitter
    );

    const emitted = events.getEmitted();
    const remediationEvent = emitted.find((e) => e.type === 'pr:remediation-completed');
    expect(remediationEvent).toBeDefined();
    const p = remediationEvent?.payload as { prNumber: number; remediationType: string };
    expect(p.prNumber).toBe(12);
    expect(p.remediationType).toBe('format');
  });

  it('prettier makes no changes — returns skipped (not an error)', async () => {
    mockWorker.runPrettier.mockResolvedValue([]); // no files modified

    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 13,
      headBranch: 'feature/already-formatted-abc',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toMatch(/no changes/i);
    expect(mockWorker.commitRemediationFix).not.toHaveBeenCalled();
    expect(mockWorker.pushBranch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test suite: scope checker and drift detection
// ---------------------------------------------------------------------------

describe('scope checker and drift detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPathWorker();
  });

  it('out-of-scope file detected — returns escalated without pushing', async () => {
    // PR only changed src/index.ts, but prettier also touched src/unrelated.ts
    setupExecMock({
      'gh pr diff': 'src/index.ts',
    });
    // Worker reports both files modified
    mockWorker.runPrettier.mockResolvedValue(['src/index.ts', 'src/unrelated.ts']);
    mockWorker.getModifiedFiles.mockResolvedValue(['src/index.ts', 'src/unrelated.ts']);

    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 20,
      headBranch: 'feature/scope-drift-abc',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('escalated');
    expect(result.reason).toMatch(/scope drift/i);
    expect(result.details?.guard).toBe('scope-check');
    expect((result.details?.outOfScope as string[])?.includes('src/unrelated.ts')).toBe(true);
    // Must NOT push when scope drift detected
    expect(mockWorker.pushBranch).not.toHaveBeenCalled();
    expect(mockWorker.commitRemediationFix).not.toHaveBeenCalled();
  });

  it('all modified files within PR diff — no escalation, pushes successfully', async () => {
    setupExecMock({
      'gh pr diff': 'src/index.ts\nsrc/unrelated.ts',
    });
    // Both files are in the PR diff AND were modified by prettier
    mockWorker.runPrettier.mockResolvedValue(['src/index.ts', 'src/unrelated.ts']);
    mockWorker.getModifiedFiles.mockResolvedValue(['src/index.ts', 'src/unrelated.ts']);
    mockWorker.commitRemediationFix.mockResolvedValue('no-drift-sha');

    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 21,
      headBranch: 'feature/no-drift-abc',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('success');
    expect(mockWorker.pushBranch).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Test suite: HITL escalation paths
// ---------------------------------------------------------------------------

describe('hitl escalation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupExecMock();
    setupHappyPathWorker();
  });

  it('prettier execution error — returns escalated without pushing', async () => {
    mockWorker.runPrettier.mockRejectedValue(new Error('Prettier binary not found'));

    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 30,
      headBranch: 'feature/prettier-fail-abc',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('escalated');
    expect(result.reason).toMatch(/prettier execution failed/i);
    expect(mockWorker.pushBranch).not.toHaveBeenCalled();
  });

  it('push failure — returns escalated with commitSha in details', async () => {
    mockWorker.runPrettier.mockResolvedValue(['src/index.ts']);
    mockWorker.commitRemediationFix.mockResolvedValue('sha789-committed');
    mockWorker.pushBranch.mockRejectedValue(new Error('Permission denied'));

    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 31,
      headBranch: 'feature/push-fail-abc',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('escalated');
    expect(result.details?.commitSha).toBe('sha789-committed');
    expect(result.reason).toMatch(/push failed/i);
  });

  it('commit failure — returns escalated', async () => {
    mockWorker.runPrettier.mockResolvedValue(['src/index.ts']);
    mockWorker.commitRemediationFix.mockRejectedValue(new Error('nothing to commit'));

    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 32,
      headBranch: 'feature/commit-fail-abc',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('escalated');
    expect(result.reason).toMatch(/commit failed/i);
  });

  it('PR diff fetch failure — returns error', async () => {
    setupExecMock({
      'gh pr diff': new Error('gh: authentication failed'),
    });

    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 33,
      headBranch: 'feature/diff-fail-abc',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('error');
    expect(result.details?.guard).toBe('pr-diff-fetch');
    expect(mockWorker.runPrettier).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test suite: regression — synthesized unformatted PR scenario
// ---------------------------------------------------------------------------

describe('regression: synthesized unformatted PR', () => {
  it('formats known bad file and produces the correct remediation commit', async () => {
    vi.clearAllMocks();
    setupExecMock({
      'gh pr diff': 'src/badly-formatted.ts',
    });

    mockWorker.hasExistingRemediationCommit.mockResolvedValue(false);
    mockWorker.runPrettier.mockResolvedValue(['src/badly-formatted.ts']);
    mockWorker.getModifiedFiles.mockResolvedValue(['src/badly-formatted.ts']);
    mockWorker.commitRemediationFix.mockResolvedValue('format-fix-sha-001');
    mockWorker.pushBranch.mockResolvedValue(undefined);
    mockWorker.cleanup.mockResolvedValue(undefined);

    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 100,
      headBranch: 'feature/unformatted-regression-abc',
      headSha: 'badsha',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('success');
    expect(result.filesFixed).toEqual(['src/badly-formatted.ts']);
    expect(result.commitSha).toBe('format-fix-sha-001');
    // Verify commitRemediationFix was called with the expected arguments
    expect(mockWorker.commitRemediationFix).toHaveBeenCalledWith(
      expect.any(String), // workDir (worktree path)
      100, // prNumber
      ['src/badly-formatted.ts']
    );
    // Verify push was called
    expect(mockWorker.pushBranch).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Test suite: one remediation per PR cap
// ---------------------------------------------------------------------------

describe('one remediation per PR cap', () => {
  it('skips if an existing auto-remediation commit is found', async () => {
    vi.clearAllMocks();
    setupExecMock();
    mockWorker.hasExistingRemediationCommit.mockResolvedValue(true);
    mockWorker.cleanup.mockResolvedValue(undefined);

    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 60,
      headBranch: 'feature/repeat-remediation-abc',
      headSha: 'sha',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('skipped');
    expect(result.details?.guard).toBe('one-per-pr-cap');
    expect(mockWorker.runPrettier).not.toHaveBeenCalled();
    expect(mockWorker.pushBranch).not.toHaveBeenCalled();
  });

  it('allows remediation when no existing auto-remediation commit', async () => {
    vi.clearAllMocks();
    setupExecMock();
    setupHappyPathWorker();
    mockWorker.commitRemediationFix.mockResolvedValue('fresh-sha');

    const result = await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 61,
      headBranch: 'feature/first-remediation-abc',
      headSha: 'sha',
      repository: 'owner/repo',
    });

    expect(result.status).toBe('success');
    expect(mockWorker.runPrettier).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Test suite: GitHubWebhookHandler event filtering
// ---------------------------------------------------------------------------

describe('GitHubWebhookHandler event filtering', () => {
  let events: ReturnType<typeof makeEventEmitter>;
  let handler: GitHubWebhookHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    events = makeEventEmitter();
    handler = new GitHubWebhookHandler(events as unknown as EventEmitter, '/project');
    handler.start();
  });

  it('ignores non-pr:ci-failure events — no remediation triggered', () => {
    events.emit('feature:status-changed', { featureId: 'abc' });
    events.emit('pr:approved', { prNumber: 1 });

    expect(mockWorker.runPrettier).not.toHaveBeenCalled();
  });

  it('processes pr:ci-failure events and attempts format check lookup', async () => {
    setupExecMock({
      'gh api': JSON.stringify({
        total_count: 1,
        check_runs: [
          { id: 1, name: 'Check formatting', status: 'completed', conclusion: 'failure' },
        ],
      }),
      'gh pr view': JSON.stringify({ baseRefName: 'dev' }),
      'gh pr diff': 'src/index.ts',
    });
    setupHappyPathWorker();
    mockWorker.commitRemediationFix.mockResolvedValue('triggered-sha');

    events.emit('pr:ci-failure', {
      projectPath: '',
      prNumber: 50,
      headBranch: 'feature/ci-fail-test',
      headSha: 'abc123',
      checkSuiteId: 999,
      repository: 'owner/repo',
      checksUrl: 'https://api.github.com/repos/owner/repo/check-suites/999/check-runs',
    });

    // Allow async handlers to settle
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Remediation should have been attempted (PrRemediationWorker was instantiated)
    expect(PrRemediationWorker).toHaveBeenCalled();
  });

  it('skips remediation when Check formatting check passed', async () => {
    setupExecMock({
      'gh api': JSON.stringify({
        total_count: 2,
        check_runs: [
          { id: 1, name: 'Check formatting', status: 'completed', conclusion: 'success' },
          { id: 2, name: 'Lint UI', status: 'completed', conclusion: 'failure' },
        ],
      }),
    });

    events.emit('pr:ci-failure', {
      projectPath: '',
      prNumber: 51,
      headBranch: 'feature/lint-fail-not-format',
      headSha: 'abc123',
      checkSuiteId: 1000,
      repository: 'owner/repo',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Format check passed, so prettier should NOT have been invoked
    expect(mockWorker.runPrettier).not.toHaveBeenCalled();
  });

  it('skips remediation when Check formatting check is not in the suite', async () => {
    setupExecMock({
      'gh api': JSON.stringify({
        total_count: 1,
        check_runs: [{ id: 1, name: 'Lint UI', status: 'completed', conclusion: 'failure' }],
      }),
    });

    events.emit('pr:ci-failure', {
      projectPath: '',
      prNumber: 52,
      headBranch: 'feature/other-check-fail',
      headSha: 'abc123',
      checkSuiteId: 1001,
      repository: 'owner/repo',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockWorker.runPrettier).not.toHaveBeenCalled();
  });

  it('stops listening after stop() is called', () => {
    handler.stop();

    // After stop(), new events should not trigger handlers
    events.emit('pr:ci-failure', {
      projectPath: '',
      prNumber: 53,
      headBranch: 'feature/after-stop',
      headSha: 'abc',
      repository: 'owner/repo',
    });

    // The event will still be emitted but the handler's internal subscription is gone
    // Verify by checking that the subscribe was called once (on start()) and the
    // handler did not instantiate a new PrRemediationWorker (unsubscribed before emit)
    expect(PrRemediationWorker).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test suite: PrRemediationWorker base class (via mock contract)
// ---------------------------------------------------------------------------

describe('PrRemediationWorker base class', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupExecMock();
    setupHappyPathWorker();
    // Restore default mock implementations for worker methods
    mockWorker.createScratchDir.mockResolvedValue('/tmp/pr-remediation-xyz');
    mockWorker.cleanup.mockResolvedValue(undefined);
  });

  it('createScratchDir is called with no arguments and returns a string path', async () => {
    // createScratchDir should return a temp path
    const dir = await mockWorker.createScratchDir();
    expect(typeof dir).toBe('string');
    expect(dir).toContain('pr-remediation');
  });

  it('cleanup is called during format remediation (finally block)', async () => {
    // When worktree doesn't exist, a scratch dir is created and must be cleaned up
    setupExecMock({
      'test -d': new Error('ENOENT'), // Worktree doesn't exist
      'gh pr checkout': '', // Checkout succeeds
      'gh pr diff': 'src/index.ts',
      'gh pr view': JSON.stringify({ baseRefName: 'dev' }),
    });
    mockWorker.createScratchDir.mockResolvedValue('/tmp/pr-remediation-scratch');
    mockWorker.runPrettier.mockResolvedValue(['src/index.ts']);
    mockWorker.getModifiedFiles.mockResolvedValue(['src/index.ts']);
    mockWorker.commitRemediationFix.mockResolvedValue('sha-cleanup-test');

    await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 70,
      headBranch: 'feature/cleanup-test-abc',
      headSha: 'sha',
      repository: 'owner/repo',
    });

    // Scratch dir should have been cleaned up in the finally block
    expect(mockWorker.cleanup).toHaveBeenCalledWith('/tmp/pr-remediation-scratch');
  });

  it('PrRemediationWorker is instantiated during remediateFormatFailure', async () => {
    await remediateFormatFailure({
      projectPath: '/project',
      prNumber: 71,
      headBranch: 'feature/worker-instantiation-test',
      headSha: 'sha',
      repository: 'owner/repo',
    });

    expect(PrRemediationWorker).toHaveBeenCalledOnce();
  });
});
