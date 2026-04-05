import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkFeatureRestartOutcome } from '@/services/startup-recovery-service.js';
import type { Feature } from '@protolabsai/types';

// Mock child_process (exec + execFile both needed by transitive platform imports)
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

import { exec } from 'child_process';
const mockExec = vi.mocked(exec);

/**
 * Helper: make exec call the callback with the given stdout value.
 * The promisify wrapper expects (err, { stdout, stderr }).
 */
function mockExecSuccess(stdout: string) {
  mockExec.mockImplementation((_cmd: unknown, _opts: unknown, cb?: unknown) => {
    const callback = typeof _opts === 'function' ? _opts : cb;
    if (typeof callback === 'function') {
      (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout,
        stderr: '',
      });
    }
    return {} as ReturnType<typeof exec>;
  });
}

function mockExecError(message = 'command failed') {
  mockExec.mockImplementation((_cmd: unknown, _opts: unknown, cb?: unknown) => {
    const callback = typeof _opts === 'function' ? _opts : cb;
    if (typeof callback === 'function') {
      (callback as (err: Error) => void)(new Error(message));
    }
    return {} as ReturnType<typeof exec>;
  });
}

/**
 * Create a sequence of exec responses. Each element is called in order.
 * Use null to indicate success with empty stdout, or a string for stdout output.
 */
function mockExecSequence(responses: Array<string | Error>) {
  let index = 0;
  mockExec.mockImplementation((_cmd: unknown, _opts: unknown, cb?: unknown) => {
    const callback = typeof _opts === 'function' ? _opts : cb;
    if (typeof callback === 'function') {
      const response = responses[index] ?? '';
      index++;
      if (response instanceof Error) {
        (callback as (err: Error) => void)(response);
      } else {
        (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
          stdout: response,
          stderr: '',
        });
      }
    }
    return {} as ReturnType<typeof exec>;
  });
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-abc123',
    category: 'feature',
    description: 'Test feature',
    status: 'in_progress',
    ...overrides,
  } as Feature;
}

const PROJECT_PATH = '/home/user/project';
const BASE_BRANCH = 'main';

describe('checkFeatureRestartOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: Feature has a live open PR → SKIP_HAS_PR
  // ---------------------------------------------------------------------------
  describe('Scenario 1: feature has a live open PR', () => {
    it('returns SKIP_HAS_PR when gh reports PR is OPEN', async () => {
      const feature = makeFeature({ prNumber: 42, branchName: 'feature/my-feat' });

      // gh pr view returns OPEN
      mockExecSuccess('OPEN\n');

      const result = await checkFeatureRestartOutcome(PROJECT_PATH, feature, BASE_BRANCH);

      expect(result.outcome).toBe('SKIP_HAS_PR');
      expect(result.featureId).toBe(feature.id);
      expect(result.reason).toContain('PR #42');
    });

    it('does NOT return SKIP_HAS_PR when PR is CLOSED (falls through to worktree checks)', async () => {
      const feature = makeFeature({ prNumber: 42, branchName: 'feature/my-feat' });

      // Sequence: gh says CLOSED, then worktree check fails (no worktree)
      mockExecSequence([
        'CLOSED\n', // gh pr view
        new Error('not a git repo'), // worktreeExists — git rev-parse fails
      ]);

      const result = await checkFeatureRestartOutcome(PROJECT_PATH, feature, BASE_BRANCH);

      expect(result.outcome).toBe('RESTART_FRESH');
    });

    it('falls through to worktree checks when gh CLI is unavailable', async () => {
      const feature = makeFeature({ prNumber: 7, branchName: 'feature/some-feat' });

      // gh fails, then worktree check also fails
      mockExecSequence([
        new Error('gh: command not found'), // isPROpen fails
        new Error('not a git repo'), // worktreeExists fails
      ]);

      const result = await checkFeatureRestartOutcome(PROJECT_PATH, feature, BASE_BRANCH);

      expect(result.outcome).toBe('RESTART_FRESH');
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Feature has a worktree with commits ahead of base → SAFE_TO_RESUME
  // ---------------------------------------------------------------------------
  describe('Scenario 2: worktree exists with commits ahead of base', () => {
    it('returns SAFE_TO_RESUME when worktree is clean and has commits ahead', async () => {
      const feature = makeFeature({ branchName: 'feature/my-feat' });

      mockExecSequence([
        'true\n', // worktreeExists → git rev-parse --is-inside-work-tree
        '\n', // isWorktreeDirty → git status --porcelain (empty = clean)
        '3\n', // commitsAheadOfBase → git rev-list --count
      ]);

      const result = await checkFeatureRestartOutcome(PROJECT_PATH, feature, BASE_BRANCH);

      expect(result.outcome).toBe('SAFE_TO_RESUME');
      expect(result.reason).toContain('3 commit(s)');
      expect(result.worktreePath).toBeDefined();
    });

    it('returns RESTART_FRESH when worktree is clean but has 0 commits ahead', async () => {
      const feature = makeFeature({ branchName: 'feature/my-feat' });

      mockExecSequence([
        'true\n', // worktreeExists
        '\n', // isWorktreeDirty (clean)
        '0\n', // commitsAheadOfBase → 0 commits
      ]);

      const result = await checkFeatureRestartOutcome(PROJECT_PATH, feature, BASE_BRANCH);

      expect(result.outcome).toBe('RESTART_FRESH');
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Dirty/conflicted worktree → RESET_DIRTY
  // ---------------------------------------------------------------------------
  describe('Scenario 3: dirty or conflicted worktree', () => {
    it('returns RESET_DIRTY when worktree has uncommitted changes', async () => {
      const feature = makeFeature({ branchName: 'feature/my-feat' });

      mockExecSequence([
        'true\n', // worktreeExists
        ' M src/foo.ts\n?? tmp.txt\n', // isWorktreeDirty → non-empty output
      ]);

      const result = await checkFeatureRestartOutcome(PROJECT_PATH, feature, BASE_BRANCH);

      expect(result.outcome).toBe('RESET_DIRTY');
      expect(result.reason).toContain('Dirty worktree detected on restart');
      expect(result.worktreePath).toBeDefined();
    });

    it('RESET_DIRTY reason is suitable for use as statusChangeReason', async () => {
      const feature = makeFeature({ branchName: 'feature/conflicted-feat' });

      mockExecSequence([
        'true\n',
        'UU src/conflict.ts\n', // merge conflict markers in porcelain output
      ]);

      const result = await checkFeatureRestartOutcome(PROJECT_PATH, feature, BASE_BRANCH);

      expect(result.outcome).toBe('RESET_DIRTY');
      expect(result.reason).toBe(
        'Dirty worktree detected on restart — manual intervention required'
      );
    });

    it('treats unreadable worktree status as dirty (safe default)', async () => {
      const feature = makeFeature({ branchName: 'feature/my-feat' });

      mockExecSequence([
        'true\n', // worktreeExists succeeds
        new Error('permission denied'), // isWorktreeDirty → exec fails → treat as dirty
      ]);

      const result = await checkFeatureRestartOutcome(PROJECT_PATH, feature, BASE_BRANCH);

      expect(result.outcome).toBe('RESET_DIRTY');
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: No worktree and no commits → RESTART_FRESH
  // ---------------------------------------------------------------------------
  describe('Scenario 4: no worktree, no commits', () => {
    it('returns RESTART_FRESH when worktree directory does not exist', async () => {
      const feature = makeFeature({ branchName: 'feature/brand-new' });

      // worktreeExists check fails → no worktree
      mockExecError('not a git repo');

      const result = await checkFeatureRestartOutcome(PROJECT_PATH, feature, BASE_BRANCH);

      expect(result.outcome).toBe('RESTART_FRESH');
      expect(result.worktreePath).toBeUndefined();
    });

    it('returns RESTART_FRESH for feature with no branchName and no worktree', async () => {
      const feature = makeFeature({ branchName: undefined });

      mockExecError('not a git repo');

      const result = await checkFeatureRestartOutcome(PROJECT_PATH, feature, BASE_BRANCH);

      expect(result.outcome).toBe('RESTART_FRESH');
    });

    it('derives worktree path from feature.id when branchName is absent', async () => {
      const feature = makeFeature({ id: 'feat-no-branch', branchName: undefined });

      // First call (worktreeExists) returns true, then dirty check returns clean, then 0 ahead
      mockExecSequence([
        'true\n', // worktreeExists — path is derived from feature.id
        '\n', // isWorktreeDirty — clean
        '0\n', // commitsAheadOfBase — 0
      ]);

      const result = await checkFeatureRestartOutcome(PROJECT_PATH, feature, BASE_BRANCH);

      // worktreePath should be derived from feature.id
      expect(result.worktreePath).toContain('feat-no-branch');
      expect(result.outcome).toBe('RESTART_FRESH');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('uses default baseBranch "main" when none is provided', async () => {
      const feature = makeFeature({ branchName: 'feature/test' });

      mockExecSequence(['true\n', '\n', '1\n']);

      const result = await checkFeatureRestartOutcome(PROJECT_PATH, feature);

      expect(result.outcome).toBe('SAFE_TO_RESUME');
    });

    it('sanitises special characters in branchName when deriving worktree path', async () => {
      // Branch names with slashes and dots should be sanitised
      const feature = makeFeature({ branchName: 'feature/my.feat-name' });

      mockExecError('no worktree');

      const result = await checkFeatureRestartOutcome(PROJECT_PATH, feature, BASE_BRANCH);

      expect(result.outcome).toBe('RESTART_FRESH');
    });
  });
});
