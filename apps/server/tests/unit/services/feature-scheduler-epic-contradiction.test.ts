/**
 * Unit tests for FeatureScheduler — contradictory epic state handling
 *
 * Covers:
 * - loadPendingFeatures emits warn for features with isEpic: true AND epicId set
 * - Normal epic features (isEpic: true, no epicId) emit info, not warn
 * - Contradictory features are skipped (not scheduled)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature } from '@protolabsai/types';

// vi.mock() is hoisted to the top of the file before variable declarations.
// Use vi.hoisted() to define stable references that are available inside the factory.
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

describe('feature-scheduler.ts — loadPendingFeatures epic contradiction', () => {
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

  it('emits warn-level log when feature has both isEpic and epicId set (contradictory state)', async () => {
    const contradictoryFeature: Partial<Feature> = {
      id: 'feat-contradiction-1',
      title: 'Contradictory Epic Feature',
      description: 'A feature that is incorrectly both an epic and a child of another epic',
      status: 'backlog',
      isEpic: true,
      epicId: 'parent-epic-123',
    };

    mockFeatureDirectories(['feat-contradiction-1']);
    mockFeatureJsonReads({ 'feat-contradiction-1': contradictoryFeature });

    const result = await (scheduler as any).loadPendingFeatures('/test/project');

    // The contradictory feature must not be scheduled
    expect(result).toHaveLength(0);

    // Warn should be emitted with an actionable message
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('Fix the feature configuration to proceed')
    );
    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('feat-contradiction-1'));
    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('parent-epic-123'));

    // The contradictory state must be surfaced in the feature data so the UI and agents observe it
    expect(mockFeatureLoader.update).toHaveBeenCalledWith(
      '/test/project',
      'feat-contradiction-1',
      expect.objectContaining({
        statusChangeReason: expect.stringContaining('Contradictory epic state'),
      })
    );
  });

  it('emits info-level log (not warn) for a normal epic container without epicId', async () => {
    const epicFeature: Partial<Feature> = {
      id: 'feat-normal-epic-1',
      title: 'Normal Epic Container',
      description: 'A proper epic container with no parent',
      status: 'backlog',
      isEpic: true,
      // epicId intentionally absent
    };

    mockFeatureDirectories(['feat-normal-epic-1']);
    mockFeatureJsonReads({ 'feat-normal-epic-1': epicFeature });

    const result = await (scheduler as any).loadPendingFeatures('/test/project');

    // Normal epics are also skipped
    expect(result).toHaveLength(0);

    // Warn must NOT be called for a normal epic
    expect(mockWarn).not.toHaveBeenCalledWith(
      expect.stringContaining('Fix the feature configuration to proceed')
    );

    // Info should be called instead
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('Skipping epic feature feat-normal-epic-1')
    );

    // No update should be emitted for a normal epic — only contradictory state triggers an update
    expect(mockFeatureLoader.update).not.toHaveBeenCalled();
  });
});
