/**
 * Precedence + validation tests for getEffectivePrBaseBranch (issue #4086).
 *
 * The resolution order is:
 *   1. Project-level prBaseBranch override (validated against origin)
 *   2. The repo's own default branch (origin/HEAD) — outranks any global default
 *   3. Global prBaseBranch (validated against origin)
 *   4. DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch ('main')
 *
 * A configured branch (project or global) that origin definitively reports absent
 * (`git ls-remote --exit-code` exits 2) is skipped instead of hard-blocking the
 * feature; an inconclusive check (any other error) honors the configured value.
 *
 * git is mocked via node:child_process so each case drives a deterministic response.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SettingsService } from '@/services/settings-service.js';

type GitResult = { stdout?: string } | { code: number } | { error: Error };

// Per-test git behavior, swapped in via setGit(). Default: every git call fails
// inconclusively (no exit code) so nothing is treated as definitively absent.
const h = vi.hoisted(() => {
  let impl: (cmd: string, args: string[]) => GitResult = () => ({ error: new Error('git failed') });
  return {
    setGit: (fn: (cmd: string, args: string[]) => GitResult) => {
      impl = fn;
    },
    execFile: vi.fn(
      (
        cmd: string,
        args: string[],
        _opts: unknown,
        cb: (err: (Error & { code?: number }) | null, result?: { stdout: string }) => void
      ) => {
        const r = impl(cmd, args);
        if ('stdout' in r) {
          cb(null, { stdout: r.stdout ?? '' });
        } else if ('code' in r) {
          const err = new Error(`git exited ${r.code}`) as Error & { code?: number };
          err.code = r.code;
          cb(err);
        } else {
          cb(r.error as Error & { code?: number });
        }
      }
    ),
  };
});

vi.mock('node:child_process', () => ({ execFile: h.execFile }));

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual('@protolabsai/utils');
  return {
    ...actual,
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  };
});

/** Branch name passed to `git ls-remote --exit-code --heads origin <branch>`. */
function lsRemoteBranch(args: string[]): string {
  return args[args.length - 1];
}

function makeSettings(opts: { project?: string; global?: string }): SettingsService {
  return {
    getProjectSettings: vi
      .fn()
      .mockResolvedValue(
        opts.project ? { workflow: { gitWorkflow: { prBaseBranch: opts.project } } } : {}
      ),
    getGlobalSettings: vi
      .fn()
      .mockResolvedValue(opts.global ? { gitWorkflow: { prBaseBranch: opts.global } } : {}),
  } as unknown as SettingsService;
}

describe('getEffectivePrBaseBranch precedence (#4086)', () => {
  let getEffectivePrBaseBranch: (
    projectPath: string,
    settingsService?: SettingsService | null,
    logPrefix?: string
  ) => Promise<string>;

  beforeEach(async () => {
    vi.clearAllMocks();
    h.setGit(() => ({ error: new Error('git failed') }));
    const mod = await import('@/lib/settings-helpers.js');
    getEffectivePrBaseBranch = mod.getEffectivePrBaseBranch;
  });

  it("repo's origin/HEAD outranks a global default that points elsewhere", async () => {
    // This is the core #4086 regression: global was 'dev', repo default is 'main'.
    h.setGit((_cmd, args) => {
      if (args[0] === 'symbolic-ref') return { stdout: 'refs/remotes/origin/main\n' };
      return { error: new Error('unexpected') };
    });
    const result = await getEffectivePrBaseBranch('/repo', makeSettings({ global: 'dev' }));
    expect(result).toBe('main');
  });

  it('a project override that exists on origin wins over origin/HEAD', async () => {
    h.setGit((_cmd, args) => {
      if (args[0] === 'symbolic-ref') return { stdout: 'refs/remotes/origin/main\n' };
      if (args[0] === 'ls-remote' && lsRemoteBranch(args) === 'epic/foo')
        return { stdout: '<sha>\n' };
      return { code: 2 };
    });
    const result = await getEffectivePrBaseBranch('/repo', makeSettings({ project: 'epic/foo' }));
    expect(result).toBe('epic/foo');
  });

  it('a project override absent on origin degrades to origin/HEAD (no hard block)', async () => {
    h.setGit((_cmd, args) => {
      if (args[0] === 'symbolic-ref') return { stdout: 'refs/remotes/origin/main\n' };
      if (args[0] === 'ls-remote') return { code: 2 }; // 'ghost' not found
      return { error: new Error('unexpected') };
    });
    const result = await getEffectivePrBaseBranch('/repo', makeSettings({ project: 'ghost' }));
    expect(result).toBe('main');
  });

  it('falls back to the global default when origin/HEAD is undetectable and the global exists', async () => {
    h.setGit((_cmd, args) => {
      if (args[0] === 'symbolic-ref') return { error: new Error('no origin/HEAD') };
      if (args[0] === 'ls-remote' && lsRemoteBranch(args) === 'staging')
        return { stdout: '<sha>\n' };
      return { code: 2 };
    });
    const result = await getEffectivePrBaseBranch('/repo', makeSettings({ global: 'staging' }));
    expect(result).toBe('staging');
  });

  it('falls back to main when origin/HEAD is undetectable and the global default is absent on origin', async () => {
    h.setGit((_cmd, args) => {
      if (args[0] === 'symbolic-ref') return { error: new Error('no origin/HEAD') };
      if (args[0] === 'ls-remote') return { code: 2 }; // 'dev' not found anywhere
      return { error: new Error('unexpected') };
    });
    const result = await getEffectivePrBaseBranch('/repo', makeSettings({ global: 'dev' }));
    expect(result).toBe('main');
  });

  it('honors a configured branch when the existence check is inconclusive (fail-open, not exit 2)', async () => {
    // origin/HEAD undetectable; ls-remote fails with a transient (non-2) error.
    h.setGit((_cmd, args) => {
      if (args[0] === 'symbolic-ref') return { error: new Error('no origin/HEAD') };
      if (args[0] === 'ls-remote') return { code: 128 }; // e.g. network/transport error
      return { error: new Error('unexpected') };
    });
    const result = await getEffectivePrBaseBranch('/repo', makeSettings({ project: 'release/x' }));
    expect(result).toBe('release/x');
  });

  it('returns main when there are no settings and origin/HEAD is undetectable', async () => {
    h.setGit(() => ({ error: new Error('git failed') }));
    const result = await getEffectivePrBaseBranch('/repo', null);
    expect(result).toBe('main');
  });
});
