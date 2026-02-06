import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateWorldState } from '../../../src/services/world-state-evaluator.js';
import type { Feature } from '@automaker/types';

// Helper to create test features
function createFeature(
  id: string,
  options: {
    status?: string;
    dependencies?: string[];
    startedAt?: string;
  } = {}
): Feature {
  return {
    id,
    category: 'test',
    description: `Feature ${id}`,
    status: options.status || 'backlog',
    dependencies: options.dependencies,
    startedAt: options.startedAt,
  };
}

// Mock FeatureLoader
function createMockFeatureLoader(features: Feature[]) {
  return {
    getAll: vi.fn().mockResolvedValue(features),
  } as any;
}

// Mock AutoModeService
function createMockAutoModeService(
  opts: {
    isAutoLoopRunning?: boolean;
    runningCount?: number;
    maxConcurrency?: number;
  } = {}
) {
  return {
    getStatusForProject: vi.fn().mockReturnValue({
      isAutoLoopRunning: opts.isAutoLoopRunning ?? false,
      runningFeatures: [],
      runningCount: opts.runningCount ?? 0,
      maxConcurrency: opts.maxConcurrency ?? 3,
      branchName: null,
    }),
  } as any;
}

describe('evaluateWorldState', () => {
  it('should return correct counts for empty board', async () => {
    const featureLoader = createMockFeatureLoader([]);
    const autoModeService = createMockAutoModeService();

    const state = await evaluateWorldState('/test/project', null, featureLoader, autoModeService);

    expect(state.backlog_count).toBe(0);
    expect(state.in_progress_count).toBe(0);
    expect(state.review_count).toBe(0);
    expect(state.done_count).toBe(0);
    expect(state.failed_count).toBe(0);
    expect(state.total_features).toBe(0);
    expect(state.has_backlog_work).toBe(false);
    expect(state.has_failed_features).toBe(false);
    expect(state.is_idle).toBe(true);
  });

  it('should count features by status correctly', async () => {
    const features = [
      createFeature('f1', { status: 'backlog' }),
      createFeature('f2', { status: 'backlog' }),
      createFeature('f3', { status: 'running' }),
      createFeature('f4', { status: 'review' }),
      createFeature('f5', { status: 'done' }),
      createFeature('f6', { status: 'failed' }),
    ];
    const featureLoader = createMockFeatureLoader(features);
    const autoModeService = createMockAutoModeService({ runningCount: 1 });

    const state = await evaluateWorldState('/test/project', null, featureLoader, autoModeService);

    expect(state.backlog_count).toBe(2);
    expect(state.in_progress_count).toBe(1);
    expect(state.review_count).toBe(1);
    expect(state.done_count).toBe(1);
    expect(state.failed_count).toBe(1);
    expect(state.total_features).toBe(6);
  });

  it('should detect unblocked backlog features', async () => {
    const features = [
      createFeature('f1', { status: 'backlog' }), // no deps = unblocked
      createFeature('f2', { status: 'backlog', dependencies: ['f3'] }), // dep not done = blocked
      createFeature('f3', { status: 'running' }),
    ];
    const featureLoader = createMockFeatureLoader(features);
    const autoModeService = createMockAutoModeService();

    const state = await evaluateWorldState('/test/project', null, featureLoader, autoModeService);

    expect(state.has_backlog_work).toBe(true);
    expect(state.unblocked_backlog_count).toBe(1); // only f1 is unblocked
  });

  it('should not report has_backlog_work when all backlog features are blocked', async () => {
    const features = [
      createFeature('f1', { status: 'backlog', dependencies: ['f2'] }),
      createFeature('f2', { status: 'running' }),
    ];
    const featureLoader = createMockFeatureLoader(features);
    const autoModeService = createMockAutoModeService();

    const state = await evaluateWorldState('/test/project', null, featureLoader, autoModeService);

    expect(state.has_backlog_work).toBe(false);
    expect(state.unblocked_backlog_count).toBe(0);
  });

  it('should detect failed features', async () => {
    const features = [createFeature('f1', { status: 'failed' })];
    const featureLoader = createMockFeatureLoader(features);
    const autoModeService = createMockAutoModeService();

    const state = await evaluateWorldState('/test/project', null, featureLoader, autoModeService);

    expect(state.has_failed_features).toBe(true);
    expect(state.failed_count).toBe(1);
  });

  it('should detect stale features (running > 2 hours)', async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const features = [
      createFeature('f1', { status: 'running', startedAt: threeHoursAgo }), // stale
      createFeature('f2', { status: 'running', startedAt: fiveMinutesAgo }), // not stale
    ];
    const featureLoader = createMockFeatureLoader(features);
    const autoModeService = createMockAutoModeService({ runningCount: 2 });

    const state = await evaluateWorldState('/test/project', null, featureLoader, autoModeService);

    expect(state.has_stale_features).toBe(true);
    expect(state.stale_feature_count).toBe(1);
  });

  it('should compute agents_available correctly', async () => {
    const featureLoader = createMockFeatureLoader([]);
    const autoModeService = createMockAutoModeService({
      runningCount: 1,
      maxConcurrency: 3,
    });

    const state = await evaluateWorldState('/test/project', null, featureLoader, autoModeService);

    expect(state.agents_running).toBe(1);
    expect(state.agents_available).toBe(2);
  });

  it('should report auto_mode_running from autoModeService', async () => {
    const featureLoader = createMockFeatureLoader([]);
    const autoModeService = createMockAutoModeService({ isAutoLoopRunning: true });

    const state = await evaluateWorldState('/test/project', null, featureLoader, autoModeService);

    expect(state.auto_mode_running).toBe(true);
  });

  it('should report is_idle when no agents running and no backlog', async () => {
    const features = [createFeature('f1', { status: 'done' })];
    const featureLoader = createMockFeatureLoader(features);
    const autoModeService = createMockAutoModeService({ runningCount: 0 });

    const state = await evaluateWorldState('/test/project', null, featureLoader, autoModeService);

    expect(state.is_idle).toBe(true);
  });

  it('should not report is_idle when agents are running', async () => {
    const features = [createFeature('f1', { status: 'running' })];
    const featureLoader = createMockFeatureLoader(features);
    const autoModeService = createMockAutoModeService({ runningCount: 1 });

    const state = await evaluateWorldState('/test/project', null, featureLoader, autoModeService);

    expect(state.is_idle).toBe(false);
  });

  it('should handle featureLoader errors gracefully', async () => {
    const featureLoader = {
      getAll: vi.fn().mockRejectedValue(new Error('disk error')),
    } as any;
    const autoModeService = createMockAutoModeService();

    const state = await evaluateWorldState('/test/project', null, featureLoader, autoModeService);

    // Should still return a valid state with zeroed counts
    expect(state.total_features).toBe(0);
    expect(state.is_idle).toBe(true);
  });
});
