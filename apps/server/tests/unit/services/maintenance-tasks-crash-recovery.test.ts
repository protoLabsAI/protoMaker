/**
 * Unit tests for the crash recovery scan in maintenance-tasks.ts.
 *
 * Covers the bug where maintenance scan finds worktrees with unpushed: true
 * and status: done, then triggers post-completion workflow — even when the
 * feature's PR was already merged to dev and the remote branch was deleted.
 *
 * Fix: before triggering post-completion workflow, the scan now checks:
 *   (1) does the remote branch still exist?
 *   (2) is the feature's commit already reachable from the target branch (dev)?
 * If no/yes respectively, the worktree is skipped (queued for cleanup), not pushed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature } from '@protolabsai/types';

// ─── Module mocks (hoisted before imports) ───────────────────────────────────

vi.mock('child_process', () => {
  const execFile = vi.fn();
  return { execFile };
});

vi.mock('util', () => ({
  promisify: (fn: unknown) => fn,
}));

vi.mock('@/services/git-workflow-service.js', () => ({
  gitWorkflowService: {
    runPostCompletionWorkflow: vi.fn(),
  },
}));

vi.mock('@/services/merge-eligibility-service.js', () => ({
  mergeEligibilityService: {},
}));

vi.mock('@/services/github-merge-service.js', () => ({
  githubMergeService: {},
}));

vi.mock('@/lib/settings-helpers.js', () => ({
  getEffectivePrBaseBranch: vi.fn(),
}));

vi.mock('@/lib/circuit-breaker.js', () => {
  class CircuitBreaker {
    isCircuitOpen() {
      return false;
    }
    recordSuccess() {}
    recordFailure() {
      return false;
    }
    getState() {
      return { failureCount: 0, timeSinceLastFailure: 0 };
    }
    constructor(_opts: unknown) {}
  }
  return { CircuitBreaker };
});

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(),
}));

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual('@protolabsai/utils');
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  return { ...actual, createLogger: () => mockLogger };
});

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { scanWorktreesForCrashRecovery } from '@/services/maintenance-tasks.js';
import { execFile } from 'child_process';
import { gitWorkflowService } from '@/services/git-workflow-service.js';
import { getEffectivePrBaseBranch } from '@/lib/settings-helpers.js';
const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
const mockRunPostCompletion = gitWorkflowService.runPostCompletionWorkflow as ReturnType<
  typeof vi.fn
>;
const mockGetEffectivePrBaseBranch = getEffectivePrBaseBranch as ReturnType<typeof vi.fn>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWorktreeBlock(path: string, branch: string): string {
  return `worktree ${path}\nHEAD abc123\nbranch refs/heads/${branch}`;
}

function makeDoneFeature(branchName: string): Feature {
  return {
    id: 'feature-test-001',
    title: 'Test feature',
    description: 'Some description',
    status: 'done',
    branchName,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    order: 0,
  };
}

const PROJECT_PATH = '/fake/project';
const WORKTREE_PATH = '/fake/project/.worktrees/feature/test-branch';
const BRANCH = 'feature/test-branch';

function makeFeatureLoader(features: Feature[]) {
  return {
    getAll: vi.fn().mockResolvedValue(features),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSettingsService() {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({}),
    getProjectSettings: vi.fn().mockResolvedValue({}),
  };
}

function makeEvents() {
  return { emit: vi.fn() };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('scanWorktreesForCrashRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore mock implementations cleared by mockReset:true in vitest config
    mockGetEffectivePrBaseBranch.mockResolvedValue('dev');
  });

  it('skips post-completion workflow when remote branch is gone and work is already merged', async () => {
    // git worktree list --porcelain
    mockExecFile.mockResolvedValueOnce({
      stdout: makeWorktreeBlock(WORKTREE_PATH, BRANCH),
      stderr: '',
    });
    // resolveIntegrationBranch: git rev-parse --verify dev → success
    mockExecFile.mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });
    // git status --porcelain → no uncommitted changes
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
    // git remote prune origin → success
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
    // git ls-remote --exit-code origin refs/heads/feature/test-branch → THROWS (remote branch deleted)
    mockExecFile.mockRejectedValueOnce(new Error('exit code 2'));
    // git merge-base --is-ancestor feature/test-branch origin/dev → success (work is merged)
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

    const featureLoader = makeFeatureLoader([makeDoneFeature(BRANCH)]);
    const settingsService = makeSettingsService();
    const events = makeEvents();

    await scanWorktreesForCrashRecovery(
      PROJECT_PATH,
      featureLoader as never,
      settingsService as never,
      events as never
    );

    // post-completion workflow must NOT be triggered
    expect(mockRunPostCompletion).not.toHaveBeenCalled();

    // Event should report 0 recovered
    expect(events.emit).toHaveBeenCalledWith(
      'maintenance:crash_recovery_scan_completed',
      expect.objectContaining({
        projectPath: PROJECT_PATH,
        totalScanned: 1,
        totalRecovered: 0,
        totalWarnings: 0,
      })
    );
  });

  it('triggers post-completion workflow when remote branch is gone but work is NOT merged', async () => {
    // Use a unique branch name to avoid hitting the cached circuit breaker from another test
    const branch = 'feature/not-yet-merged';
    const worktreePath = `/fake/project/.worktrees/${branch}`;

    // git worktree list --porcelain
    mockExecFile.mockResolvedValueOnce({
      stdout: makeWorktreeBlock(worktreePath, branch),
      stderr: '',
    });
    // resolveIntegrationBranch: git rev-parse --verify dev → success
    mockExecFile.mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });
    // git status --porcelain → no uncommitted changes
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
    // git remote prune origin → success
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
    // git ls-remote --exit-code origin refs/heads/... → THROWS (remote branch deleted)
    mockExecFile.mockRejectedValueOnce(new Error('exit code 2'));
    // git merge-base --is-ancestor ... origin/dev → THROWS (not yet merged)
    mockExecFile.mockRejectedValueOnce(new Error('not an ancestor'));

    mockRunPostCompletion.mockResolvedValueOnce({
      pushed: true,
      commitHash: 'abc123',
      prUrl: 'https://github.com/owner/repo/pull/99',
    });

    const feature: Feature = { ...makeDoneFeature(branch), id: 'feature-test-002' };
    const featureLoader = makeFeatureLoader([feature]);
    const settingsService = makeSettingsService();
    const events = makeEvents();

    await scanWorktreesForCrashRecovery(
      PROJECT_PATH,
      featureLoader as never,
      settingsService as never,
      events as never
    );

    // post-completion workflow MUST be triggered
    expect(mockRunPostCompletion).toHaveBeenCalledOnce();
    expect(mockRunPostCompletion).toHaveBeenCalledWith(
      PROJECT_PATH,
      'feature-test-002',
      expect.objectContaining({ status: 'done', branchName: branch }),
      worktreePath,
      {},
      undefined,
      events,
      undefined
    );

    expect(events.emit).toHaveBeenCalledWith(
      'maintenance:crash_recovery_scan_completed',
      expect.objectContaining({
        totalRecovered: 1,
      })
    );
  });

  it('triggers post-completion workflow when remote branch exists with unpushed commits', async () => {
    // Use a unique branch name to avoid hitting the cached circuit breaker from another test
    const branch = 'feature/has-unpushed-commits';
    const worktreePath = `/fake/project/.worktrees/${branch}`;

    // git worktree list --porcelain
    mockExecFile.mockResolvedValueOnce({
      stdout: makeWorktreeBlock(worktreePath, branch),
      stderr: '',
    });
    // resolveIntegrationBranch: git rev-parse --verify dev → success
    mockExecFile.mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });
    // git status --porcelain → no uncommitted changes
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
    // git remote prune origin → success
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
    // git ls-remote --exit-code origin refs/heads/... → success (remote exists)
    mockExecFile.mockResolvedValueOnce({
      stdout: `abc123\trefs/heads/${branch}\n`,
      stderr: '',
    });
    // git rev-list origin/branch..branch --count → 2 unpushed
    mockExecFile.mockResolvedValueOnce({ stdout: '2\n', stderr: '' });

    mockRunPostCompletion.mockResolvedValueOnce({
      pushed: true,
      commitHash: 'abc123',
      prUrl: null,
    });

    const feature: Feature = { ...makeDoneFeature(branch), id: 'feature-test-003' };
    const featureLoader = makeFeatureLoader([feature]);
    const settingsService = makeSettingsService();
    const events = makeEvents();

    await scanWorktreesForCrashRecovery(
      PROJECT_PATH,
      featureLoader as never,
      settingsService as never,
      events as never
    );

    expect(mockRunPostCompletion).toHaveBeenCalledOnce();
    expect(events.emit).toHaveBeenCalledWith(
      'maintenance:crash_recovery_scan_completed',
      expect.objectContaining({ totalRecovered: 1 })
    );
  });

  it('skips worktrees with no matching feature', async () => {
    // git worktree list --porcelain — a branch with no associated feature
    mockExecFile.mockResolvedValueOnce({
      stdout: makeWorktreeBlock(WORKTREE_PATH, 'feature/orphan-branch'),
      stderr: '',
    });
    // resolveIntegrationBranch: git rev-parse --verify dev → success
    mockExecFile.mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' });

    const featureLoader = makeFeatureLoader([]); // no features
    const settingsService = makeSettingsService();
    const events = makeEvents();

    await scanWorktreesForCrashRecovery(
      PROJECT_PATH,
      featureLoader as never,
      settingsService as never,
      events as never
    );

    expect(mockRunPostCompletion).not.toHaveBeenCalled();
  });
});
