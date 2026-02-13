/**
 * Unit tests for LinearSyncService observability (metrics, activity log, sync-status endpoint)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinearSyncService } from '@/services/linear-sync-service.js';
import type { EventEmitter } from '@/lib/events.js';
import type { SettingsService } from '@/services/settings-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';

function createMockEventEmitter(): EventEmitter {
  const subscribers: Array<(type: string, payload: unknown) => void> = [];
  return {
    emit: vi.fn((type: string, payload: unknown) => {
      for (const sub of subscribers) {
        sub(type, payload);
      }
    }),
    subscribe: vi.fn((callback: (type: string, payload: unknown) => void) => {
      subscribers.push(callback);
      return () => {
        const idx = subscribers.indexOf(callback);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    }),
  } as any;
}

function createMockSettingsService(): SettingsService {
  return {
    getProjectSettings: vi.fn().mockResolvedValue({
      integrations: {
        linear: {
          enabled: true,
          agentToken: 'test-token',
          teamId: 'team-1',
          syncOnFeatureCreate: true,
          syncOnStatusChange: true,
          commentOnCompletion: true,
        },
      },
    }),
  } as any;
}

function createMockFeatureLoader(features: Record<string, any> = {}): FeatureLoader {
  return {
    get: vi.fn((projectPath: string, featureId: string) => {
      return Promise.resolve(features[featureId] || null);
    }),
    update: vi.fn().mockResolvedValue(undefined),
    findByLinearIssueId: vi.fn((projectPath: string, linearIssueId: string) => {
      const found = Object.values(features).find((f: any) => f.linearIssueId === linearIssueId);
      return Promise.resolve(found || null);
    }),
    create: vi.fn(),
    getAll: vi.fn(),
    load: vi.fn(),
  } as any;
}

describe('LinearSyncService Observability', () => {
  let service: LinearSyncService;
  let emitter: EventEmitter;
  let settingsService: SettingsService;
  let featureLoader: FeatureLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    service = new LinearSyncService();
    emitter = createMockEventEmitter();
    settingsService = createMockSettingsService();
    featureLoader = createMockFeatureLoader();
    service.initialize(emitter, settingsService, featureLoader);
  });

  describe('isRunning()', () => {
    it('returns false before start', () => {
      expect(service.isRunning()).toBe(false);
    });

    it('returns true after start', () => {
      service.start();
      expect(service.isRunning()).toBe(true);
    });

    it('returns false after stop', () => {
      service.start();
      service.stop();
      expect(service.isRunning()).toBe(false);
    });
  });

  describe('getMetrics()', () => {
    it('returns zeroed metrics initially', () => {
      const metrics = service.getMetrics();
      expect(metrics).toEqual({
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        conflictsDetected: 0,
        pushCount: 0,
        pullCount: 0,
        avgDurationMs: 0,
        lastOperationAt: null,
      });
    });

    it('returns a copy (not a reference)', () => {
      const m1 = service.getMetrics();
      const m2 = service.getMetrics();
      expect(m1).not.toBe(m2);
      expect(m1).toEqual(m2);
    });

    it('tracks successful push operations', async () => {
      // Stub fetch to return a successful issue creation
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                issueCreate: {
                  success: true,
                  issue: { id: 'lin-1', url: 'https://linear.app/issue/lin-1' },
                },
              },
            }),
        })
      );

      featureLoader = createMockFeatureLoader({
        'feat-1': {
          id: 'feat-1',
          title: 'Test Feature',
          description: 'desc',
          status: 'backlog',
        },
      });
      service.destroy();
      service = new LinearSyncService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      // Trigger a feature:created event
      emitter.emit('feature:created', {
        featureId: 'feat-1',
        projectPath: '/test',
      });

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 50));

      const metrics = service.getMetrics();
      expect(metrics.totalOperations).toBe(1);
      expect(metrics.successfulOperations).toBe(1);
      expect(metrics.failedOperations).toBe(0);
      expect(metrics.pushCount).toBe(1);
      expect(metrics.pullCount).toBe(0);
      expect(metrics.lastOperationAt).toBeTruthy();
      expect(metrics.avgDurationMs).toBeGreaterThanOrEqual(0);

      vi.unstubAllGlobals();
    });

    it('tracks failed operations', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      featureLoader = createMockFeatureLoader({
        'feat-1': {
          id: 'feat-1',
          title: 'Test',
          description: 'desc',
          status: 'backlog',
        },
      });
      service.destroy();
      service = new LinearSyncService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      emitter.emit('feature:created', {
        featureId: 'feat-1',
        projectPath: '/test',
      });

      await new Promise((r) => setTimeout(r, 50));

      const metrics = service.getMetrics();
      expect(metrics.totalOperations).toBe(1);
      expect(metrics.successfulOperations).toBe(0);
      expect(metrics.failedOperations).toBe(1);

      vi.unstubAllGlobals();
    });

    it('tracks pull operations from Linear updates', async () => {
      featureLoader = createMockFeatureLoader({
        'feat-1': {
          id: 'feat-1',
          title: 'Test',
          description: 'desc',
          status: 'backlog',
          linearIssueId: 'lin-1',
        },
      });
      service.destroy();
      service = new LinearSyncService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      await service.onLinearIssueUpdated('lin-1', 'In Progress', '/test');

      await new Promise((r) => setTimeout(r, 50));

      const metrics = service.getMetrics();
      expect(metrics.totalOperations).toBe(1);
      expect(metrics.successfulOperations).toBe(1);
      expect(metrics.pullCount).toBe(1);
      expect(metrics.pushCount).toBe(0);
    });

    it('tracks conflict detection count', async () => {
      featureLoader = createMockFeatureLoader({
        'feat-1': {
          id: 'feat-1',
          title: 'Test',
          description: 'desc',
          status: 'backlog',
          linearIssueId: 'lin-1',
        },
      });
      service.destroy();
      service = new LinearSyncService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      // Set metadata with recent sync (7s ago = past 5s debounce, within 10s conflict window)
      const sevenSecondsAgo = Date.now() - 7000;
      service.updateSyncMetadata({
        featureId: 'feat-1',
        lastSyncTimestamp: sevenSecondsAgo,
        lastSyncStatus: 'success',
        syncCount: 1,
        syncSource: 'automaker',
        syncDirection: 'push',
        lastSyncedAt: sevenSecondsAgo,
      });

      await service.onLinearIssueUpdated('lin-1', 'In Progress', '/test');

      await new Promise((r) => setTimeout(r, 50));

      const metrics = service.getMetrics();
      expect(metrics.conflictsDetected).toBe(1);
    });

    it('resets metrics on destroy', async () => {
      featureLoader = createMockFeatureLoader({
        'feat-1': {
          id: 'feat-1',
          title: 'Test',
          description: 'desc',
          status: 'backlog',
          linearIssueId: 'lin-1',
        },
      });
      service.destroy();
      service = new LinearSyncService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      await service.onLinearIssueUpdated('lin-1', 'In Progress', '/test');
      await new Promise((r) => setTimeout(r, 50));

      expect(service.getMetrics().totalOperations).toBe(1);

      service.destroy();

      expect(service.getMetrics().totalOperations).toBe(0);
    });
  });

  describe('getRecentActivity()', () => {
    it('returns empty array initially', () => {
      expect(service.getRecentActivity()).toEqual([]);
    });

    it('returns activity entries after operations', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                issueCreate: {
                  success: true,
                  issue: { id: 'lin-1', url: 'https://linear.app/issue/lin-1' },
                },
              },
            }),
        })
      );

      featureLoader = createMockFeatureLoader({
        'feat-1': {
          id: 'feat-1',
          title: 'Test',
          description: 'desc',
          status: 'backlog',
        },
      });
      service.destroy();
      service = new LinearSyncService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      emitter.emit('feature:created', {
        featureId: 'feat-1',
        projectPath: '/test',
      });

      await new Promise((r) => setTimeout(r, 50));

      const activity = service.getRecentActivity();
      expect(activity).toHaveLength(1);
      expect(activity[0]).toMatchObject({
        featureId: 'feat-1',
        direction: 'push',
        status: 'success',
        conflictDetected: false,
      });
      expect(activity[0].timestamp).toBeTruthy();
      expect(activity[0].durationMs).toBeGreaterThanOrEqual(0);

      vi.unstubAllGlobals();
    });

    it('respects limit parameter', async () => {
      // Use two different features to avoid debounce conflicts
      featureLoader = createMockFeatureLoader({
        'feat-1': {
          id: 'feat-1',
          title: 'Test A',
          description: 'desc',
          status: 'backlog',
          linearIssueId: 'lin-1',
        },
        'feat-2': {
          id: 'feat-2',
          title: 'Test B',
          description: 'desc',
          status: 'backlog',
          linearIssueId: 'lin-2',
        },
      });
      service.destroy();
      service = new LinearSyncService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      await service.onLinearIssueUpdated('lin-1', 'In Progress', '/test');
      await service.onLinearIssueUpdated('lin-2', 'In Progress', '/test');
      await new Promise((r) => setTimeout(r, 50));

      // All activity
      expect(service.getRecentActivity(10)).toHaveLength(2);

      // Limited to 1
      expect(service.getRecentActivity(1)).toHaveLength(1);
    });

    it('includes error info for failed operations', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('API timeout')));

      featureLoader = createMockFeatureLoader({
        'feat-1': {
          id: 'feat-1',
          title: 'Test',
          description: 'desc',
          status: 'backlog',
        },
      });
      service.destroy();
      service = new LinearSyncService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      emitter.emit('feature:created', {
        featureId: 'feat-1',
        projectPath: '/test',
      });

      await new Promise((r) => setTimeout(r, 50));

      const activity = service.getRecentActivity();
      expect(activity).toHaveLength(1);
      expect(activity[0]).toMatchObject({
        featureId: 'feat-1',
        direction: 'push',
        status: 'error',
        error: 'API timeout',
      });

      vi.unstubAllGlobals();
    });

    it('clears activity log on destroy', async () => {
      featureLoader = createMockFeatureLoader({
        'feat-1': {
          id: 'feat-1',
          title: 'Test',
          description: 'desc',
          status: 'backlog',
          linearIssueId: 'lin-1',
        },
      });
      service.destroy();
      service = new LinearSyncService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      await service.onLinearIssueUpdated('lin-1', 'In Progress', '/test');
      await new Promise((r) => setTimeout(r, 50));

      expect(service.getRecentActivity().length).toBeGreaterThan(0);

      service.destroy();

      expect(service.getRecentActivity()).toEqual([]);
    });
  });

  describe('rolling average duration', () => {
    it('computes average from successful operations', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                issueCreate: {
                  success: true,
                  issue: { id: 'lin-1', url: 'https://linear.app/issue/lin-1' },
                },
              },
            }),
        })
      );

      featureLoader = createMockFeatureLoader({
        'feat-1': {
          id: 'feat-1',
          title: 'Test 1',
          description: 'desc',
          status: 'backlog',
        },
      });
      service.destroy();
      service = new LinearSyncService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      emitter.emit('feature:created', {
        featureId: 'feat-1',
        projectPath: '/test',
      });
      await new Promise((r) => setTimeout(r, 50));

      const metrics = service.getMetrics();
      expect(metrics.avgDurationMs).toBeGreaterThanOrEqual(0);
      // Duration should be a reasonable value (not NaN or negative)
      expect(Number.isFinite(metrics.avgDurationMs)).toBe(true);

      vi.unstubAllGlobals();
    });
  });
});
