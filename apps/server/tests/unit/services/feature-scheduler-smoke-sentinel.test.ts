/**
 * Unit tests for FeatureScheduler — smoke-check sentinel filter
 *
 * Covers:
 * - loadPendingFeatures skips features whose title starts with "[SMOKE-"
 * - loadPendingFeatures skips features with category === "smoke"
 * - Normal features with similar-but-non-matching titles ARE dispatched
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature } from '@protolabsai/types';

const { mockWarn, mockInfo, mockDebug, mockError } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
  mockInfo: vi.fn(),
  mockDebug: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: mockInfo,
    debug: mockDebug,
    warn: mockWarn,
    error: mockError,
  })),
  readJsonWithRecovery: vi.fn(),
  logRecoveryWarning: vi.fn(),
  DEFAULT_BACKUP_COUNT: 3,
  classifyError: vi.fn((err: unknown) => ({
    type: 'unknown',
    message: String(err),
    isRateLimit: false,
    isCancellation: false,
  })),
}));

vi.mock('@/lib/secure-fs.js', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('@protolabsai/platform', () => ({
  getFeaturesDir: vi.fn((projectPath: string) => `${projectPath}/.automaker/features`),
}));

vi.mock('@protolabsai/dependency-resolver', () => ({
  resolveDependencies: vi.fn(),
  areDependenciesSatisfied: vi.fn(),
}));

vi.mock('@protolabsai/types', async () => {
  const actual = await vi.importActual('@protolabsai/types');
  return {
    ...actual,
    DEFAULT_MAX_CONCURRENCY: 1,
    MAX_SYSTEM_CONCURRENCY: 10,
    normalizeFeatureStatus: vi.fn((s: string) => s),
  };
});

vi.mock('@/lib/worktree-lock.js', () => ({
  isWorktreeLocked: vi.fn(),
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

import { FeatureScheduler } from '@/services/feature-scheduler.js';
import * as secureFs from '@/lib/secure-fs.js';
import { readJsonWithRecovery } from '@protolabsai/utils';
import type { SchedulerCallbacks, PipelineRunner } from '@/services/feature-scheduler.js';

function createMockFeatureLoader() {
  return {
    get: vi.fn(),
    getAll: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockSettingsService() {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({}),
    getProjectSettings: vi.fn().mockResolvedValue({
      workflow: { maxPendingReviews: 5, autoDecayTimeoutMinutes: 30 },
    }),
  };
}

function createMockCallbacks(): SchedulerCallbacks {
  return {
    getRunningCountForWorktree: vi.fn().mockResolvedValue(0),
    getGlobalRunningCount: vi.fn().mockReturnValue(0),
    canProjectAcquireGlobalSlot: vi.fn().mockResolvedValue(true),
    hasInProgressFeatures: vi.fn().mockResolvedValue(false),
    isFeatureRunning: vi.fn().mockReturnValue(false),
    getRunningFeatureIds: vi.fn().mockReturnValue([]),
    isFeatureActiveInPipeline: vi.fn().mockReturnValue(false),
    isFeatureFinished: vi.fn().mockReturnValue(false),
    emitAutoModeEvent: vi.fn(),
    getHeapUsagePercent: vi.fn().mockReturnValue(0.5),
    getMostRecentRunningFeature: vi.fn().mockReturnValue(null),
    recordSuccessForProject: vi.fn(),
    trackFailureAndCheckPauseForProject: vi.fn().mockReturnValue(false),
    signalShouldPauseForProject: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD: 0.8,
    HEAP_USAGE_ABORT_AGENTS_THRESHOLD: 0.9,
  };
}

function createMockRunner(): PipelineRunner {
  return {
    run: vi.fn().mockResolvedValue({ outcome: 'completed' }),
  };
}

function mockFeatureDirectories(featureIds: string[]) {
  (secureFs.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(
    featureIds.map((id) => ({
      name: id,
      isDirectory: () => true,
    }))
  );
}

function mockFeatureJsonReads(features: Record<string, Partial<Feature> | null>) {
  (readJsonWithRecovery as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
    const parts = filePath.split('/');
    const featureIdx = parts.indexOf('features');
    const featureId = featureIdx >= 0 ? parts[featureIdx + 1] : undefined;
    const data = featureId ? (features[featureId] ?? null) : null;
    return Promise.resolve({ data, recovered: false, source: 'primary' });
  });
}

describe('feature-scheduler.ts — smoke-check sentinel filter', () => {
  let scheduler: FeatureScheduler;
  let mockFeatureLoader: ReturnType<typeof createMockFeatureLoader>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureLoader = createMockFeatureLoader();

    scheduler = new FeatureScheduler({
      featureLoader: mockFeatureLoader as any,
      settingsService: createMockSettingsService() as any,
      events: {
        emit: vi.fn(),
        on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
        subscribe: vi.fn(),
      } as any,
      runner: createMockRunner(),
      callbacks: createMockCallbacks(),
    });
  });

  it('skips a feature whose title starts with "[SMOKE-"', async () => {
    const smokeFeature: Partial<Feature> = {
      id: 'smoke-probe-1',
      title: '[SMOKE-abc123] connectivity test',
      description: 'Synthetic probe — auto-deleted after smoke check.',
      status: 'backlog',
      category: 'smoke',
    };

    mockFeatureDirectories(['smoke-probe-1']);
    mockFeatureJsonReads({ 'smoke-probe-1': smokeFeature });

    const result = await (scheduler as any).loadPendingFeatures('/test/project');

    expect(result).toHaveLength(0);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('smoke-probe-1'));
    // Must NOT attempt to update/block the feature — it is simply skipped silently
    expect(mockFeatureLoader.update).not.toHaveBeenCalled();
  });

  it('skips a feature with category "smoke" regardless of title', async () => {
    const smokeFeature: Partial<Feature> = {
      id: 'smoke-probe-2',
      title: 'Some probe feature',
      description: 'A probe with smoke category.',
      status: 'backlog',
      category: 'smoke',
    };

    mockFeatureDirectories(['smoke-probe-2']);
    mockFeatureJsonReads({ 'smoke-probe-2': smokeFeature });

    const result = await (scheduler as any).loadPendingFeatures('/test/project');

    expect(result).toHaveLength(0);
    expect(mockFeatureLoader.update).not.toHaveBeenCalled();
  });

  it('does NOT skip a normal backlog feature that does not match the sentinel pattern', async () => {
    const normalFeature: Partial<Feature> = {
      id: 'normal-feature-1',
      title: 'Fix Safari 17 save button crash',
      description: 'Legitimate bug fix.',
      status: 'backlog',
      category: 'bug',
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago (past cooldown)
    };

    mockFeatureDirectories(['normal-feature-1']);
    mockFeatureJsonReads({ 'normal-feature-1': normalFeature });

    const result = await (scheduler as any).loadPendingFeatures('/test/project');

    // Normal features must still be scheduled
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('normal-feature-1');
  });
});
