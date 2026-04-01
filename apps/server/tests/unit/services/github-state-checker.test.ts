/**
 * GitHubStateChecker — merged PR reconciliation tests
 *
 * Verifies that `checkProject` generates a `pr-merged-status-stale` drift for
 * features in ANY non-done status when their PR is found to be merged — not just
 * features in 'review' or 'blocked'.
 *
 * Bug fixed: features in 'backlog' or 'in_progress' with merged PRs were silently
 * skipped, requiring manual `update_feature` calls to move them to 'done'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process.exec before imports so all execAsync calls are intercepted
const { mockExec } = vi.hoisted(() => ({ mockExec: vi.fn() }));
vi.mock('child_process', () => ({
  exec: mockExec,
}));
vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>();
  return {
    ...actual,
    promisify: (fn: unknown) => {
      if (fn === mockExec) {
        return async (cmd: string, opts?: unknown) => {
          // Return from our mockExec via callback-style wrapped in a promise
          return new Promise((resolve, reject) => {
            mockExec(cmd, opts, (err: Error | null, stdout: string) => {
              if (err) reject(err);
              else resolve({ stdout, stderr: '' });
            });
          });
        };
      }
      return actual.promisify(fn as Parameters<typeof actual.promisify>[0]);
    },
  };
});

import { GitHubStateChecker } from '@/services/github-state-checker.js';
import type { Feature } from '@protolabsai/types';

// ────────────────────────── Helpers ──────────────────────────

function makeMockFeatureLoader(features: Partial<Feature>[] = []) {
  return {
    getAll: vi.fn().mockResolvedValue(
      features.map((f) => ({
        id: 'feature-default',
        title: 'Default Feature',
        status: 'review',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...f,
      }))
    ),
  };
}

/** Build a `gh pr list` JSON response for a merged PR */
function mergedPRListResponse(prNumber = 42, branchName = 'feature/test-branch') {
  return JSON.stringify([
    {
      number: prNumber,
      state: 'closed',
      merged: true,
      mergedAt: '2026-04-01T10:00:00.000Z',
      headRefName: branchName,
      updatedAt: '2026-04-01T10:00:00.000Z',
    },
  ]);
}

/** Build a `gh pr view` JSON response for a merged PR */
function mergedPRViewResponse(prNumber = 42, branchName = 'feature/test-branch') {
  return JSON.stringify({
    number: prNumber,
    state: 'closed',
    merged: true,
    mergedAt: '2026-04-01T10:00:00.000Z',
    headRefName: branchName,
    updatedAt: '2026-04-01T10:00:00.000Z',
  });
}

/** Set up exec mock to answer gh pr list + gh pr view --json reviews */
function setupGhMock(prNumber: number, branchName: string, usePrList = true) {
  mockExec.mockImplementation(
    (cmd: string, _opts: unknown, cb: (err: null, stdout: string) => void) => {
      if (cmd.includes('gh pr list') && cmd.includes(branchName)) {
        cb(null, usePrList ? mergedPRListResponse(prNumber, branchName) : '[]');
      } else if (cmd.includes(`gh pr view ${prNumber}`) && cmd.includes('--json reviews')) {
        // Reviews endpoint
        cb(null, '');
      } else if (cmd.includes(`gh pr view ${prNumber}`)) {
        cb(null, mergedPRViewResponse(prNumber, branchName));
      } else {
        cb(null, '[]');
      }
    }
  );
}

// ────────────────────────── Tests ──────────────────────────

describe('GitHubStateChecker.checkProject — merged PR reconciliation', () => {
  const projectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates pr-merged-status-stale drift for a feature in review', async () => {
    const prNumber = 100;
    const branchName = 'feature/topic-bus';
    const loader = makeMockFeatureLoader([
      { id: 'feature-review', title: 'Topic Bus', status: 'review', branchName, prNumber },
    ]);

    setupGhMock(prNumber, branchName);

    const checker = new GitHubStateChecker(loader as never);
    checker.registerProject(projectPath);
    const drifts = await checker.checkProject(projectPath);

    const merged = drifts.filter((d) => d.type === 'pr-merged-status-stale');
    expect(merged).toHaveLength(1);
    expect(merged[0].featureId).toBe('feature-review');
    expect(merged[0].prNumber).toBe(prNumber);
  });

  it('generates pr-merged-status-stale drift for a feature in blocked (regression case)', async () => {
    const prNumber = 200;
    const branchName = 'feature/verification-ladder';
    const loader = makeMockFeatureLoader([
      {
        id: 'feature-blocked',
        title: 'Verification Ladder',
        status: 'blocked',
        branchName,
        prNumber,
      },
    ]);

    setupGhMock(prNumber, branchName);

    const checker = new GitHubStateChecker(loader as never);
    checker.registerProject(projectPath);
    const drifts = await checker.checkProject(projectPath);

    const merged = drifts.filter((d) => d.type === 'pr-merged-status-stale');
    expect(merged).toHaveLength(1);
    expect(merged[0].featureId).toBe('feature-blocked');
    expect(merged[0].details.previousStatus).toBe('blocked');
  });

  it('generates pr-merged-status-stale drift for a feature in backlog (regression case)', async () => {
    const prNumber = 300;
    const branchName = 'feature/git-identity';
    const loader = makeMockFeatureLoader([
      {
        id: 'feature-backlog',
        title: 'Git Identity',
        status: 'backlog',
        branchName,
        prNumber,
      },
    ]);

    setupGhMock(prNumber, branchName);

    const checker = new GitHubStateChecker(loader as never);
    checker.registerProject(projectPath);
    const drifts = await checker.checkProject(projectPath);

    const merged = drifts.filter((d) => d.type === 'pr-merged-status-stale');
    expect(merged).toHaveLength(1);
    expect(merged[0].featureId).toBe('feature-backlog');
    expect(merged[0].details.previousStatus).toBe('backlog');
  });

  it('generates pr-merged-status-stale drift for a feature in in_progress', async () => {
    const prNumber = 400;
    const branchName = 'feature/some-work';
    const loader = makeMockFeatureLoader([
      {
        id: 'feature-in-progress',
        title: 'Some Work',
        status: 'in_progress',
        branchName,
        prNumber,
      },
    ]);

    setupGhMock(prNumber, branchName);

    const checker = new GitHubStateChecker(loader as never);
    checker.registerProject(projectPath);
    const drifts = await checker.checkProject(projectPath);

    const merged = drifts.filter((d) => d.type === 'pr-merged-status-stale');
    expect(merged).toHaveLength(1);
    expect(merged[0].featureId).toBe('feature-in-progress');
  });

  it('does NOT generate drift for a feature already in done', async () => {
    const prNumber = 500;
    const branchName = 'feature/already-done';
    const loader = makeMockFeatureLoader([
      { id: 'feature-done', title: 'Already Done', status: 'done', branchName, prNumber },
    ]);

    setupGhMock(prNumber, branchName);

    const checker = new GitHubStateChecker(loader as never);
    checker.registerProject(projectPath);
    const drifts = await checker.checkProject(projectPath);

    const merged = drifts.filter((d) => d.type === 'pr-merged-status-stale');
    expect(merged).toHaveLength(0);
  });

  it('falls back to prNumber lookup when branch-name lookup returns no PR', async () => {
    const prNumber = 600;
    // Feature has a stored prNumber but branch lookup returns nothing (simulates rebased branch)
    const loader = makeMockFeatureLoader([
      {
        id: 'feature-rebased',
        title: 'Rebased Feature',
        status: 'blocked',
        branchName: 'feature/old-branch-name',
        prNumber,
      },
    ]);

    mockExec.mockImplementation(
      (cmd: string, _opts: unknown, cb: (err: null, stdout: string) => void) => {
        if (cmd.includes('gh pr list')) {
          // Branch lookup returns empty — branch was renamed
          cb(null, '[]');
        } else if (cmd.includes(`gh pr view ${prNumber}`) && cmd.includes('--json reviews')) {
          cb(null, '');
        } else if (cmd.includes(`gh pr view ${prNumber}`)) {
          // Fallback by prNumber succeeds
          cb(null, mergedPRViewResponse(prNumber, 'feature/new-branch-name'));
        } else {
          cb(null, '[]');
        }
      }
    );

    const checker = new GitHubStateChecker(loader as never);
    checker.registerProject(projectPath);
    const drifts = await checker.checkProject(projectPath);

    const merged = drifts.filter((d) => d.type === 'pr-merged-status-stale');
    expect(merged).toHaveLength(1);
    expect(merged[0].featureId).toBe('feature-rebased');
    expect(merged[0].prNumber).toBe(prNumber);
  });
});
