/**
 * feature-scheduler-done-lock.test.ts
 *
 * Unit tests for the two pre-flight guards in loadPendingFeatures that prevent
 * auto-mode from re-spawning an agent on work that has already shipped:
 *
 * 1. explicit-done-with-PR-reason guard (24h lock):
 *    If a feature was manually transitioned to 'done' with a statusChangeReason
 *    containing a PR number (e.g. "Shipped via PR #123") within the last 24h,
 *    auto-mode must NOT re-spawn even if the feature was subsequently reset.
 *
 * 2. title-match on recent merged PRs (re-cut branch detection):
 *    If a recently merged PR's title matches the feature's title, the feature
 *    is treated as done without requiring the branch name to match.
 *
 * Covers issue #3432: auto-mode burns 3-retry budget on already-shipped work.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module-level mocks (hoisted before imports) ─────────────────────────────

vi.mock('child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: (fn: unknown) => fn,
}));

vi.mock('@/lib/secure-fs.js', () => ({
  readdir: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
  copyFile: vi.fn(),
  unlink: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  open: vi.fn(),
}));

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual<typeof import('@protolabsai/utils')>('@protolabsai/utils');
  return {
    ...actual,
    readJsonWithRecovery: vi.fn(),
    logRecoveryWarning: vi.fn(),
    atomicWriteJson: vi.fn().mockResolvedValue(undefined),
    recordMemoryUsage: vi.fn(),
    appendLearning: vi.fn(),
  };
});

vi.mock('@protolabsai/platform', async () => {
  const actual =
    await vi.importActual<typeof import('@protolabsai/platform')>('@protolabsai/platform');
  return {
    ...actual,
    getFeaturesDir: vi.fn().mockReturnValue('/fake/project/.automaker/features'),
    getAutomakerDir: vi.fn().mockReturnValue('/fake/project/.automaker'),
    getFeatureDir: vi.fn().mockReturnValue('/fake/project/.automaker/features/feature-001'),
    ensureAutomakerDir: vi.fn().mockResolvedValue(undefined),
    getExecutionStatePath: vi.fn().mockReturnValue('/fake/project/.automaker/execution-state.json'),
  };
});

vi.mock('@/lib/worktree-lock.js', () => ({
  isWorktreeLocked: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/settings-helpers.js', () => ({
  getEffectivePrBaseBranch: vi.fn().mockResolvedValue('dev'),
}));

vi.mock('@/config/timeouts.js', () => ({
  SLEEP_INTERVAL_CAPACITY_MS: 5000,
  SLEEP_INTERVAL_IDLE_MS: 30000,
  SLEEP_INTERVAL_NORMAL_MS: 2000,
  SLEEP_INTERVAL_ERROR_MS: 10000,
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { exec } from 'child_process';
import { readdir } from '@/lib/secure-fs.js';
import { readJsonWithRecovery } from '@protolabsai/utils';
import { getFeaturesDir } from '@protolabsai/platform';
import {
  FeatureScheduler,
  type PipelineRunner,
  type SchedulerCallbacks,
} from '@/services/feature-scheduler.js';
import type { Feature } from '@protolabsai/types';

const mockExec = exec as unknown as ReturnType<typeof vi.fn>;
const mockReaddir = readdir as unknown as ReturnType<typeof vi.fn>;
const mockReadJsonWithRecovery = readJsonWithRecovery as unknown as ReturnType<typeof vi.fn>;
const mockGetFeaturesDir = getFeaturesDir as unknown as ReturnType<typeof vi.fn>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pastCooldown = new Date(Date.now() - 60_000).toISOString();

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: `feature-${Math.random().toString(36).slice(2, 9)}`,
    title: 'Test feature with a sufficiently long title',
    description: 'A test feature',
    status: 'backlog',
    createdAt: pastCooldown,
    updatedAt: pastCooldown,
    order: 0,
    ...overrides,
  };
}

/**
 * Set up the standard exec mock sequence for loadPendingFeatures.
 * @param openPrs - JSON array of open PRs
 * @param mergedPrs - JSON array of merged PRs (with title)
 */
function setupExecMocks(
  openPrs: object[] = [],
  mergedPrs: Array<{
    number: number;
    headRefName: string;
    mergedAt?: string;
    title?: string;
  }> = []
) {
  mockExec.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }); // git branch --show-current
  mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' }); // git worktree list --porcelain
  mockExec.mockResolvedValueOnce({ stdout: JSON.stringify(openPrs), stderr: '' }); // gh pr list --state open
  mockExec.mockResolvedValueOnce({ stdout: JSON.stringify(mergedPrs), stderr: '' }); // gh pr list --state merged
}

function setupFeaturesOnDisk(features: Feature[]) {
  mockReaddir.mockResolvedValue(features.map((f) => ({ name: f.id, isDirectory: () => true })));
  for (const f of features) {
    mockReadJsonWithRecovery.mockResolvedValueOnce({
      data: f,
      recovered: false,
      backupUsed: null,
    });
  }
}

// ─── Shared scheduler setup ───────────────────────────────────────────────────

function makeScheduler() {
  const mockFeatureLoader = {
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    getAll: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  };
  const mockEvents = {
    subscribe: vi.fn(),
    emit: vi.fn(),
    on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    broadcast: vi.fn(),
    setCorrelationContext: vi.fn(),
    getCorrelationContext: vi.fn().mockReturnValue(undefined),
    clearCorrelationContext: vi.fn(),
  };
  const mockRunner: PipelineRunner = { run: vi.fn() };
  const mockCallbacks: SchedulerCallbacks = {
    getRunningCountForWorktree: vi.fn().mockResolvedValue(0),
    getGlobalRunningCount: vi.fn().mockReturnValue(0),
    canProjectAcquireGlobalSlot: vi.fn().mockResolvedValue(true),
    hasInProgressFeatures: vi.fn().mockResolvedValue(false),
    isFeatureRunning: vi.fn().mockReturnValue(false),
    getRunningFeatureIds: vi.fn().mockReturnValue([]),
    isFeatureActiveInPipeline: vi.fn().mockReturnValue(false),
    isFeatureFinished: vi.fn().mockReturnValue(false),
    emitAutoModeEvent: vi.fn(),
    getHeapUsagePercent: vi.fn().mockReturnValue(0),
    getMostRecentRunningFeature: vi.fn().mockReturnValue(null),
    recordSuccessForProject: vi.fn(),
    trackFailureAndCheckPauseForProject: vi.fn().mockReturnValue(false),
    signalShouldPauseForProject: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD: 85,
    HEAP_USAGE_ABORT_AGENTS_THRESHOLD: 92,
  };

  const scheduler = new FeatureScheduler({
    featureLoader: mockFeatureLoader as never,
    settingsService: null,
    events: mockEvents as never,
    runner: mockRunner,
    callbacks: mockCallbacks,
  });

  return { scheduler, mockFeatureLoader };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FeatureScheduler — explicit-done-with-PR-reason guard (24h lock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFeaturesDir.mockReturnValue('/fake/project/.automaker/features');
  });

  it('reconciles a backlog feature to done when statusHistory has a recent done-with-PR transition', async () => {
    const { scheduler, mockFeatureLoader } = makeScheduler();

    const recentDoneAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 minutes ago

    const feature = makeFeature({
      id: 'feat-shipped-001',
      title: 'Implement user authentication flow',
      status: 'backlog', // was reset to backlog after being marked done
      statusHistory: [
        {
          from: 'in_progress',
          to: 'done',
          timestamp: recentDoneAt,
          reason: 'Shipped via re-cut branch — PR #1234',
        },
      ],
    });

    setupExecMocks([], []); // no open or merged PRs matching by branch/prNumber
    setupFeaturesOnDisk([feature]);

    const result = await scheduler.loadPendingFeatures('/fake/project');

    // Feature must NOT be returned for execution — it was already shipped
    const ids = result.map((f) => f.id);
    expect(ids).not.toContain('feat-shipped-001');

    // Feature must be reconciled to done on disk
    expect(mockFeatureLoader.update).toHaveBeenCalledWith(
      '/fake/project',
      'feat-shipped-001',
      expect.objectContaining({ status: 'done' })
    );
  });

  it('does NOT lock out a feature whose done-with-PR history transition is older than 24h', async () => {
    const { scheduler, mockFeatureLoader } = makeScheduler();

    const staleAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago (outside window)

    const feature = makeFeature({
      id: 'feat-stale-lock',
      title: 'Old feature that timed out its 24h lock',
      status: 'backlog',
      statusHistory: [
        {
          from: 'in_progress',
          to: 'done',
          timestamp: staleAt,
          reason: 'Shipped via PR #9999',
        },
      ],
    });

    setupExecMocks([], []);
    setupFeaturesOnDisk([feature]);

    const result = await scheduler.loadPendingFeatures('/fake/project');

    // Feature IS eligible again after the 24h window expires
    const ids = result.map((f) => f.id);
    expect(ids).toContain('feat-stale-lock');

    // No done-reconciliation should have occurred
    const doneUpdates = (mockFeatureLoader.update as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[2]?.status === 'done'
    );
    expect(doneUpdates).toHaveLength(0);
  });

  it('does NOT lock out a done-history transition that has no PR number in the reason', async () => {
    const { scheduler, mockFeatureLoader } = makeScheduler();

    const recentAt = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago

    const feature = makeFeature({
      id: 'feat-no-pr-ref',
      title: 'Feature with manual done but no PR reference',
      status: 'backlog',
      statusHistory: [
        {
          from: 'in_progress',
          to: 'done',
          timestamp: recentAt,
          reason: 'Manually closed — no PR number in this reason',
        },
      ],
    });

    setupExecMocks([], []);
    setupFeaturesOnDisk([feature]);

    const result = await scheduler.loadPendingFeatures('/fake/project');

    // Feature should still be eligible (no PR reference → guard doesn't apply)
    const ids = result.map((f) => f.id);
    expect(ids).toContain('feat-no-pr-ref');
  });

  it('guards a blocked (not just backlog) feature that was recently marked done with a PR ref', async () => {
    const { scheduler, mockFeatureLoader } = makeScheduler();

    const recentAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago

    const feature = makeFeature({
      id: 'feat-blocked-ship',
      title: 'Blocked feature that was shipped via re-cut',
      status: 'blocked',
      failureCount: 3,
      statusHistory: [
        {
          from: 'blocked',
          to: 'done',
          timestamp: recentAt,
          reason: 'Work done on fix/auth-recut — closes PR #5678',
        },
      ],
    });

    setupExecMocks([], []);
    setupFeaturesOnDisk([feature]);

    const result = await scheduler.loadPendingFeatures('/fake/project');

    // Blocked feature must not be re-queued — it was shipped
    const ids = result.map((f) => f.id);
    expect(ids).not.toContain('feat-blocked-ship');

    expect(mockFeatureLoader.update).toHaveBeenCalledWith(
      '/fake/project',
      'feat-blocked-ship',
      expect.objectContaining({ status: 'done' })
    );
  });
});

describe('FeatureScheduler — title-match on recent merged PRs (re-cut branch detection)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFeaturesDir.mockReturnValue('/fake/project/.automaker/features');
  });

  it('reconciles to done when a merged PR title exactly matches the feature title', async () => {
    const { scheduler, mockFeatureLoader } = makeScheduler();

    const feature = makeFeature({
      id: 'feat-recut-001',
      title: 'Implement user authentication flow',
      status: 'backlog',
    });

    setupExecMocks([], [
      {
        number: 42,
        headRefName: 'fix/auth-recut-branch', // different branch name
        mergedAt: new Date().toISOString(),
        title: 'Implement user authentication flow', // same title
      },
    ]);
    setupFeaturesOnDisk([feature]);

    const result = await scheduler.loadPendingFeatures('/fake/project');

    // Feature must not be dispatched
    const ids = result.map((f) => f.id);
    expect(ids).not.toContain('feat-recut-001');

    // Must be reconciled to done with the PR number
    expect(mockFeatureLoader.update).toHaveBeenCalledWith(
      '/fake/project',
      'feat-recut-001',
      expect.objectContaining({ status: 'done', prNumber: 42 })
    );
  });

  it('reconciles to done when the PR title contains the feature title as a substring', async () => {
    const { scheduler, mockFeatureLoader } = makeScheduler();

    const feature = makeFeature({
      id: 'feat-recut-002',
      title: 'Add OAuth2 login support',
      status: 'blocked',
      failureCount: 2,
    });

    setupExecMocks([], [
      {
        number: 99,
        headRefName: 'fix/oauth-recut',
        mergedAt: new Date().toISOString(),
        title: 'Add OAuth2 login support (re-cut from blocked branch)', // PR title contains feature title
      },
    ]);
    setupFeaturesOnDisk([feature]);

    const result = await scheduler.loadPendingFeatures('/fake/project');

    const ids = result.map((f) => f.id);
    expect(ids).not.toContain('feat-recut-002');

    expect(mockFeatureLoader.update).toHaveBeenCalledWith(
      '/fake/project',
      'feat-recut-002',
      expect.objectContaining({ status: 'done', prNumber: 99 })
    );
  });

  it('does NOT reconcile when the PR title is unrelated to the feature title', async () => {
    const { scheduler, mockFeatureLoader } = makeScheduler();

    const feature = makeFeature({
      id: 'feat-no-match',
      title: 'Add dark mode toggle to settings panel',
      status: 'backlog',
    });

    setupExecMocks([], [
      {
        number: 7,
        headRefName: 'fix/unrelated',
        mergedAt: new Date().toISOString(),
        title: 'Fix payment gateway timeout bug', // completely different title
      },
    ]);
    setupFeaturesOnDisk([feature]);

    const result = await scheduler.loadPendingFeatures('/fake/project');

    // Feature should be included in the pending list — no title match
    const ids = result.map((f) => f.id);
    expect(ids).toContain('feat-no-match');

    // No done reconciliation should have occurred for this feature
    const doneUpdates = (mockFeatureLoader.update as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[1] === 'feat-no-match' && call[2]?.status === 'done'
    );
    expect(doneUpdates).toHaveLength(0);
  });

  it('does NOT reconcile a feature with a title shorter than the minimum match length', async () => {
    const { scheduler } = makeScheduler();

    const feature = makeFeature({
      id: 'feat-short-title',
      title: 'Fix bug', // 7 chars normalized — under 10-char threshold
      status: 'backlog',
    });

    setupExecMocks([], [
      {
        number: 5,
        headRefName: 'fix/misc',
        mergedAt: new Date().toISOString(),
        title: 'Fix bug', // exact match but title too short
      },
    ]);
    setupFeaturesOnDisk([feature]);

    const result = await scheduler.loadPendingFeatures('/fake/project');

    // Feature remains eligible — short titles are excluded from fuzzy matching
    const ids = result.map((f) => f.id);
    expect(ids).toContain('feat-short-title');
  });
});
