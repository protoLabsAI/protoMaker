/**
 * Unit tests for the add_github_comment route handler (#3817).
 *
 *   - validates projectPath / issueNumber / body
 *   - 400 when the project has no GitHub remote
 *   - success posts via `gh issue comment` and returns the comment URL
 *   - the body is passed as a DISCRETE execFile arg (never shell-interpolated)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const h = vi.hoisted(() => ({
  remote: { hasGitHubRemote: true, owner: 'acme', repo: 'widgets' } as Record<string, unknown>,
  execArgs: [] as unknown[][],
  execStdout: 'https://github.com/acme/widgets/issues/42#issuecomment-1',
  execError: null as Error | null,
}));

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual('@protolabsai/utils');
  return {
    ...(actual as object),
    createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  };
});

vi.mock('@protolabsai/git-utils', () => ({ createGitExecEnv: () => ({}) }));

vi.mock('@/routes/github/routes/check-github-remote.js', () => ({
  checkGitHubRemote: vi.fn(async () => h.remote),
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    execFile: (
      _cmd: string,
      args: unknown[],
      _opts: unknown,
      cb?: (err: unknown, res?: { stdout: string; stderr: string }) => void
    ) => {
      h.execArgs.push(args);
      const callback = typeof _opts === 'function' ? (_opts as typeof cb) : cb;
      if (h.execError) return callback?.(h.execError);
      callback?.(null, { stdout: h.execStdout, stderr: '' });
    },
  };
});

import { createAddCommentHandler } from '@/routes/github/routes/add-comment.js';

function makeRes() {
  const res: Partial<Response> & { statusCode: number; body: unknown } = {
    statusCode: 200,
    body: undefined,
  };
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res as Response;
  }) as unknown as Response['status'];
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res as Response;
  }) as unknown as Response['json'];
  return res;
}

async function call(body: unknown) {
  const handler = createAddCommentHandler();
  const res = makeRes();
  await handler({ body } as Request, res as Response);
  return res;
}

describe('add_github_comment route (#3817)', () => {
  beforeEach(() => {
    h.remote = { hasGitHubRemote: true, owner: 'acme', repo: 'widgets' };
    h.execArgs = [];
    h.execStdout = 'https://github.com/acme/widgets/issues/42#issuecomment-1';
    h.execError = null;
  });

  it('400 when projectPath missing', async () => {
    const res = await call({ issueNumber: 42, body: 'hi' });
    expect(res.statusCode).toBe(400);
  });

  it('400 when issueNumber is not a positive integer', async () => {
    expect((await call({ projectPath: '/p', issueNumber: 0, body: 'hi' })).statusCode).toBe(400);
    expect((await call({ projectPath: '/p', issueNumber: 1.5, body: 'hi' })).statusCode).toBe(400);
    expect((await call({ projectPath: '/p', body: 'hi' })).statusCode).toBe(400);
  });

  it('400 when body is empty', async () => {
    expect((await call({ projectPath: '/p', issueNumber: 42, body: '   ' })).statusCode).toBe(400);
  });

  it('400 when the project has no GitHub remote', async () => {
    h.remote = { hasGitHubRemote: false };
    const res = await call({ projectPath: '/p', issueNumber: 42, body: 'hi' });
    expect(res.statusCode).toBe(400);
  });

  it('posts the comment and returns the comment URL', async () => {
    const res = await call({ projectPath: '/p', issueNumber: 42, body: 'looks good' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      issueNumber: 42,
      commentUrl: 'https://github.com/acme/widgets/issues/42#issuecomment-1',
    });
  });

  it('passes the body as a discrete arg (no shell interpolation)', async () => {
    const danger = 'malicious $(rm -rf /) `whoami` "quotes"';
    await call({ projectPath: '/p', issueNumber: 42, body: danger });
    const args = h.execArgs[0] as string[];
    // gh issue comment 42 --repo acme/widgets --body "<danger>"
    expect(args).toContain('comment');
    expect(args).toContain('42');
    expect(args).toContain('acme/widgets');
    // The body is present verbatim as its own array element — never concatenated
    // into a shell string.
    expect(args).toContain(danger);
  });
});
