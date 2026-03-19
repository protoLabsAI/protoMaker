import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before importing the service so execFile is intercepted.
// Mock util so promisify(execFile) === execFile (the mock).
vi.mock('child_process', () => ({ execFile: vi.fn() }));
vi.mock('util', () => ({ promisify: (fn: unknown) => fn }));

import { execFile } from 'child_process';
import { PRStatusChecker, type TrackedPR } from '../../../src/services/pr-status-checker.js';

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

const fakePR: TrackedPR = {
  featureId: 'feat-1',
  projectPath: '/fake/project',
  prNumber: 42,
  prUrl: 'https://github.com/owner/repo/pull/42',
  branchName: 'feature/test',
  lastCheckedAt: Date.now(),
  reviewState: 'pending',
  iterationCount: 0,
};

describe('PRStatusChecker', () => {
  let checker: PRStatusChecker;

  beforeEach(() => {
    checker = new PRStatusChecker();
    mockExecFile.mockReset();
  });

  describe('fetchJobLogs', () => {
    it('returns null for non-GHA ciProvider without calling execFile', async () => {
      const result = await checker.fetchJobLogs(fakePR, 12345, 'other');
      expect(result).toBeNull();
      expect(mockExecFile).not.toHaveBeenCalled();
    });

    it('returns null for unrecognized ciProvider', async () => {
      const result = await checker.fetchJobLogs(fakePR, 12345, 'jenkins');
      expect(result).toBeNull();
    });

    it('calls gh api for GHA job logs', async () => {
      const rawLogs = [
        '2024-01-01T00:00:00.0000000Z ##[group]Run npm test',
        '2024-01-01T00:00:01.0000000Z npm test output line 1',
        '2024-01-01T00:00:02.0000000Z ##[error]Tests failed: 3 failures',
        '2024-01-01T00:00:03.0000000Z ##[endgroup]',
      ].join('\n');

      mockExecFile.mockResolvedValueOnce({ stdout: rawLogs, stderr: '' });

      const result = await checker.fetchJobLogs(fakePR, 9999, 'github-actions');

      expect(mockExecFile).toHaveBeenCalledWith(
        'gh',
        ['api', 'repos/{owner}/{repo}/actions/jobs/9999/logs'],
        expect.objectContaining({ cwd: fakePR.projectPath })
      );
      expect(result).not.toBeNull();
      expect(result).toContain('##[group]Run npm test');
      expect(result).toContain('##[error]Tests failed: 3 failures');
    });

    it('defaults to github-actions ciProvider when not specified', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'some log', stderr: '' });
      const result = await checker.fetchJobLogs(fakePR, 1);
      expect(mockExecFile).toHaveBeenCalled();
      expect(result).not.toBeNull();
    });

    it('returns null on gh api failure', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('gh: not found'));
      const result = await checker.fetchJobLogs(fakePR, 1, 'github-actions');
      expect(result).toBeNull();
    });

    it('truncates to last 200 lines of failing step', async () => {
      // Build a group containing 300 lines after the ##[error] marker
      const logLines: string[] = [];
      logLines.push('2024-01-01T00:00:00.0000000Z ##[group]Run big step');
      logLines.push('2024-01-01T00:00:01.0000000Z ##[error]Something broke');
      for (let i = 0; i < 300; i++) {
        logLines.push(`2024-01-01T00:00:02.0000000Z output line ${i}`);
      }
      logLines.push('2024-01-01T00:00:03.0000000Z ##[endgroup]');

      mockExecFile.mockResolvedValueOnce({ stdout: logLines.join('\n'), stderr: '' });

      const result = await checker.fetchJobLogs(fakePR, 1, 'github-actions');
      expect(result).not.toBeNull();

      const resultLines = result!.split('\n');
      expect(resultLines.length).toBeLessThanOrEqual(200);
    });

    it('returns last 200 lines when no ##[error] marker found', async () => {
      const logLines: string[] = [];
      for (let i = 0; i < 500; i++) {
        logLines.push(`2024-01-01T00:00:00.0000000Z output line ${i}`);
      }

      mockExecFile.mockResolvedValueOnce({ stdout: logLines.join('\n'), stderr: '' });

      const result = await checker.fetchJobLogs(fakePR, 1, 'github-actions');
      expect(result).not.toBeNull();
      const resultLines = result!.split('\n');
      expect(resultLines.length).toBeLessThanOrEqual(200);
    });
  });

  describe('fetchFailedChecks — GHA fallback', () => {
    it('uses job logs as fallback when check run output is empty', async () => {
      const checkRunsJson = JSON.stringify([
        {
          id: 777,
          name: 'test / unit',
          status: 'completed',
          conclusion: 'failure',
          output: { title: null, summary: null, text: null },
        },
      ]);

      const jobLogContent = [
        '2024-01-01T00:00:00.0000000Z ##[group]Run unit tests',
        '2024-01-01T00:00:01.0000000Z ##[error]assertion failed',
        '2024-01-01T00:00:02.0000000Z ##[endgroup]',
      ].join('\n');

      // First call: check-runs API; second call: actions/jobs logs API
      mockExecFile.mockResolvedValueOnce({ stdout: checkRunsJson, stderr: '' });
      mockExecFile.mockResolvedValueOnce({ stdout: jobLogContent, stderr: '' });

      const results = await checker.fetchFailedChecks(fakePR, 'abc123', 'github-actions');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('test / unit');
      expect(results[0].output).toContain('##[error]assertion failed');
    });

    it('does not fetch job logs for non-GHA provider', async () => {
      const checkRunsJson = JSON.stringify([
        {
          id: 888,
          name: 'build',
          status: 'completed',
          conclusion: 'failure',
          output: { title: null, summary: null, text: null },
        },
      ]);

      mockExecFile.mockResolvedValueOnce({ stdout: checkRunsJson, stderr: '' });

      const results = await checker.fetchFailedChecks(fakePR, 'abc123', 'other');

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0].output).toBe('');
    });

    it('skips fallback when API output is sufficient', async () => {
      const richSummary = 'A'.repeat(200);
      const checkRunsJson = JSON.stringify([
        {
          id: 999,
          name: 'lint',
          status: 'completed',
          conclusion: 'failure',
          output: { title: 'Lint failed', summary: richSummary, text: null },
        },
      ]);

      mockExecFile.mockResolvedValueOnce({ stdout: checkRunsJson, stderr: '' });

      const results = await checker.fetchFailedChecks(fakePR, 'def456', 'github-actions');

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      expect(results[0].output).toContain('Lint failed');
    });
  });
});
