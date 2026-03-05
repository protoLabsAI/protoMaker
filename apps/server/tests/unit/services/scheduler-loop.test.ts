/**
 * scheduler-loop.test.ts
 *
 * Unit tests for the auto-mode scheduling loop components:
 * - AutoLoopCoordinator: circuit breaker (pause after 3 failures, cooldown, resume)
 * - ConcurrencyManager: lease acquisition/release and count queries
 * - FeatureScheduler: loadPendingFeatures (dep resolution, foundation guard, git-workflow block)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// ─── Imports (after mocks are set up) ────────────────────────────────────────

import { exec } from 'child_process';
import { readdir } from '@/lib/secure-fs.js';
import { readJsonWithRecovery, logRecoveryWarning } from '@protolabsai/utils';
import { getFeaturesDir } from '@protolabsai/platform';
import { AutoLoopCoordinator } from '@/services/auto-mode/auto-loop-coordinator.js';
import { ConcurrencyManager } from '@/services/auto-mode/concurrency-manager.js';
import { AutoModeService } from '@/services/auto-mode-service.js';
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

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: `feature-${Math.random().toString(36).slice(2, 9)}`,
    title: 'Test feature',
    description: 'A test feature',
    status: 'backlog',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: 0,
    ...overrides,
  };
}

function setupDefaultExecMocks() {
  // git branch --show-current -> 'main'
  mockExec.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
  // git worktree list --porcelain -> no extra worktrees
  mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
  // gh pr list --state open -> empty
  mockExec.mockResolvedValueOnce({ stdout: '[]', stderr: '' });
  // gh pr list --state merged -> empty
  mockExec.mockResolvedValueOnce({ stdout: '[]', stderr: '' });
}

function setupFeaturesOnDisk(features: Feature[]) {
  // readdir returns one entry per feature
  mockReaddir.mockResolvedValue(features.map((f) => ({ name: f.id, isDirectory: () => true })));
  // readJsonWithRecovery returns each feature in order
  for (const f of features) {
    mockReadJsonWithRecovery.mockResolvedValueOnce({
      data: f,
      recovered: false,
      backupUsed: null,
    });
  }
}

// ─── AutoLoopCoordinator — circuit breaker ───────────────────────────────────

describe('AutoLoopCoordinator - circuit breaker', () => {
  let coordinator: AutoLoopCoordinator;

  beforeEach(() => {
    coordinator = new AutoLoopCoordinator();
  });

  it('returns false for fewer than 3 failures within the window', () => {
    const key = 'project::__main__';
    const config = {
      maxConcurrency: 3,
      useWorktrees: false,
      projectPath: '/project',
      branchName: null,
    };
    coordinator.startLoop(key, config, async () => {});

    expect(coordinator.trackFailure(key, 'error 1')).toBe(false);
    expect(coordinator.trackFailure(key, 'error 2')).toBe(false);
  });

  it('returns true (trigger pause) on the 3rd failure within the window', () => {
    const key = 'project::__main__';
    const config = {
      maxConcurrency: 3,
      useWorktrees: false,
      projectPath: '/project',
      branchName: null,
    };
    coordinator.startLoop(key, config, async () => {});

    coordinator.trackFailure(key, 'error 1');
    coordinator.trackFailure(key, 'error 2');
    expect(coordinator.trackFailure(key, 'error 3')).toBe(true);
  });

  it('ignores failures outside the 60-second rolling window', () => {
    const key = 'project::__main__';
    const config = {
      maxConcurrency: 3,
      useWorktrees: false,
      projectPath: '/project',
      branchName: null,
    };
    coordinator.startLoop(key, config, async () => {});
    const state = coordinator.getState(key)!;

    // Manually plant two stale failures (older than 60s)
    const oldTs = Date.now() - 65_000;
    state.failureTimestamps.push(oldTs, oldTs);

    // First fresh failure: window prunes the 2 stale entries, count = 1 → no pause
    expect(coordinator.trackFailure(key, 'fresh error 1')).toBe(false);
    // Only the 1 fresh failure remains
    expect(state.failureTimestamps).toHaveLength(1);
  });

  it('resetFailures clears timestamps and sets isPaused=false', () => {
    const key = 'project::__main__';
    const config = {
      maxConcurrency: 3,
      useWorktrees: false,
      projectPath: '/project',
      branchName: null,
    };
    coordinator.startLoop(key, config, async () => {});
    const state = coordinator.getState(key)!;

    // Trigger pause
    coordinator.trackFailure(key, 'e1');
    coordinator.trackFailure(key, 'e2');
    coordinator.trackFailure(key, 'e3');
    coordinator.pauseLoop(key);
    expect(state.isPaused).toBe(true);

    coordinator.resetFailures(key);
    expect(state.failureTimestamps).toHaveLength(0);
    expect(state.isPaused).toBe(false);
  });

  it('pauseLoop sets isPaused=true and isRunning=false, aborts the signal', () => {
    const key = 'project::__main__';
    const config = {
      maxConcurrency: 3,
      useWorktrees: false,
      projectPath: '/project',
      branchName: null,
    };
    coordinator.startLoop(key, config, async () => {});
    const state = coordinator.getState(key)!;
    const { signal } = state.abortController;

    expect(state.isRunning).toBe(true);
    expect(state.isPaused).toBe(false);

    coordinator.pauseLoop(key);

    expect(state.isRunning).toBe(false);
    expect(state.isPaused).toBe(true);
    expect(signal.aborted).toBe(true);
    // State remains in loops map (not deleted — for cooldown timer access)
    expect(coordinator.loops.has(key)).toBe(true);
  });

  it('cooldown timer is cleared when stopLoop is called', () => {
    const key = 'project::__main__';
    const config = {
      maxConcurrency: 3,
      useWorktrees: false,
      projectPath: '/project',
      branchName: null,
    };
    coordinator.startLoop(key, config, async () => {});
    const state = coordinator.getState(key)!;

    // Attach a fake cooldown timer
    state.cooldownTimer = setTimeout(() => {}, 999_999);

    const stopped = coordinator.stopLoop(key);
    expect(stopped).not.toBeNull();
    // Timer should have been cleared (state.cooldownTimer set to null by stopLoop)
    expect(stopped!.cooldownTimer).toBeNull();
    // Loop removed from map
    expect(coordinator.loops.has(key)).toBe(false);
  });

  it('resumeLoop creates fresh state with clean failure history', () => {
    const key = 'project::__main__';
    const config = {
      maxConcurrency: 3,
      useWorktrees: false,
      projectPath: '/project',
      branchName: null,
    };
    coordinator.startLoop(key, config, async () => {});
    coordinator.trackFailure(key, 'e1');
    coordinator.trackFailure(key, 'e2');
    coordinator.pauseLoop(key);

    const runFn = vi.fn().mockResolvedValue(undefined);
    const newState = coordinator.resumeLoop(key, config, runFn);

    expect(newState).not.toBeNull();
    expect(newState!.failureTimestamps).toHaveLength(0);
    expect(newState!.isPaused).toBe(false);
    expect(newState!.isRunning).toBe(true);
    expect(runFn).toHaveBeenCalledOnce();
  });

  it('makeKey normalises "main" branchName to __main__', () => {
    expect(coordinator.makeKey('/proj', null)).toBe('/proj::__main__');
    expect(coordinator.makeKey('/proj', 'main')).toBe('/proj::__main__');
    expect(coordinator.makeKey('/proj', 'feature/foo')).toBe('/proj::feature/foo');
  });
});

// ─── ConcurrencyManager — lease management ───────────────────────────────────

describe('ConcurrencyManager - lease management', () => {
  let manager: ConcurrencyManager;

  beforeEach(() => {
    manager = new ConcurrencyManager();
  });

  it('acquire() returns true for a new feature (first acquisition)', () => {
    const result = manager.acquire('feat-1', '/project', null, null);
    expect(result).toBe(true);
    expect(manager.has('feat-1')).toBe(true);
    expect(manager.size).toBe(1);
  });

  it('acquire() returns false for an already-running feature and increments leaseCount', () => {
    manager.acquire('feat-1', '/project', null, null);
    const result = manager.acquire('feat-1', '/project', null, null);
    expect(result).toBe(false);
    // leaseCount should be 2
    expect(manager.get('feat-1')!.leaseCount).toBe(2);
    // Still only 1 unique feature in the map
    expect(manager.size).toBe(1);
  });

  it('release() returns true and removes lease when leaseCount reaches zero', () => {
    manager.acquire('feat-1', '/project', null, null);
    const released = manager.release('feat-1');
    expect(released).toBe(true);
    expect(manager.has('feat-1')).toBe(false);
    expect(manager.size).toBe(0);
  });

  it('release() returns false and decrements leaseCount without removing when count > 1', () => {
    manager.acquire('feat-1', '/project', null, null);
    manager.acquire('feat-1', '/project', null, null); // leaseCount = 2
    const released = manager.release('feat-1');
    expect(released).toBe(false);
    expect(manager.has('feat-1')).toBe(true);
    expect(manager.get('feat-1')!.leaseCount).toBe(1);
  });

  it('release() returns false for a feature with no active lease', () => {
    expect(manager.release('nonexistent')).toBe(false);
  });

  it('getRunningCountForProject counts all active leases for a project', () => {
    manager.acquire('feat-a', '/project-x', null, null);
    manager.acquire('feat-b', '/project-x', null, null);
    manager.acquire('feat-c', '/project-y', null, null);

    expect(manager.getRunningCountForProject('/project-x')).toBe(2);
    expect(manager.getRunningCountForProject('/project-y')).toBe(1);
    expect(manager.getRunningCountForProject('/project-z')).toBe(0);
  });

  it('getRunningCountForWorktree with null branchName counts all features in project', () => {
    manager.acquire('feat-a', '/project', null, 'feature/branch-a');
    manager.acquire('feat-b', '/project', null, 'feature/branch-b');

    expect(manager.getRunningCountForWorktree('/project', null)).toBe(2);
  });

  it('getRunningCountForWorktree with specific branchName counts only matching leases', () => {
    manager.acquire('feat-a', '/project', null, 'feature/branch-a');
    manager.acquire('feat-b', '/project', null, 'feature/branch-b');

    expect(manager.getRunningCountForWorktree('/project', 'feature/branch-a')).toBe(1);
    expect(manager.getRunningCountForWorktree('/project', 'feature/branch-b')).toBe(1);
    expect(manager.getRunningCountForWorktree('/project', 'feature/other')).toBe(0);
  });

  it('max concurrency: acquiring more than the limit is tracked by caller (size reflects total)', () => {
    const maxConcurrency = 2;
    manager.acquire('feat-1', '/project', null, null);
    manager.acquire('feat-2', '/project', null, null);

    // Manager size reflects how many features are running
    expect(manager.size).toBe(maxConcurrency);

    // A third acquire would return true (new lease) — it is the caller's responsibility
    // to check getRunningCountForProject() against maxConcurrency before calling acquire()
    const third = manager.acquire('feat-3', '/project', null, null);
    expect(third).toBe(true);
    expect(manager.size).toBe(3);
  });

  it('double-acquire for same feature does NOT create a second lease', () => {
    manager.acquire('feat-1', '/project', null, null);
    manager.acquire('feat-1', '/project', null, null);

    // Still exactly one lease in the map
    expect(manager.size).toBe(1);
    expect(manager.get('feat-1')!.leaseCount).toBe(2);
  });
});

// ─── AutoModeService — loadPendingFeatures ───────────────────────────────────

describe('FeatureScheduler - loadPendingFeatures', () => {
  let scheduler: FeatureScheduler;
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
  };
  const mockRunner: PipelineRunner = { run: vi.fn() };
  const mockCallbacks: SchedulerCallbacks = {
    getRunningCountForWorktree: vi.fn().mockResolvedValue(0),
    hasInProgressFeatures: vi.fn().mockResolvedValue(false),
    isFeatureRunning: vi.fn().mockReturnValue(false),
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFeaturesDir.mockReturnValue('/fake/project/.automaker/features');
    mockEvents.on.mockReturnValue({ unsubscribe: vi.fn() });
    mockFeatureLoader.update.mockResolvedValue(undefined);
    scheduler = new FeatureScheduler({
      featureLoader: mockFeatureLoader as never,
      settingsService: null,
      events: mockEvents as never,
      runner: mockRunner,
      callbacks: mockCallbacks,
    });
  });

  const callLoadPendingFeatures = (projectPath: string, branchName: string | null = null) => {
    return scheduler.loadPendingFeatures(projectPath, branchName);
  };

  it('dep-satisfied: feature with all deps in "done" state is returned', async () => {
    const dep = makeFeature({ id: 'dep-001', status: 'done' });
    const feature = makeFeature({ id: 'feat-002', status: 'backlog', dependencies: ['dep-001'] });

    setupDefaultExecMocks();
    setupFeaturesOnDisk([dep, feature]);

    const result = await callLoadPendingFeatures('/fake/project');

    const ids = result.map((f) => f.id);
    expect(ids).toContain('feat-002');
  });

  it('dep-not-satisfied: feature with dep still in "backlog" is excluded from result', async () => {
    const dep = makeFeature({ id: 'dep-001', status: 'backlog' });
    const feature = makeFeature({ id: 'feat-002', status: 'backlog', dependencies: ['dep-001'] });

    setupDefaultExecMocks();
    setupFeaturesOnDisk([dep, feature]);

    const result = await callLoadPendingFeatures('/fake/project');

    const ids = result.map((f) => f.id);
    // dep has no deps so it should be included; feat-002 is blocked
    expect(ids).toContain('dep-001');
    expect(ids).not.toContain('feat-002');
  });

  it('foundation dep: "review" status does NOT satisfy a foundation dependency', async () => {
    const foundationDep = makeFeature({
      id: 'dep-foundation',
      status: 'review',
      isFoundation: true,
    });
    const feature = makeFeature({
      id: 'feat-after-foundation',
      status: 'backlog',
      dependencies: ['dep-foundation'],
    });

    setupDefaultExecMocks();
    setupFeaturesOnDisk([foundationDep, feature]);

    const result = await callLoadPendingFeatures('/fake/project');

    const ids = result.map((f) => f.id);
    // Foundation dep is in 'review', not 'done' → feat-after-foundation is still blocked
    expect(ids).not.toContain('feat-after-foundation');
  });

  it('foundation dep: "done" status DOES satisfy a foundation dependency', async () => {
    const foundationDep = makeFeature({
      id: 'dep-foundation',
      status: 'done',
      isFoundation: true,
    });
    const feature = makeFeature({
      id: 'feat-after-foundation',
      status: 'backlog',
      dependencies: ['dep-foundation'],
    });

    setupDefaultExecMocks();
    setupFeaturesOnDisk([foundationDep, feature]);

    const result = await callLoadPendingFeatures('/fake/project');

    const ids = result.map((f) => f.id);
    expect(ids).toContain('feat-after-foundation');
  });

  it('non-foundation dep: "review" status DOES satisfy a regular dependency', async () => {
    const regularDep = makeFeature({
      id: 'dep-regular',
      status: 'review',
      isFoundation: false,
    });
    const feature = makeFeature({
      id: 'feat-after-regular',
      status: 'backlog',
      dependencies: ['dep-regular'],
    });

    setupDefaultExecMocks();
    setupFeaturesOnDisk([regularDep, feature]);

    const result = await callLoadPendingFeatures('/fake/project');

    const ids = result.map((f) => f.id);
    // Non-foundation dep in 'review' unblocks the downstream feature
    expect(ids).toContain('feat-after-regular');
  });

  it('git-workflow block guard: feature with open PR branch is synced to review and excluded', async () => {
    const feature = makeFeature({
      id: 'feat-with-pr',
      status: 'backlog',
      branchName: 'feature/already-has-pr',
    });

    // git branch --show-current -> 'main'
    mockExec.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
    // git worktree list -> empty
    mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });
    // gh pr list --state open -> returns our feature's branch as having PR #99
    mockExec.mockResolvedValueOnce({
      stdout: JSON.stringify([{ number: 99, headRefName: 'feature/already-has-pr' }]),
      stderr: '',
    });
    // gh pr list --state merged -> empty
    mockExec.mockResolvedValueOnce({ stdout: '[]', stderr: '' });

    setupFeaturesOnDisk([feature]);

    // featureLoader.update is already mocked at describe-level

    const result = await callLoadPendingFeatures('/fake/project');

    // Feature should not appear in pending list (has open PR)
    const ids = result.map((f) => f.id);
    expect(ids).not.toContain('feat-with-pr');
  });
});

// ─── AutoModeService — concurrency and race prevention ───────────────────────

describe('AutoModeService - concurrency and race prevention', () => {
  let service: AutoModeService;
  const mockEvents = {
    subscribe: vi.fn(),
    emit: vi.fn(),
    on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEvents.on.mockReturnValue({ unsubscribe: vi.fn() });
    service = new AutoModeService(mockEvents as any);
  });

  afterEach(async () => {
    await service.stopAutoLoopForProject('/test/project', null).catch(() => {});
    await service.stopAutoLoopForProject('/test/project', 'feature/branch').catch(() => {});
  });

  it('startAutoLoopForProject prevents double-start for the same project+branch', async () => {
    const promises = [
      service.startAutoLoopForProject('/test/project', null, 3),
      service.startAutoLoopForProject('/test/project', null, 3),
      service.startAutoLoopForProject('/test/project', null, 3),
    ];

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    rejected.forEach((r) => {
      if (r.status === 'rejected') {
        expect(r.reason.message).toContain('already running');
      }
    });

    await service.stopAutoLoopForProject('/test/project', null);
  });

  it('different project+branch combinations can run concurrently', async () => {
    await expect(service.startAutoLoopForProject('/test/project', null, 2)).resolves.not.toThrow();

    await expect(
      service.startAutoLoopForProject('/test/project', 'feature/branch', 2)
    ).resolves.not.toThrow();

    await service.stopAutoLoopForProject('/test/project', null);
    await service.stopAutoLoopForProject('/test/project', 'feature/branch');
  });

  it('max concurrency is tracked via ConcurrencyManager per project', () => {
    const manager: ConcurrencyManager = (service as any).concurrencyManager;

    // Simulate 2 features running in a project with maxConcurrency=2
    manager.acquire('feat-a', '/project', null, null);
    manager.acquire('feat-b', '/project', null, null);

    expect(manager.getRunningCountForProject('/project')).toBe(2);

    // Scheduler should check this count before starting more
    const count = manager.getRunningCountForProject('/project');
    const maxConcurrency = 2;
    expect(count >= maxConcurrency).toBe(true);
  });
});
