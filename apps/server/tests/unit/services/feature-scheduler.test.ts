/**
 * Unit tests for FeatureScheduler — auto-decay and review queue management
 *
 * Covers:
 * - checkAndDecayStalled() decays features stalled in review with failing CI
 * - Features without failing CI are NOT decayed
 * - Configurable autoDecayTimeoutMinutes is respected
 * - failureCount is incremented on decay
 * - getMaxPendingReviews() validates and clamps values (1-50)
 * - Review queue deadlock prevention: 5+ stalled features don't block new launches
 * - Proper logging of decay events
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature } from '@protolabsai/types';

// Mock secure-fs
vi.mock('@/lib/secure-fs.js', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
}));

// Mock logger
vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockFeatureLoader() {
  return {
    get: vi.fn(),
    getAll: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockSettingsService(overrides: Record<string, unknown> = {}) {
  const defaultWorkflow = {
    maxPendingReviews: 5,
    autoDecayTimeoutMinutes: 30,
    ...overrides,
  };
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({}),
    getProjectSettings: vi.fn().mockResolvedValue({
      workflow: defaultWorkflow,
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

function createMockEvents() {
  return {
    emit: vi.fn(),
    on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    subscribe: vi.fn(),
  };
}

/**
 * Build a mock feature in review with configurable CI failure indicators.
 */
function makeReviewFeature(id: string, overrides: Partial<Feature> = {}): Partial<Feature> {
  return {
    id,
    title: `Feature ${id}`,
    category: 'feature',
    description: `Description for ${id}`,
    status: 'review',
    reviewStartedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
    failureCount: 0,
    ciRemediationCount: 1,
    ...overrides,
  };
}

/**
 * Mock readdir to return directory entries for feature IDs.
 */
function mockFeatureDirectories(featureIds: string[]) {
  (secureFs.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(
    featureIds.map((id) => ({
      name: id,
      isDirectory: () => true,
    }))
  );
}

/**
 * Mock readJsonWithRecovery to return features keyed by feature path.
 */
function mockFeatureJsonReads(features: Record<string, Partial<Feature> | null>) {
  (readJsonWithRecovery as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
    // Extract feature ID from path: .../features/{id}/feature.json
    const parts = filePath.split('/');
    const featureIdx = parts.indexOf('features');
    const featureId = featureIdx >= 0 ? parts[featureIdx + 1] : undefined;
    const data = featureId ? (features[featureId] ?? null) : null;
    return Promise.resolve({ data, recovered: false, source: 'primary' });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('feature-scheduler.ts', () => {
  let scheduler: FeatureScheduler;
  let mockFeatureLoader: ReturnType<typeof createMockFeatureLoader>;
  let mockSettingsService: ReturnType<typeof createMockSettingsService>;
  let mockCallbacks: SchedulerCallbacks;
  let mockRunner: PipelineRunner;
  let mockEvents: ReturnType<typeof createMockEvents>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureLoader = createMockFeatureLoader();
    mockSettingsService = createMockSettingsService();
    mockCallbacks = createMockCallbacks();
    mockRunner = createMockRunner();
    mockEvents = createMockEvents();

    scheduler = new FeatureScheduler({
      featureLoader: mockFeatureLoader as any,
      settingsService: mockSettingsService as any,
      events: mockEvents as any,
      runner: mockRunner,
      callbacks: mockCallbacks,
    });
  });

  describe('checkAndDecayStalled', () => {
    it('decays features stalled in review with failing CI beyond timeout', async () => {
      const feature = makeReviewFeature('stalled-1', {
        reviewStartedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 min ago
        ciRemediationCount: 2,
        failureCount: 1,
      });

      mockFeatureDirectories(['stalled-1']);
      mockFeatureJsonReads({ 'stalled-1': feature });

      const decayed = await scheduler.checkAndDecayStalled('/test/project');

      expect(decayed).toBe(1);
      expect(mockFeatureLoader.update).toHaveBeenCalledWith(
        '/test/project',
        'stalled-1',
        expect.objectContaining({
          status: 'backlog',
          failureCount: 2,
          statusChangeReason: expect.stringContaining('Auto-decayed'),
        })
      );
    });

    it('does NOT decay features without failing CI indicators', async () => {
      const healthyFeature = makeReviewFeature('healthy-1', {
        reviewStartedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        ciRemediationCount: 0,
        ciIterationCount: 0,
        remediationHistory: [],
        statusChangeReason: 'PR created successfully',
      });

      mockFeatureDirectories(['healthy-1']);
      mockFeatureJsonReads({ 'healthy-1': healthyFeature });

      const decayed = await scheduler.checkAndDecayStalled('/test/project');

      expect(decayed).toBe(0);
      expect(mockFeatureLoader.update).not.toHaveBeenCalled();
    });

    it('does NOT decay features within the timeout window', async () => {
      const recentFeature = makeReviewFeature('recent-1', {
        reviewStartedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
        ciRemediationCount: 1,
      });

      mockFeatureDirectories(['recent-1']);
      mockFeatureJsonReads({ 'recent-1': recentFeature });

      const decayed = await scheduler.checkAndDecayStalled('/test/project');

      expect(decayed).toBe(0);
      expect(mockFeatureLoader.update).not.toHaveBeenCalled();
    });

    it('increments failureCount on each decay', async () => {
      const feature = makeReviewFeature('retry-1', {
        reviewStartedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        ciRemediationCount: 1,
        failureCount: 3,
      });

      mockFeatureDirectories(['retry-1']);
      mockFeatureJsonReads({ 'retry-1': feature });

      await scheduler.checkAndDecayStalled('/test/project');

      expect(mockFeatureLoader.update).toHaveBeenCalledWith(
        '/test/project',
        'retry-1',
        expect.objectContaining({
          failureCount: 4,
        })
      );
    });

    it('respects configurable autoDecayTimeoutMinutes', async () => {
      // Set timeout to 120 minutes
      mockSettingsService = createMockSettingsService({ autoDecayTimeoutMinutes: 120 });
      scheduler = new FeatureScheduler({
        featureLoader: mockFeatureLoader as any,
        settingsService: mockSettingsService as any,
        events: mockEvents as any,
        runner: mockRunner,
        callbacks: mockCallbacks,
      });

      const feature = makeReviewFeature('timeout-1', {
        reviewStartedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // 90 min ago (< 120)
        ciRemediationCount: 1,
      });

      mockFeatureDirectories(['timeout-1']);
      mockFeatureJsonReads({ 'timeout-1': feature });

      const decayed = await scheduler.checkAndDecayStalled('/test/project');

      expect(decayed).toBe(0); // 90 min < 120 min timeout
      expect(mockFeatureLoader.update).not.toHaveBeenCalled();
    });

    it('disables auto-decay when timeout is set to 0', async () => {
      mockSettingsService = createMockSettingsService({ autoDecayTimeoutMinutes: 0 });
      scheduler = new FeatureScheduler({
        featureLoader: mockFeatureLoader as any,
        settingsService: mockSettingsService as any,
        events: mockEvents as any,
        runner: mockRunner,
        callbacks: mockCallbacks,
      });

      const feature = makeReviewFeature('disabled-1', {
        reviewStartedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        ciRemediationCount: 5,
      });

      mockFeatureDirectories(['disabled-1']);
      mockFeatureJsonReads({ 'disabled-1': feature });

      const decayed = await scheduler.checkAndDecayStalled('/test/project');

      expect(decayed).toBe(0);
      expect(mockFeatureLoader.update).not.toHaveBeenCalled();
    });

    it('emits feature:auto-decayed event on decay', async () => {
      const feature = makeReviewFeature('event-1', {
        reviewStartedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        ciRemediationCount: 1,
        failureCount: 0,
      });

      mockFeatureDirectories(['event-1']);
      mockFeatureJsonReads({ 'event-1': feature });

      await scheduler.checkAndDecayStalled('/test/project');

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'feature:auto-decayed',
        expect.objectContaining({
          featureId: 'event-1',
          failureCount: 1,
          projectPath: '/test/project',
        })
      );
    });

    it('detects CI failures from remediationHistory entries', async () => {
      const feature = makeReviewFeature('history-1', {
        reviewStartedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        ciRemediationCount: 0,
        ciIterationCount: 0,
        remediationHistory: [
          {
            id: 'rem-1',
            iteration: 1,
            cycleType: 'ci_failure' as const,
            startedAt: new Date().toISOString(),
          },
        ],
      });

      mockFeatureDirectories(['history-1']);
      mockFeatureJsonReads({ 'history-1': feature });

      const decayed = await scheduler.checkAndDecayStalled('/test/project');

      expect(decayed).toBe(1);
    });

    it('detects CI failures from statusChangeReason containing "ci"', async () => {
      const feature = makeReviewFeature('reason-1', {
        reviewStartedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        ciRemediationCount: 0,
        ciIterationCount: 0,
        remediationHistory: [],
        statusChangeReason: 'CI checks failed on PR #42',
      });

      mockFeatureDirectories(['reason-1']);
      mockFeatureJsonReads({ 'reason-1': feature });

      const decayed = await scheduler.checkAndDecayStalled('/test/project');

      expect(decayed).toBe(1);
    });

    it('handles multiple stalled features in a single pass', async () => {
      const features: Record<string, Partial<Feature>> = {};
      const ids = ['multi-1', 'multi-2', 'multi-3'];
      for (const id of ids) {
        features[id] = makeReviewFeature(id, {
          reviewStartedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          ciRemediationCount: 1,
          failureCount: 0,
        });
      }

      mockFeatureDirectories(ids);
      mockFeatureJsonReads(features);

      const decayed = await scheduler.checkAndDecayStalled('/test/project');

      expect(decayed).toBe(3);
      expect(mockFeatureLoader.update).toHaveBeenCalledTimes(3);
    });

    it('skips features not in review status', async () => {
      const feature = {
        id: 'not-review-1',
        title: 'Not in review',
        category: 'feature',
        description: 'test',
        status: 'in_progress',
        ciRemediationCount: 5,
      };

      mockFeatureDirectories(['not-review-1']);
      mockFeatureJsonReads({ 'not-review-1': feature });

      const decayed = await scheduler.checkAndDecayStalled('/test/project');

      expect(decayed).toBe(0);
    });

    it('uses updatedAt as fallback when reviewStartedAt is absent', async () => {
      const feature = makeReviewFeature('fallback-1', {
        reviewStartedAt: undefined,
        updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        ciRemediationCount: 1,
      });

      mockFeatureDirectories(['fallback-1']);
      mockFeatureJsonReads({ 'fallback-1': feature });

      const decayed = await scheduler.checkAndDecayStalled('/test/project');

      expect(decayed).toBe(1);
    });

    it('handles featureLoader.update failure gracefully', async () => {
      const feature = makeReviewFeature('error-1', {
        reviewStartedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        ciRemediationCount: 1,
      });

      mockFeatureDirectories(['error-1']);
      mockFeatureJsonReads({ 'error-1': feature });
      mockFeatureLoader.update.mockRejectedValueOnce(new Error('disk full'));

      const decayed = await scheduler.checkAndDecayStalled('/test/project');

      // Should return 0 since the update failed
      expect(decayed).toBe(0);
    });
  });

  describe('getMaxPendingReviews', () => {
    it('returns default of 5 when no settings configured', async () => {
      const schedulerNoSettings = new FeatureScheduler({
        featureLoader: mockFeatureLoader as any,
        settingsService: null,
        events: mockEvents as any,
        runner: mockRunner,
        callbacks: mockCallbacks,
      });

      // Access private method via the review queue gate check
      // We test indirectly by checking if the scheduler blocks at the right threshold
      mockFeatureDirectories([]);
      mockFeatureJsonReads({});

      // We can test getMaxPendingReviews indirectly through checkAndDecayStalled + queue
      // But let's test it more directly by accessing it
      const result = await (schedulerNoSettings as any).getMaxPendingReviews('/test');
      expect(result).toBe(5);
    });

    it('reads maxPendingReviews from workflow settings', async () => {
      mockSettingsService = createMockSettingsService({ maxPendingReviews: 10 });
      const schedulerCustom = new FeatureScheduler({
        featureLoader: mockFeatureLoader as any,
        settingsService: mockSettingsService as any,
        events: mockEvents as any,
        runner: mockRunner,
        callbacks: mockCallbacks,
      });

      const result = await (schedulerCustom as any).getMaxPendingReviews('/test');
      expect(result).toBe(10);
    });

    it('rejects values below 1 and returns default', async () => {
      mockSettingsService = createMockSettingsService({ maxPendingReviews: 0 });
      const schedulerCustom = new FeatureScheduler({
        featureLoader: mockFeatureLoader as any,
        settingsService: mockSettingsService as any,
        events: mockEvents as any,
        runner: mockRunner,
        callbacks: mockCallbacks,
      });

      const result = await (schedulerCustom as any).getMaxPendingReviews('/test');
      expect(result).toBe(5);
    });

    it('rejects values above 50 and returns default', async () => {
      mockSettingsService = createMockSettingsService({ maxPendingReviews: 100 });
      const schedulerCustom = new FeatureScheduler({
        featureLoader: mockFeatureLoader as any,
        settingsService: mockSettingsService as any,
        events: mockEvents as any,
        runner: mockRunner,
        callbacks: mockCallbacks,
      });

      const result = await (schedulerCustom as any).getMaxPendingReviews('/test');
      expect(result).toBe(5);
    });

    it('floors fractional values', async () => {
      mockSettingsService = createMockSettingsService({ maxPendingReviews: 7.8 });
      const schedulerCustom = new FeatureScheduler({
        featureLoader: mockFeatureLoader as any,
        settingsService: mockSettingsService as any,
        events: mockEvents as any,
        runner: mockRunner,
        callbacks: mockCallbacks,
      });

      const result = await (schedulerCustom as any).getMaxPendingReviews('/test');
      expect(result).toBe(7);
    });

    it('rejects NaN and returns default', async () => {
      mockSettingsService = createMockSettingsService({ maxPendingReviews: NaN });
      const schedulerCustom = new FeatureScheduler({
        featureLoader: mockFeatureLoader as any,
        settingsService: mockSettingsService as any,
        events: mockEvents as any,
        runner: mockRunner,
        callbacks: mockCallbacks,
      });

      const result = await (schedulerCustom as any).getMaxPendingReviews('/test');
      expect(result).toBe(5);
    });
  });

  describe('review queue deadlock prevention', () => {
    it('decays 5+ stalled review features so the board does not deadlock', async () => {
      // Simulate the deadlock scenario: 5+ features in review with failing CI
      const features: Record<string, Partial<Feature>> = {};
      const ids = [
        'deadlock-1',
        'deadlock-2',
        'deadlock-3',
        'deadlock-4',
        'deadlock-5',
        'deadlock-6',
      ];
      for (const id of ids) {
        features[id] = makeReviewFeature(id, {
          reviewStartedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(), // 2 hours ago
          ciRemediationCount: 3,
          failureCount: 1,
        });
      }

      mockFeatureDirectories(ids);
      mockFeatureJsonReads(features);

      const decayed = await scheduler.checkAndDecayStalled('/test/project');

      // All 6 features should be decayed
      expect(decayed).toBe(6);
      expect(mockFeatureLoader.update).toHaveBeenCalledTimes(6);

      // Each should be reset to backlog with incremented failureCount
      for (const id of ids) {
        expect(mockFeatureLoader.update).toHaveBeenCalledWith(
          '/test/project',
          id,
          expect.objectContaining({
            status: 'backlog',
            failureCount: 2,
          })
        );
      }
    });

    it('only decays features with CI failures, preserving healthy review features', async () => {
      const features: Record<string, Partial<Feature>> = {
        'failing-1': makeReviewFeature('failing-1', {
          reviewStartedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          ciRemediationCount: 2,
        }),
        'failing-2': makeReviewFeature('failing-2', {
          reviewStartedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          ciIterationCount: 3,
        }),
        'healthy-1': makeReviewFeature('healthy-1', {
          reviewStartedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          ciRemediationCount: 0,
          ciIterationCount: 0,
          remediationHistory: [],
          statusChangeReason: 'PR created',
        }),
        'recent-1': makeReviewFeature('recent-1', {
          reviewStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // Only 5 min
          ciRemediationCount: 5,
        }),
      };

      mockFeatureDirectories(Object.keys(features));
      mockFeatureJsonReads(features);

      const decayed = await scheduler.checkAndDecayStalled('/test/project');

      // Only failing-1 and failing-2 should be decayed (stalled + CI failure)
      // healthy-1 has no CI failure, recent-1 is within timeout
      expect(decayed).toBe(2);
      expect(mockFeatureLoader.update).toHaveBeenCalledTimes(2);
    });
  });
});
