/**
 * Unit tests for enrichProjects() — enrichment of ProjectRef[] with github + defaultBranch.
 *
 * Verifies that:
 *   - github.owner/repo is populated from checkGitHubRemote (best-effort)
 *   - defaultBranch is populated from git symbolic-ref (best-effort)
 *   - failures are tolerated (fields omitted, never thrown)
 *   - empty array returns empty array
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectRef } from '@protolabsai/types';

const h = vi.hoisted(() => ({
  checkGitHubRemoteResults: [] as Array<Record<string, unknown> | Error>,
  execFileAsyncResults: [] as Array<{ stdout: string } | Error>,
  checkGitHubRemoteIdx: 0,
  execFileAsyncIdx: 0,
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
  checkGitHubRemote: vi.fn(async () => {
    const result = h.checkGitHubRemoteResults[h.checkGitHubRemoteIdx++];
    if (result instanceof Error) throw result;
    return result;
  }),
}));

// Also mock the relative path that enrich-projects.ts uses
vi.mock('@/routes/settings/../../github/routes/check-github-remote.js', () => ({
  checkGitHubRemote: vi.fn(async () => {
    const result = h.checkGitHubRemoteResults[h.checkGitHubRemoteIdx++];
    if (result instanceof Error) throw result;
    return result;
  }),
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    execFile: vi.fn(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb?: (err: unknown, res?: { stdout: string; stderr: string }) => void
      ) => {
        const result = h.execFileAsyncResults[h.execFileAsyncIdx++];
        if (result instanceof Error) return cb?.(result);
        cb?.(null, result);
      }
    ),
    // Mock exec so checkGitHubRemote's internal execAsync doesn't hit real git
    exec: vi.fn((_cmd: string, _opts: unknown, cb?: (err: unknown, stdout?: string) => void) => {
      cb?.(null, '');
      return { kill: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() } };
    }),
  };
});

import { enrichProjects } from '@/routes/settings/routes/enrich-projects.js';

function makeProject(overrides: Partial<ProjectRef> = {}): ProjectRef {
  return {
    id: 'p1',
    name: 'Test',
    path: '/test',
    ...overrides,
  };
}

describe('enrichProjects()', () => {
  beforeEach(() => {
    h.checkGitHubRemoteResults = [];
    h.execFileAsyncResults = [];
    h.checkGitHubRemoteIdx = 0;
    h.execFileAsyncIdx = 0;
  });

  it('enriches with github and defaultBranch when both resolve', async () => {
    h.checkGitHubRemoteResults = [
      { hasGitHubRemote: true, owner: 'protolabs', repo: 'protomaker' },
    ];
    h.execFileAsyncResults = [{ stdout: 'refs/remotes/origin/main\n' }];

    const result = await enrichProjects([makeProject()]);

    expect(result).toHaveLength(1);
    expect(result[0].github).toEqual({ owner: 'protolabs', repo: 'protomaker' });
    expect(result[0].defaultBranch).toBe('main');
  });

  it('omits github when checkGitHubRemote returns no owner/repo', async () => {
    h.checkGitHubRemoteResults = [{ hasGitHubRemote: false, owner: null, repo: null }];
    h.execFileAsyncResults = [{ stdout: 'refs/remotes/origin/dev\n' }];

    const result = await enrichProjects([makeProject()]);

    expect(result[0].github).toBeUndefined();
    expect(result[0].defaultBranch).toBe('dev');
  });

  it('omits defaultBranch when git symbolic-ref fails', async () => {
    h.checkGitHubRemoteResults = [{ hasGitHubRemote: true, owner: 'acme', repo: 'widgets' }];
    h.execFileAsyncResults = [new Error('no remote HEAD')];

    const result = await enrichProjects([makeProject()]);

    expect(result[0].github).toEqual({ owner: 'acme', repo: 'widgets' });
    expect(result[0].defaultBranch).toBeUndefined();
  });

  it('tolerates checkGitHubRemote throwing — returns project unchanged', async () => {
    h.checkGitHubRemoteResults = [new Error('network error')];
    h.execFileAsyncResults = [{ stdout: 'refs/remotes/origin/main\n' }];

    const result = await enrichProjects([makeProject()]);

    expect(result).toHaveLength(1);
    expect(result[0].github).toBeUndefined();
    expect(result[0].defaultBranch).toBe('main');
  });

  it('tolerates execFileAsync throwing — returns project unchanged', async () => {
    h.checkGitHubRemoteResults = [{ hasGitHubRemote: true, owner: 'acme', repo: 'widgets' }];
    h.execFileAsyncResults = [new Error('not a git repo')];

    const result = await enrichProjects([makeProject()]);

    expect(result[0].github).toEqual({ owner: 'acme', repo: 'widgets' });
    expect(result[0].defaultBranch).toBeUndefined();
  });

  it('returns empty array for empty input', async () => {
    const result = await enrichProjects([]);
    expect(result).toEqual([]);
  });

  it('serves a fully-persisted project untouched, with no git inspection (#3948)', async () => {
    // No mock results are queued. If enrichProjects tried to inspect git/github,
    // the call indices would advance — asserting they stay 0 proves the persisted
    // values are served without touching `.git` (so the source mount can be dropped).
    const persisted = makeProject({
      github: { owner: 'protolabs', repo: 'protomaker' },
      defaultBranch: 'main',
    });

    const result = await enrichProjects([persisted]);

    expect(result[0]).toBe(persisted); // same reference — untouched
    expect(result[0].github).toEqual({ owner: 'protolabs', repo: 'protomaker' });
    expect(result[0].defaultBranch).toBe('main');
    expect(h.checkGitHubRemoteIdx).toBe(0);
    expect(h.execFileAsyncIdx).toBe(0);
  });

  it('backfills only the missing field, preserving the persisted one (#3948)', async () => {
    // github is already persisted; only defaultBranch is missing → only git is hit.
    h.execFileAsyncResults = [{ stdout: 'refs/remotes/origin/main\n' }];
    const partial = makeProject({ github: { owner: 'acme', repo: 'widgets' } });

    const result = await enrichProjects([partial]);

    expect(result[0].github).toEqual({ owner: 'acme', repo: 'widgets' });
    expect(result[0].defaultBranch).toBe('main');
    expect(h.checkGitHubRemoteIdx).toBe(0); // persisted github was not re-derived
  });

  it('enriches multiple projects independently', async () => {
    h.checkGitHubRemoteResults = [
      { hasGitHubRemote: true, owner: 'org1', repo: 'repo1' },
      { hasGitHubRemote: false, owner: null, repo: null },
    ];
    h.execFileAsyncResults = [
      { stdout: 'refs/remotes/origin/main\n' },
      { stdout: 'refs/remotes/origin/develop\n' },
    ];

    const result = await enrichProjects([
      makeProject({ id: 'a', path: '/a' }),
      makeProject({ id: 'b', path: '/b' }),
    ]);

    expect(result[0].github).toEqual({ owner: 'org1', repo: 'repo1' });
    expect(result[0].defaultBranch).toBe('main');
    expect(result[1].github).toBeUndefined();
    expect(result[1].defaultBranch).toBe('develop');
  });
});
