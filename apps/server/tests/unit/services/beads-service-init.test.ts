/**
 * Unit tests for BeadsService.status / .init — the "initialize beads from the
 * UI" path (bead protomaker-gyd). Mocks `br` via node:child_process so the
 * NOT_INITIALIZED / ALREADY_INITIALIZED detection logic is verified without
 * needing the binary installed in CI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promisify } from 'node:util';

// Preserve promisify's custom behavior so `promisify(execFile)` resolves with
// `{ stdout, stderr }` and rejects with the augmented error, matching real
// execFile. (Mirrors tests/unit/lib/gh-pr-create.test.ts.)
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

const { BeadsService } = await import('@/services/beads-service.js');

type ExecCallback = (err: Error | null, stdout: string, stderr: string) => void;

/** Resolve the next `br` call with stdout (exit 0). */
function respondOk(stdout: string, stderr = '') {
  execFileMock.mockImplementationOnce((_f: string, _a: string[], _o: unknown, cb: ExecCallback) =>
    cb(null, stdout, stderr)
  );
}

/** Reject the next `br` call as a non-zero exit, attaching stdout/stderr/code. */
function respondFail(opts: { stdout?: string; stderr?: string; code: number | string }) {
  const err = Object.assign(new Error('br failed'), {
    code: opts.code,
    stdout: opts.stdout ?? '',
    stderr: opts.stderr ?? '',
  });
  execFileMock.mockImplementationOnce((_f: string, _a: string[], _o: unknown, cb: ExecCallback) =>
    cb(err, opts.stdout ?? '', opts.stderr ?? '')
  );
}

const NOT_INIT = JSON.stringify({ error: { code: 'NOT_INITIALIZED', message: 'run br init' } });
const ALREADY_INIT = JSON.stringify({ error: { code: 'ALREADY_INITIALIZED' } });
const PROJECT = '/tmp/beads-test-project';

describe('BeadsService.status', () => {
  let svc: InstanceType<typeof BeadsService>;
  beforeEach(() => {
    execFileMock.mockReset();
    svc = new BeadsService();
  });

  it('reports initialized when `br list` succeeds', async () => {
    respondOk('[]');
    await expect(svc.status(PROJECT)).resolves.toEqual({ initialized: true });
  });

  it('reports NOT initialized on the NOT_INITIALIZED error (emitted on stderr)', async () => {
    respondFail({ stderr: NOT_INIT, code: 2 });
    await expect(svc.status(PROJECT)).resolves.toEqual({ initialized: false });
  });

  it('throws on an unexpected non-zero exit', async () => {
    respondFail({ stdout: '', stderr: 'disk on fire', code: 1 });
    await expect(svc.status(PROJECT)).rejects.toThrow(/br list failed/);
  });
});

describe('BeadsService.init', () => {
  let svc: InstanceType<typeof BeadsService>;
  beforeEach(() => {
    execFileMock.mockReset();
    svc = new BeadsService();
  });

  it('initializes a fresh store and invokes `br init`', async () => {
    respondOk('Initialized beads workspace in .beads/');
    await expect(svc.init(PROJECT)).resolves.toEqual({
      initialized: true,
      alreadyInitialized: false,
    });
    const [file, args] = execFileMock.mock.calls[0];
    expect(file).toBe('br');
    expect(args).toEqual(['init']);
  });

  it('passes --prefix when provided', async () => {
    respondOk('Prefix set to: bd');
    await svc.init(PROJECT, 'bd');
    const [, args] = execFileMock.mock.calls[0];
    expect(args).toEqual(['init', '--prefix', 'bd']);
  });

  it('treats ALREADY_INITIALIZED (emitted on stderr) as idempotent success', async () => {
    respondFail({ stderr: ALREADY_INIT, code: 2 });
    await expect(svc.init(PROJECT)).resolves.toEqual({
      initialized: true,
      alreadyInitialized: true,
    });
  });

  it('surfaces a clear error when `br` is not installed', async () => {
    respondFail({ code: 'ENOENT' });
    await expect(svc.init(PROJECT)).rejects.toThrow(/not installed or not on PATH/);
  });
});
