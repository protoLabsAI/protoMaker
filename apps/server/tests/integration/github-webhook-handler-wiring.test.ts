/**
 * Integration test: GitHubWebhookHandler wiring
 *
 * Verifies that GitHubWebhookHandler correctly subscribes to the real
 * EventEmitter (not a stub) and reacts to `pr:ci-failure` events.
 *
 * This test is distinct from the unit tests in tests/services/pr-remediation.test.ts,
 * which use a mock EventEmitter. Here we use the actual `createEventEmitter()` to
 * confirm the event subscription wiring works end-to-end — the bug that was fixed
 * (service never instantiated in production) would have caused these tests to pass
 * while the real server silently swallowed all `pr:ci-failure` events.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventEmitter } from '../../src/lib/events.js';
import { GitHubWebhookHandler } from '../../src/services/github-webhook-handler.js';

// ---------------------------------------------------------------------------
// Mock child_process.exec (used by isFormatCheckFailed via execAsync)
// ---------------------------------------------------------------------------

const mockExec = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  exec: mockExec,
  execFile: vi.fn(),
  spawn: vi.fn(),
  fork: vi.fn(),
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

// Mock pr-remediation-service so we can assert it was called without running git ops
const mockRemediateFormatFailure = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/pr-remediation-service.js', () => ({
  remediateFormatFailure: mockRemediateFormatFailure,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupExecStub(opts: { checkRunsResponse: object; runViewOutput: string }): void {
  mockExec.mockImplementation(
    (
      cmd: string,
      _opts: unknown,
      cb: (err: Error | null, result: { stdout: string; stderr: string }) => void
    ) => {
      if (cmd.includes('gh api') && cmd.includes('check-runs')) {
        cb(null, { stdout: JSON.stringify(opts.checkRunsResponse), stderr: '' });
        return;
      }
      if (cmd.includes('gh run view') && cmd.includes('--log-failed')) {
        cb(null, { stdout: opts.runViewOutput, stderr: '' });
        return;
      }
      cb(null, { stdout: '', stderr: '' });
    }
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHubWebhookHandler — real EventEmitter wiring', () => {
  let handler: GitHubWebhookHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRemediateFormatFailure.mockResolvedValue({ status: 'success', prNumber: 1, reason: 'ok' });
  });

  afterEach(() => {
    handler?.stop();
  });

  it('subscribes to the real event bus and reacts to pr:ci-failure when checks job failed with format marker', async () => {
    const events = createEventEmitter();
    handler = new GitHubWebhookHandler(events, '/tmp/test-project');
    handler.start();

    setupExecStub({
      checkRunsResponse: {
        total_count: 1,
        check_runs: [
          {
            id: 1,
            name: 'checks',
            status: 'completed',
            conclusion: 'failure',
            details_url: 'https://github.com/owner/repo/actions/runs/24676789130/job/68012345',
          },
        ],
      },
      runViewOutput: 'Code style issues found in 4 files',
    });

    events.emit('pr:ci-failure', {
      projectPath: '/tmp/test-project',
      prNumber: 42,
      headBranch: 'feature/integration-test-abc',
      headSha: 'deadbeef',
      checkSuiteId: 99999,
      repository: 'owner/repo',
    });

    // Allow async handlers to settle
    await new Promise((resolve) => setTimeout(resolve, 100));

    // The handler must have called remediateFormatFailure — this is the observable
    // side effect that confirms the event subscription is live.
    expect(mockRemediateFormatFailure).toHaveBeenCalledOnce();
    expect(mockRemediateFormatFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: 42,
        headBranch: 'feature/integration-test-abc',
        repository: 'owner/repo',
      }),
      events
    );
  });

  it('does NOT call remediateFormatFailure when checks job passed (real event bus)', async () => {
    const events = createEventEmitter();
    handler = new GitHubWebhookHandler(events, '/tmp/test-project');
    handler.start();

    setupExecStub({
      checkRunsResponse: {
        total_count: 1,
        check_runs: [
          {
            id: 1,
            name: 'checks',
            status: 'completed',
            conclusion: 'success',
            details_url: 'https://github.com/owner/repo/actions/runs/24676789130/job/68012345',
          },
        ],
      },
      runViewOutput: '',
    });

    events.emit('pr:ci-failure', {
      projectPath: '/tmp/test-project',
      prNumber: 43,
      headBranch: 'feature/no-format-issue',
      headSha: 'cafecafe',
      checkSuiteId: 99998,
      repository: 'owner/repo',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockRemediateFormatFailure).not.toHaveBeenCalled();
  });

  it('unsubscribes from the real event bus after stop()', async () => {
    const events = createEventEmitter();
    handler = new GitHubWebhookHandler(events, '/tmp/test-project');
    handler.start();
    handler.stop();

    setupExecStub({
      checkRunsResponse: {
        total_count: 1,
        check_runs: [
          {
            id: 1,
            name: 'checks',
            status: 'completed',
            conclusion: 'failure',
            details_url: 'https://github.com/owner/repo/actions/runs/24676789130/job/68012345',
          },
        ],
      },
      runViewOutput: 'Code style issues found in 2 files',
    });

    events.emit('pr:ci-failure', {
      projectPath: '/tmp/test-project',
      prNumber: 44,
      headBranch: 'feature/after-stop',
      headSha: 'aa',
      checkSuiteId: 99997,
      repository: 'owner/repo',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // After stop(), the subscription is gone — no remediation should be triggered
    expect(mockRemediateFormatFailure).not.toHaveBeenCalled();
  });
});
