/**
 * Unit tests for the sitrep staging-delta signal (#3894).
 *
 * Guards the bug where getStagingDelta hardcoded `origin/staging..origin/dev`,
 * so repos without those branches silently leaked `commitsAhead: 0` into world
 * state. Now: unconfigured or missing-ref → `applicable: false`; configured +
 * present refs → a real count.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promisify } from 'node:util';

const execFileMock = vi.fn();
(execFileMock as unknown as Record<symbol, unknown>)[promisify.custom] = (
  file: string,
  args: string[],
  opts?: unknown
) =>
  new Promise((resolve, reject) => {
    execFileMock(file, args, opts, (err: Error | null, stdout: string, stderr: string) =>
      err ? reject(err) : resolve({ stdout, stderr })
    );
  });

vi.mock('node:child_process', () => ({ execFile: execFileMock }));

const { getStagingDelta, resolveStagingDeltaBranches } = await import('@/routes/sitrep/index.js');

type ExecCallback = (err: Error | null, stdout: string, stderr: string) => void;

/** Queue one git response (by call order). `fail: true` rejects (missing ref). */
function nextGit(opts: { stdout?: string; fail?: boolean }) {
  execFileMock.mockImplementationOnce(
    (_file: string, _args: string[], _o: unknown, cb: ExecCallback) => {
      if (opts.fail) cb(Object.assign(new Error('git failed'), { code: 1 }), '', 'fatal');
      else cb(null, opts.stdout ?? '', '');
    }
  );
}

const REPO = '/tmp/repo';
const BRANCHES = { from: 'origin/staging', to: 'origin/dev' };

describe('getStagingDelta', () => {
  beforeEach(() => execFileMock.mockReset());

  it('is not applicable when no branch pair is configured', async () => {
    const result = await getStagingDelta(REPO, undefined);
    expect(result).toEqual({ applicable: false, commitsAhead: 0, commits: [] });
    expect(execFileMock).not.toHaveBeenCalled(); // no git when unconfigured
  });

  it('is not applicable when a configured ref does not exist', async () => {
    nextGit({ fail: true }); // first rev-parse --verify fails for a missing ref
    const result = await getStagingDelta(REPO, BRANCHES);
    expect(result.applicable).toBe(false);
    expect(result.commitsAhead).toBe(0);
  });

  it('counts commits when both refs exist', async () => {
    nextGit({ stdout: 'deadbeef\n' }); // rev-parse from
    nextGit({ stdout: 'cafef00d\n' }); // rev-parse to
    nextGit({ stdout: 'aaa1111 feat: one\nbbb2222 fix: two\n' }); // log
    const result = await getStagingDelta(REPO, BRANCHES);
    expect(result.applicable).toBe(true);
    expect(result.commitsAhead).toBe(2);
    expect(result.commits).toEqual(['aaa1111 feat: one', 'bbb2222 fix: two']);
    // the log range uses the configured branch pair, not hardcoded literals
    const logCall = execFileMock.mock.calls.find((c) => c[1]?.[0] === 'log');
    expect(logCall?.[1]).toContain('origin/staging..origin/dev');
  });
});

describe('resolveStagingDeltaBranches', () => {
  it('returns undefined without a settings service', async () => {
    await expect(resolveStagingDeltaBranches(REPO, null)).resolves.toBeUndefined();
  });

  it('prefers the per-project pair over global', async () => {
    const settingsService = {
      getProjectSettings: vi.fn().mockResolvedValue({
        workflow: { gitWorkflow: { stagingDeltaBranches: { from: 'origin/a', to: 'origin/b' } } },
      }),
      getGlobalSettings: vi.fn().mockResolvedValue({
        gitWorkflow: { stagingDeltaBranches: { from: 'origin/x', to: 'origin/y' } },
      }),
    };
    await expect(resolveStagingDeltaBranches(REPO, settingsService as never)).resolves.toEqual({
      from: 'origin/a',
      to: 'origin/b',
    });
    expect(settingsService.getGlobalSettings).not.toHaveBeenCalled();
  });

  it('falls back to the global pair', async () => {
    const settingsService = {
      getProjectSettings: vi.fn().mockResolvedValue({ workflow: {} }),
      getGlobalSettings: vi.fn().mockResolvedValue({
        gitWorkflow: { stagingDeltaBranches: { from: 'origin/x', to: 'origin/y' } },
      }),
    };
    await expect(resolveStagingDeltaBranches(REPO, settingsService as never)).resolves.toEqual({
      from: 'origin/x',
      to: 'origin/y',
    });
  });

  it('returns undefined when neither level configures a pair', async () => {
    const settingsService = {
      getProjectSettings: vi.fn().mockResolvedValue({ workflow: {} }),
      getGlobalSettings: vi.fn().mockResolvedValue({ gitWorkflow: {} }),
    };
    await expect(
      resolveStagingDeltaBranches(REPO, settingsService as never)
    ).resolves.toBeUndefined();
  });
});
