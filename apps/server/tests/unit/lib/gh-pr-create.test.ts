/**
 * Unit tests for createPrWithFallback — verifies REST fallback on gh CLI
 * secondary rate limit, and that non-rate-limit errors propagate unchanged.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promisify } from 'util';

// The production code does `promisify(execFile)`, which uses the custom
// promisify symbol on the real execFile to resolve with `{stdout, stderr}`.
// Our mock must preserve that behavior or promisify collapses it to a single
// positional result and the helper reads `undefined` as stdout.
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

vi.mock('child_process', () => ({ execFile: execFileMock }));

const { createPrWithFallback, isSecondaryRateLimit } = await import('@/lib/gh-pr-create.js');

type ExecCallback = (err: Error | null, stdout: string, stderr: string) => void;

function respond(stdout: string, stderr = '', err: Error | null = null) {
  execFileMock.mockImplementationOnce(
    (_file: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
      cb(err, stdout, stderr);
    }
  );
}

function respondError(stderr: string) {
  const err = Object.assign(new Error('gh: error'), { stderr });
  execFileMock.mockImplementationOnce(
    (_file: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
      cb(err, '', stderr);
    }
  );
}

describe('createPrWithFallback', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  afterEach(() => {
    execFileMock.mockReset();
  });

  it('returns CLI result on success without touching REST', async () => {
    respond('https://github.com/owner/repo/pull/42\n');

    const result = await createPrWithFallback({
      cwd: '/tmp/wt',
      base: 'dev',
      head: 'feature/x',
      title: 't',
      body: 'b',
    });

    expect(result).toEqual({
      url: 'https://github.com/owner/repo/pull/42',
      number: 42,
      via: 'cli',
    });
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to REST API when CLI hits secondary rate limit', async () => {
    respondError('You have exceeded a secondary rate limit. Please wait a few minutes.');
    // REST needs owner/repo — it calls `git config remote.origin.url` first
    respond('git@github.com:acme/tool.git\n');
    respond(JSON.stringify({ html_url: 'https://github.com/acme/tool/pull/99', number: 99 }));

    const result = await createPrWithFallback({
      cwd: '/tmp/wt',
      base: 'dev',
      head: 'feature/x',
      title: 't',
      body: 'b',
    });

    expect(result).toEqual({
      url: 'https://github.com/acme/tool/pull/99',
      number: 99,
      via: 'rest',
    });
    // 3 calls: cli create (fail), git config, gh api POST
    expect(execFileMock).toHaveBeenCalledTimes(3);
    expect(execFileMock.mock.calls[2][1][0]).toBe('api');
  });

  it('rethrows non-rate-limit CLI errors without attempting REST', async () => {
    respondError('a PR for branch feature/x already exists');

    await expect(
      createPrWithFallback({
        cwd: '/tmp/wt',
        base: 'dev',
        head: 'feature/x',
        title: 't',
        body: 'b',
      })
    ).rejects.toMatchObject({ stderr: expect.stringContaining('already exists') });
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it('uses explicit repo when provided (fork workflow)', async () => {
    respondError('secondary rate limit');
    respond(JSON.stringify({ html_url: 'https://github.com/upstream/tool/pull/7', number: 7 }));

    const result = await createPrWithFallback({
      cwd: '/tmp/wt',
      base: 'main',
      head: 'fork-owner:feature/y',
      title: 't',
      body: 'b',
      repo: 'upstream/tool',
    });

    expect(result.via).toBe('rest');
    expect(result.number).toBe(7);
    // Only 2 calls: no git-config lookup because `repo` was explicit
    expect(execFileMock).toHaveBeenCalledTimes(2);
  });
});

describe('isSecondaryRateLimit', () => {
  it.each([
    ['You have exceeded a secondary rate limit', true],
    ['Secondary rate limit', true],
    ['Abuse detection mechanism triggered', true],
    ['was submitted too quickly', true],
    ['HTTP 403: You have to wait. Retry After: 60', true],
    ['a PR for branch x already exists', false],
    ['Could not resolve host', false],
    ['', false],
  ])('returns %p for %p', (msg, expected) => {
    expect(isSecondaryRateLimit(msg)).toBe(expected);
  });
});
