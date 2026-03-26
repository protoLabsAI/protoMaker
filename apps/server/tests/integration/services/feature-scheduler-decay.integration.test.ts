/**
 * Integration test for FeatureScheduler auto-decay
 *
 * Verifies that the review queue deadlock scenario is prevented:
 * - Creates 5+ features in review with failing CI on disk
 * - Verifies auto-decay recycles stalled features to backlog
 * - Verifies the board remains active after decay (agents can launch)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FeatureScheduler } from '@/services/feature-scheduler.js';
import { FeatureLoader } from '@/services/feature-loader.js';
import { createTestGitRepo, createTestFeature, type TestRepo } from '../helpers/git-test-repo.js';

// Mock logger to suppress noise
vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual('@protolabsai/utils');
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
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

describe('FeatureScheduler auto-decay (integration)', () => {
  let testRepo: TestRepo;
  let scheduler: FeatureScheduler;
  let featureLoader: FeatureLoader;
  const mockEvents = {
    emit: vi.fn(),
    on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    subscribe: vi.fn(),
  };
  const mockCallbacks = {
    getRunningCountForWorktree: vi.fn().mockResolvedValue(0),
    getGlobalRunningCount: vi.fn().mockReturnValue(0),
    canProjectAcquireGlobalSlot: vi.fn().mockResolvedValue(true),
    hasInProgressFeatures: vi.fn().mockResolvedValue(false),
    isFeatureRunning: vi.fn().mockReturnValue(false),
    getRunningFeatureIds: vi.fn().mockReturnValue([]),
    isFeatureActiveInPipeline: vi.fn().mockReturnValue(false),
    isFeatureFinished: vi.fn().mockReturnValue(false),
    emitAutoModeEvent: vi.fn(),
    getHeapUsagePercent: vi.fn().mockReturnValue(0.3),
    getMostRecentRunningFeature: vi.fn().mockReturnValue(null),
    recordSuccessForProject: vi.fn(),
    trackFailureAndCheckPauseForProject: vi.fn().mockReturnValue(false),
    signalShouldPauseForProject: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD: 0.8,
    HEAP_USAGE_ABORT_AGENTS_THRESHOLD: 0.9,
  };
  const mockRunner = {
    run: vi.fn().mockResolvedValue({ outcome: 'completed' as const }),
  };
  const mockSettingsService = {
    getGlobalSettings: vi.fn().mockResolvedValue({}),
    getProjectSettings: vi.fn().mockResolvedValue({
      workflow: {
        maxPendingReviews: 5,
        autoDecayTimeoutMinutes: 30,
      },
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockEvents.on.mockReturnValue({ unsubscribe: vi.fn() });
    testRepo = await createTestGitRepo();
    featureLoader = new FeatureLoader();

    scheduler = new FeatureScheduler({
      featureLoader: featureLoader as any,
      settingsService: mockSettingsService as any,
      events: mockEvents as any,
      runner: mockRunner,
      callbacks: mockCallbacks,
    });
  });

  afterEach(async () => {
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  it('recycles 5+ stalled review features with failing CI back to backlog', async () => {
    // Create 6 features in review with failing CI indicators, stalled > 30 min
    const stalledTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    for (let i = 1; i <= 6; i++) {
      await createTestFeature(testRepo.path, `stalled-${i}`, {
        id: `stalled-${i}`,
        title: `Stalled Feature ${i}`,
        category: 'feature',
        description: `Feature ${i} with failing CI`,
        status: 'review',
        reviewStartedAt: stalledTime,
        failureCount: 0,
        ciRemediationCount: 2,
        ciIterationCount: 1,
      });
    }

    // Verify all 6 are in review before decay
    const featuresDir = path.join(testRepo.path, '.automaker', 'features');
    for (let i = 1; i <= 6; i++) {
      const featurePath = path.join(featuresDir, `stalled-${i}`, 'feature.json');
      const raw = await fs.readFile(featurePath, 'utf-8');
      const feature = JSON.parse(raw);
      expect(feature.status).toBe('review');
    }

    // Run auto-decay
    const decayed = await scheduler.checkAndDecayStalled(testRepo.path);

    // All 6 should be decayed
    expect(decayed).toBe(6);

    // Verify features are now in backlog on disk
    for (let i = 1; i <= 6; i++) {
      const featurePath = path.join(featuresDir, `stalled-${i}`, 'feature.json');
      const raw = await fs.readFile(featurePath, 'utf-8');
      const feature = JSON.parse(raw);
      expect(feature.status).toBe('backlog');
      expect(feature.failureCount).toBe(1);
      expect(feature.statusChangeReason).toContain('Auto-decayed');
    }
  });

  it('preserves healthy review features while decaying failing ones', async () => {
    const stalledTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // 3 features with failing CI and stalled
    for (let i = 1; i <= 3; i++) {
      await createTestFeature(testRepo.path, `failing-${i}`, {
        id: `failing-${i}`,
        title: `Failing Feature ${i}`,
        category: 'feature',
        description: `Feature with failing CI`,
        status: 'review',
        reviewStartedAt: stalledTime,
        failureCount: 0,
        ciRemediationCount: 2,
      });
    }

    // 2 healthy features in review (no CI failures)
    for (let i = 1; i <= 2; i++) {
      await createTestFeature(testRepo.path, `healthy-${i}`, {
        id: `healthy-${i}`,
        title: `Healthy Feature ${i}`,
        category: 'feature',
        description: `Feature waiting for human review`,
        status: 'review',
        reviewStartedAt: stalledTime,
        failureCount: 0,
        ciRemediationCount: 0,
        ciIterationCount: 0,
        statusChangeReason: 'PR created successfully',
      });
    }

    // 1 recent feature with CI failures (within timeout)
    await createTestFeature(testRepo.path, 'recent-failing', {
      id: 'recent-failing',
      title: 'Recent Failing Feature',
      category: 'feature',
      description: 'Feature with recent CI failure',
      status: 'review',
      reviewStartedAt: recentTime,
      failureCount: 0,
      ciRemediationCount: 1,
    });

    const decayed = await scheduler.checkAndDecayStalled(testRepo.path);

    // Only the 3 stalled+failing features should be decayed
    expect(decayed).toBe(3);

    const featuresDir = path.join(testRepo.path, '.automaker', 'features');

    // Failing features should be decayed
    for (let i = 1; i <= 3; i++) {
      const raw = await fs.readFile(
        path.join(featuresDir, `failing-${i}`, 'feature.json'),
        'utf-8'
      );
      const feature = JSON.parse(raw);
      expect(feature.status).toBe('backlog');
    }

    // Healthy features should still be in review
    for (let i = 1; i <= 2; i++) {
      const raw = await fs.readFile(
        path.join(featuresDir, `healthy-${i}`, 'feature.json'),
        'utf-8'
      );
      const feature = JSON.parse(raw);
      expect(feature.status).toBe('review');
    }

    // Recent feature should still be in review
    const recentRaw = await fs.readFile(
      path.join(featuresDir, 'recent-failing', 'feature.json'),
      'utf-8'
    );
    const recentFeature = JSON.parse(recentRaw);
    expect(recentFeature.status).toBe('review');
  });

  it('emits auto-decayed events for each decayed feature', async () => {
    const stalledTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    await createTestFeature(testRepo.path, 'event-test', {
      id: 'event-test',
      title: 'Event Test Feature',
      category: 'feature',
      description: 'Test event emission',
      status: 'review',
      reviewStartedAt: stalledTime,
      failureCount: 2,
      ciRemediationCount: 1,
    });

    await scheduler.checkAndDecayStalled(testRepo.path);

    expect(mockEvents.emit).toHaveBeenCalledWith(
      'feature:auto-decayed',
      expect.objectContaining({
        featureId: 'event-test',
        failureCount: 3,
        projectPath: testRepo.path,
      })
    );
  });
});
