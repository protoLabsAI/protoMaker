/**
 * ClaudeCodeTool Tests
 *
 * Unit tests for lock file protection, tool registration, and subprocess output handling.
 * Uses vi.mock to intercept Node's child_process.spawn so no actual `claude` binary is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClaudeCodeTool } from '../src/claude-code-tool.js';
import { ToolRegistry } from '../src/registry.js';

// ─── Mock child_process.spawn ─────────────────────────────────────────────────

// Minimal EventEmitter-like child process mock
function makeMockProcess({
  stdout = 'hello world\n',
  stderr = '',
  exitCode = 0,
}: {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
} = {}) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  const on = vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    listeners[event] = listeners[event] ?? [];
    listeners[event].push(cb);
    return mock;
  });

  const kill = vi.fn();

  const stdoutStream = {
    on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
      if (event === 'data') {
        // Emit data asynchronously so listeners are registered first
        Promise.resolve().then(() => cb(Buffer.from(stdout)));
      }
    }),
  };

  const stderrStream = {
    on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
      if (event === 'data' && stderr) {
        Promise.resolve().then(() => cb(Buffer.from(stderr)));
      }
    }),
  };

  const mock = {
    on,
    kill,
    stdout: stdoutStream,
    stderr: stderrStream,
    pid: 12345,
    // Trigger exit after a microtask so that tests can await it
    _resolveExit: () => {
      Promise.resolve().then(() => {
        listeners['exit']?.forEach((cb) => cb(exitCode));
      });
    },
  };

  return mock;
}

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createClaudeCodeTool()', () => {
  let spawnMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const cp = await import('child_process');
    spawnMock = vi.mocked(cp.spawn);
    spawnMock.mockReset();
  });

  it('registers as "claude-code" in ToolRegistry', () => {
    const tool = createClaudeCodeTool();
    const registry = new ToolRegistry();
    registry.register(tool as never);
    expect(registry.has('claude-code')).toBe(true);
  });

  it('returns output on successful exit code 0', async () => {
    const proc = makeMockProcess({ stdout: 'done!\n', exitCode: 0 });
    spawnMock.mockReturnValue(proc);
    proc._resolveExit();

    const tool = createClaudeCodeTool({ claudePath: 'claude' });
    const result = await tool.execute(
      { prompt: 'hello', invocationId: 'test-success-1', timeout: 5000 },
      {}
    );

    expect(result.success).toBe(true);
    expect((result.data as { output: string }).output).toContain('done!');
    expect((result.data as { timedOut: boolean }).timedOut).toBe(false);
  });

  it('returns failure with error message on non-zero exit code', async () => {
    const proc = makeMockProcess({ stdout: '', stderr: 'fatal error', exitCode: 1 });
    spawnMock.mockReturnValue(proc);
    proc._resolveExit();

    const tool = createClaudeCodeTool();
    const result = await tool.execute(
      { prompt: 'fail', invocationId: 'test-nonzero-1', timeout: 5000 },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/exited with code 1/);
    expect(result.error).toContain('fatal error');
  });

  it('rejects duplicate invocationId when lock is already held', async () => {
    // First call: lock acquired, process hangs (never exits)
    const hanging = makeMockProcess();
    spawnMock.mockReturnValue(hanging);
    // Don't call _resolveExit so first call is still "in progress"

    const tool = createClaudeCodeTool();

    // Start first call (don't await — let it hang)
    const firstCall = tool.execute(
      { prompt: 'first', invocationId: 'duplicate-lock-test', timeout: 60_000 },
      {}
    );

    // Second call should immediately see the lock
    await new Promise((r) => setTimeout(r, 10)); // let first call acquire lock
    const second = await tool.execute(
      { prompt: 'second', invocationId: 'duplicate-lock-test', timeout: 5000 },
      {}
    );

    expect(second.success).toBe(false);
    expect(second.error).toMatch(/Lock already held/);
    expect(second.error).toContain('duplicate-lock-test');

    // Clean up: resolve first call
    hanging._resolveExit();
    await firstCall;
  });

  it('parses costUsd from JSON lines in stdout', async () => {
    const jsonLine = JSON.stringify({ cost_usd: 0.0042 });
    const proc = makeMockProcess({ stdout: `some text\n${jsonLine}\n`, exitCode: 0 });
    spawnMock.mockReturnValue(proc);
    proc._resolveExit();

    const tool = createClaudeCodeTool();
    const result = await tool.execute(
      { prompt: 'cost-test', invocationId: 'test-cost-1', timeout: 5000 },
      {}
    );

    expect(result.success).toBe(true);
    expect((result.data as { costUsd?: number }).costUsd).toBeCloseTo(0.0042);
  });

  it('uses custom claudePath when provided', async () => {
    const proc = makeMockProcess({ exitCode: 0 });
    spawnMock.mockReturnValue(proc);
    proc._resolveExit();

    const tool = createClaudeCodeTool({ claudePath: '/usr/local/bin/claude-custom' });
    await tool.execute({ prompt: 'test', invocationId: 'test-path-1', timeout: 5000 }, {});

    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/local/bin/claude-custom',
      ['-p', 'test'],
      expect.any(Object)
    );
  });
});
