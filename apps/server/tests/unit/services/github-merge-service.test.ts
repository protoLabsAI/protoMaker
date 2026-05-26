/**
 * Unit tests for GitHubMergeService.mergePR — the platform-owned merge gate (#88).
 *
 * Guarantees:
 *   - pending checks  → NOT merged, NO GitHub auto-merge enabled (no `--auto`)
 *   - failed checks   → NOT merged, reported as checksFailed
 *   - all checks green → explicit `gh pr merge` WITHOUT `--auto`
 *
 * The whole point: protoMaker never delegates the merge to GitHub auto-merge
 * (which honors only required checks and merged the broken #3878 linters).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  rollup: [] as Array<Record<string, unknown>>,
  mergedAt: '2026-05-26T00:00:00Z',
  execCalls: [] as string[],
}));

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual('@protolabsai/utils');
  return {
    ...(actual as object),
    createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  };
});

vi.mock('@protolabsai/git-utils', () => ({ createGitExecEnv: () => ({}) }));

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    exec: (
      cmd: string,
      _opts: unknown,
      cb?: (err: unknown, res: { stdout: string; stderr: string }) => void
    ) => {
      const callback = typeof _opts === 'function' ? (_opts as typeof cb) : cb;
      h.execCalls.push(cmd);
      let stdout = '';
      if (cmd.includes('command -v gh') || cmd.includes('where gh')) {
        stdout = '/usr/bin/gh';
      } else if (cmd.includes('--json statusCheckRollup')) {
        stdout = JSON.stringify({ statusCheckRollup: h.rollup });
      } else if (cmd.includes('--json mergedAt')) {
        stdout = JSON.stringify({ mergedAt: h.mergedAt });
      } else if (cmd.includes('--json state')) {
        // Post-merge verification: explicit merge lands immediately → MERGED
        stdout = JSON.stringify({ state: 'MERGED' });
      } else if (cmd.includes('gh pr merge')) {
        stdout = 'Merged pull request abcdef1234567890abcdef1234567890abcdef12';
      }
      callback?.(null, { stdout, stderr: '' });
    },
  };
});

import { GitHubMergeService } from '@/services/github-merge-service.js';

const svc = new GitHubMergeService();
const mergeCmds = () => h.execCalls.filter((c) => /gh pr merge\b/.test(c));

describe('GitHubMergeService.mergePR — platform-owned merge gate (#88)', () => {
  beforeEach(() => {
    h.execCalls.length = 0;
    h.rollup = [];
    h.mergedAt = '2026-05-26T00:00:00Z';
  });

  it('does NOT merge or enable auto-merge when checks are pending', async () => {
    h.rollup = [
      { status: 'COMPLETED', conclusion: 'SUCCESS', name: 'build' },
      { status: 'IN_PROGRESS', name: 'test' }, // pending
    ];

    const result = await svc.mergePR('/work', 42, 'squash', true);

    expect(result.success).toBe(false);
    expect(result.checksPending).toBe(true);
    expect(result.autoMergeEnabled).toBe(false);
    // Crucially: no `gh pr merge` command was ever issued (no --auto, no merge)
    expect(mergeCmds()).toHaveLength(0);
  });

  it('does NOT merge when a check has failed', async () => {
    h.rollup = [
      { status: 'COMPLETED', conclusion: 'SUCCESS', name: 'build' },
      { status: 'COMPLETED', conclusion: 'FAILURE', name: 'zizmor (security audit)' },
    ];

    const result = await svc.mergePR('/work', 42, 'squash', true);

    expect(result.success).toBe(false);
    expect(result.checksFailed).toBe(true);
    expect(result.failedChecks).toContain('zizmor (security audit)');
    expect(mergeCmds()).toHaveLength(0);
  });

  it('merges explicitly (no --auto) when all checks are green', async () => {
    h.rollup = [
      { status: 'COMPLETED', conclusion: 'SUCCESS', name: 'build' },
      { status: 'COMPLETED', conclusion: 'SUCCESS', name: 'test' },
      { status: 'COMPLETED', conclusion: 'SUCCESS', name: 'checks' },
    ];

    const result = await svc.mergePR('/work', 42, 'squash', true);

    expect(result.success).toBe(true);
    const merges = mergeCmds();
    expect(merges.length).toBeGreaterThan(0);
    for (const cmd of merges) {
      expect(cmd).toContain('--squash');
      expect(cmd).not.toContain('--auto');
    }
  });
});
