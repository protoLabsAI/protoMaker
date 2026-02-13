/**
 * Linear Sync Service Tests
 *
 * Unit tests for LinearSyncService guard mechanisms and core functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LinearSyncService } from '../../../src/services/linear-sync-service.js';
import { createEventEmitter } from '../../../src/lib/events.js';
import type { EventEmitter } from '../../../src/lib/events.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import type { FeatureLoader } from '../../../src/services/feature-loader.js';

describe('LinearSyncService', () => {
  let service: LinearSyncService;
  let emitter: EventEmitter;
  let mockSettingsService: SettingsService;
  let mockFeatureLoader: FeatureLoader;

  beforeEach(() => {
    service = new LinearSyncService();
    emitter = createEventEmitter();

    // Mock settings service
    mockSettingsService = {
      getProjectSettings: vi.fn(),
      getGlobalSettings: vi.fn(),
    } as unknown as SettingsService;

    // Mock feature loader
    mockFeatureLoader = {
      get: vi.fn(),
      update: vi.fn(),
    } as unknown as FeatureLoader;
  });

  afterEach(() => {
    service.destroy();
  });

  describe('Singleton Pattern', () => {
    it('should export a singleton instance', async () => {
      const { linearSyncService } = await import('../../../src/services/linear-sync-service.js');
      expect(linearSyncService).toBeInstanceOf(LinearSyncService);
    });
  });

  describe('Initialization', () => {
    it('should initialize with event emitter and settings service', () => {
      expect(() =>
        service.initialize(emitter, mockSettingsService, mockFeatureLoader)
      ).not.toThrow();
    });

    it('should not be running before start() is called', () => {
      service.initialize(emitter, mockSettingsService, mockFeatureLoader);
      expect(service.shouldSync('test-feature')).toBe(false);
    });
  });

  describe('Lifecycle Methods', () => {
    beforeEach(() => {
      service.initialize(emitter, mockSettingsService, mockFeatureLoader);
    });

    it('should start the service', () => {
      service.start();
      // After starting, service should allow syncs (if other guards pass)
      expect(service.shouldSync('test-feature')).toBe(true);
    });

    it('should stop the service', () => {
      service.start();
      service.stop();
      expect(service.shouldSync('test-feature')).toBe(false);
    });

    it('should warn when starting an already running service', () => {
      service.start();
      expect(() => service.start()).not.toThrow();
    });

    it('should warn when stopping a non-running service', () => {
      expect(() => service.stop()).not.toThrow();
    });

    it('should clear syncing features on stop', () => {
      service.start();

      const originalDateNow = Date.now;
      let currentTime = 1000000;
      Date.now = vi.fn(() => currentTime);

      // Use protected method via type assertion for testing
      (service as any).markSyncing('test-feature');
      expect(service.shouldSync('test-feature')).toBe(false);

      service.stop();
      service.start();

      // Advance time past debounce window
      currentTime += 5000;

      expect(service.shouldSync('test-feature')).toBe(true);

      Date.now = originalDateNow;
    });

    it('should cleanup on destroy', () => {
      service.start();
      service.destroy();
      expect(service.shouldSync('test-feature')).toBe(false);
    });
  });

  describe('Event Subscriptions', () => {
    beforeEach(() => {
      service.initialize(emitter, mockSettingsService, mockFeatureLoader);
      service.start();
    });

    it('should subscribe to feature:created events', () => {
      const emitSpy = vi.fn();
      const unsubscribe = emitter.subscribe(emitSpy);

      emitter.emit('feature:created', {
        featureId: 'test-feature-1',
        featureName: 'Test Feature',
        projectPath: '/test/path',
      });

      expect(emitSpy).toHaveBeenCalledWith('feature:created', expect.any(Object));
      unsubscribe();
    });

    it('should subscribe to feature:status-changed events', () => {
      const emitSpy = vi.fn();
      const unsubscribe = emitter.subscribe(emitSpy);

      emitter.emit('feature:status-changed', {
        featureId: 'test-feature-2',
        status: 'in-progress',
        projectPath: '/test/path',
      });

      expect(emitSpy).toHaveBeenCalledWith('feature:status-changed', expect.any(Object));
      unsubscribe();
    });

    it('should subscribe to feature:pr-merged events', () => {
      const emitSpy = vi.fn();
      const unsubscribe = emitter.subscribe(emitSpy);

      emitter.emit('feature:pr-merged', {
        featureId: 'test-feature-3',
        prUrl: 'https://github.com/org/repo/pull/123',
        projectPath: '/test/path',
      });

      expect(emitSpy).toHaveBeenCalledWith('feature:pr-merged', expect.any(Object));
      unsubscribe();
    });
  });

  describe('Loop Prevention Guard', () => {
    beforeEach(() => {
      service.initialize(emitter, mockSettingsService, mockFeatureLoader);
      service.start();
    });

    it('should prevent concurrent syncs for the same feature', () => {
      const featureId = 'test-feature';

      // First sync should be allowed
      expect(service.shouldSync(featureId)).toBe(true);

      // Mark as syncing
      (service as any).markSyncing(featureId);

      // Second sync should be blocked
      expect(service.shouldSync(featureId)).toBe(false);
    });

    it('should allow sync after unmark (but debounce still applies)', () => {
      const featureId = 'test-feature';

      const originalDateNow = Date.now;
      let currentTime = 1000000;
      Date.now = vi.fn(() => currentTime);

      (service as any).markSyncing(featureId);
      expect(service.shouldSync(featureId)).toBe(false);

      (service as any).unmarkSyncing(featureId);
      // Should still be blocked by debounce
      expect(service.shouldSync(featureId)).toBe(false);

      // After debounce window expires, should be allowed
      currentTime += 5000;
      expect(service.shouldSync(featureId)).toBe(true);

      Date.now = originalDateNow;
    });

    it('should track multiple features independently', () => {
      const feature1 = 'feature-1';
      const feature2 = 'feature-2';

      (service as any).markSyncing(feature1);

      expect(service.shouldSync(feature1)).toBe(false);
      expect(service.shouldSync(feature2)).toBe(true);
    });
  });

  describe('Debounce Logic', () => {
    beforeEach(() => {
      service.initialize(emitter, mockSettingsService, mockFeatureLoader);
      service.start();
    });

    it('should block syncs within 5 second window', () => {
      const featureId = 'test-feature';

      // First sync
      (service as any).markSyncing(featureId);
      (service as any).unmarkSyncing(featureId);

      // Immediately after, should be blocked by debounce
      expect(service.shouldSync(featureId)).toBe(false);
    });

    it('should allow sync after debounce window expires', async () => {
      const featureId = 'test-feature';

      // Mock Date.now to control time
      const originalDateNow = Date.now;
      let currentTime = 1000000;

      Date.now = vi.fn(() => currentTime);

      // First sync
      (service as any).markSyncing(featureId);
      (service as any).unmarkSyncing(featureId);

      // Should be blocked immediately
      expect(service.shouldSync(featureId)).toBe(false);

      // Advance time by 5 seconds
      currentTime += 5000;

      // Should now be allowed
      expect(service.shouldSync(featureId)).toBe(true);

      // Restore Date.now
      Date.now = originalDateNow;
    });

    it('should use 5000ms debounce window', async () => {
      const featureId = 'test-feature';
      const originalDateNow = Date.now;
      let currentTime = 1000000;

      Date.now = vi.fn(() => currentTime);

      (service as any).markSyncing(featureId);
      (service as any).unmarkSyncing(featureId);

      // 4999ms - should still be blocked
      currentTime += 4999;
      expect(service.shouldSync(featureId)).toBe(false);

      // 5000ms - should be allowed
      currentTime += 1;
      expect(service.shouldSync(featureId)).toBe(true);

      Date.now = originalDateNow;
    });
  });

  describe('Sync Metadata Management', () => {
    beforeEach(() => {
      service.initialize(emitter, mockSettingsService, mockFeatureLoader);
      service.start();
    });

    it('should store and retrieve sync metadata', () => {
      const metadata = {
        featureId: 'test-feature',
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'success' as const,
        linearIssueId: 'LINEAR-123',
        syncCount: 1,
      };

      service.updateSyncMetadata(metadata);
      const retrieved = service.getSyncMetadata('test-feature');

      expect(retrieved).toEqual(metadata);
    });

    it('should return undefined for non-existent metadata', () => {
      const metadata = service.getSyncMetadata('non-existent');
      expect(metadata).toBeUndefined();
    });

    it('should update existing metadata', () => {
      const initialMetadata = {
        featureId: 'test-feature',
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'pending' as const,
        syncCount: 1,
      };

      service.updateSyncMetadata(initialMetadata);

      const updatedMetadata = {
        ...initialMetadata,
        lastSyncStatus: 'success' as const,
        linearIssueId: 'LINEAR-456',
        syncCount: 2,
      };

      service.updateSyncMetadata(updatedMetadata);
      const retrieved = service.getSyncMetadata('test-feature');

      expect(retrieved).toEqual(updatedMetadata);
    });

    it('should track multiple features metadata independently', () => {
      const metadata1 = {
        featureId: 'feature-1',
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'success' as const,
        syncCount: 1,
      };

      const metadata2 = {
        featureId: 'feature-2',
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'error' as const,
        errorMessage: 'Test error',
        syncCount: 2,
      };

      service.updateSyncMetadata(metadata1);
      service.updateSyncMetadata(metadata2);

      expect(service.getSyncMetadata('feature-1')).toEqual(metadata1);
      expect(service.getSyncMetadata('feature-2')).toEqual(metadata2);
    });
  });

  describe('isProjectSyncEnabled', () => {
    beforeEach(() => {
      service.initialize(emitter, mockSettingsService, mockFeatureLoader);
    });

    it('should return true when Linear sync is enabled', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
        integrations: {
          linear: {
            enabled: true,
            agentToken: 'test-token',
            syncOnFeatureCreate: true,
          },
        },
      } as any);

      const result = await service.isProjectSyncEnabled('/test/path');
      expect(result).toBe(true);
    });

    it('should return true when sync options default to enabled', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
        integrations: {
          linear: {
            enabled: true,
            agentToken: 'test-token',
            // sync options undefined, should default to true
          },
        },
      } as any);

      const result = await service.isProjectSyncEnabled('/test/path');
      expect(result).toBe(true);
    });

    it('should return false when Linear integration is disabled', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
        integrations: {
          linear: {
            enabled: false,
            agentToken: 'test-token',
          },
        },
      } as any);

      const result = await service.isProjectSyncEnabled('/test/path');
      expect(result).toBe(false);
    });

    it('should return false when agent token is missing', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
        integrations: {
          linear: {
            enabled: true,
            // agentToken is missing
          },
        },
      } as any);

      const result = await service.isProjectSyncEnabled('/test/path');
      expect(result).toBe(false);
    });

    it('should return false when all sync options are explicitly disabled', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
        integrations: {
          linear: {
            enabled: true,
            agentToken: 'test-token',
            syncOnFeatureCreate: false,
            syncOnStatusChange: false,
            commentOnCompletion: false,
          },
        },
      } as any);

      const result = await service.isProjectSyncEnabled('/test/path');
      expect(result).toBe(false);
    });

    it('should return false when settings service fails', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockRejectedValue(
        new Error('Settings error')
      );

      const result = await service.isProjectSyncEnabled('/test/path');
      expect(result).toBe(false);
    });

    it('should return false when settings service is not available', async () => {
      service.destroy();
      const uninitializedService = new LinearSyncService();

      const result = await uninitializedService.isProjectSyncEnabled('/test/path');
      expect(result).toBe(false);
    });
  });

  describe('shouldSync Combined Guard Logic', () => {
    beforeEach(() => {
      service.initialize(emitter, mockSettingsService, mockFeatureLoader);
    });

    it('should pass all guards when service is running and no conflicts', () => {
      service.start();
      expect(service.shouldSync('test-feature')).toBe(true);
    });

    it('should fail when service is not running', () => {
      // Service not started
      expect(service.shouldSync('test-feature')).toBe(false);
    });

    it('should fail when feature is currently syncing', () => {
      service.start();
      (service as any).markSyncing('test-feature');
      expect(service.shouldSync('test-feature')).toBe(false);
    });

    it('should fail when within debounce window', () => {
      service.start();

      const originalDateNow = Date.now;
      const currentTime = 1000000;
      Date.now = vi.fn(() => currentTime);

      (service as any).markSyncing('test-feature');
      (service as any).unmarkSyncing('test-feature');

      expect(service.shouldSync('test-feature')).toBe(false);

      Date.now = originalDateNow;
    });

    it('should allow different features to sync independently', () => {
      service.start();

      (service as any).markSyncing('feature-1');

      expect(service.shouldSync('feature-1')).toBe(false);
      expect(service.shouldSync('feature-2')).toBe(true);
    });
  });

  describe('Status Change Sync', () => {
    let mockFetch: any;

    beforeEach(() => {
      service.initialize(emitter, mockSettingsService, mockFeatureLoader);
      service.start();

      // Mock fetch globally
      mockFetch = vi.fn();
      global.fetch = mockFetch;

      // Default mock settings
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
        integrations: {
          linear: {
            enabled: true,
            agentToken: 'test-token-123',
            teamId: 'team-123',
            syncOnStatusChange: true,
          },
        },
      } as any);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('Status Mapping', () => {
      it('should map backlog status to Backlog state', () => {
        const result = (service as any).mapAutomakerStatusToLinear('backlog');
        expect(result).toBe('Backlog');
      });

      it('should map in_progress status to In Progress state', () => {
        const result = (service as any).mapAutomakerStatusToLinear('in_progress');
        expect(result).toBe('In Progress');
      });

      it('should map review status to In Review state', () => {
        const result = (service as any).mapAutomakerStatusToLinear('review');
        expect(result).toBe('In Review');
      });

      it('should map done status to Done state', () => {
        const result = (service as any).mapAutomakerStatusToLinear('done');
        expect(result).toBe('Done');
      });

      it('should map blocked status to Blocked state', () => {
        const result = (service as any).mapAutomakerStatusToLinear('blocked');
        expect(result).toBe('Blocked');
      });

      it('should map verified status to Done state', () => {
        const result = (service as any).mapAutomakerStatusToLinear('verified');
        expect(result).toBe('Done');
      });

      it('should default unknown status to Backlog', () => {
        const result = (service as any).mapAutomakerStatusToLinear('unknown-status');
        expect(result).toBe('Backlog');
      });
    });

    describe('Status Change Handling', () => {
      it('should skip sync when feature has no linearIssueId', async () => {
        const feature = {
          id: 'test-feature-1',
          description: 'Test feature',
          category: 'test',
          status: 'in_progress',
          // No linearIssueId
        };

        vi.mocked(mockFeatureLoader.get).mockResolvedValue(feature as any);

        await emitter.emit('feature:status-changed', {
          featureId: 'test-feature-1',
          projectPath: '/test/path',
          status: 'in_progress',
        });

        // Allow async handlers to complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should not have called fetch since no linearIssueId
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should skip sync when syncOnStatusChange is disabled', async () => {
        vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
          integrations: {
            linear: {
              enabled: true,
              agentToken: 'test-token-123',
              teamId: 'team-123',
              syncOnStatusChange: false, // Disabled
            },
          },
        } as any);

        const feature = {
          id: 'test-feature-2',
          description: 'Test feature',
          category: 'test',
          status: 'in_progress',
          linearIssueId: 'issue-999',
        };

        vi.mocked(mockFeatureLoader.get).mockResolvedValue(feature as any);

        await emitter.emit('feature:status-changed', {
          featureId: 'test-feature-2',
          projectPath: '/test/path',
          status: 'in_progress',
        });

        // Allow async handlers to complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should not have called fetch since syncOnStatusChange is disabled
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should update Linear issue status on status change', async () => {
        const feature = {
          id: 'test-feature-3',
          description: 'Test feature',
          category: 'test',
          status: 'in_progress',
          linearIssueId: 'issue-123',
        };

        vi.mocked(mockFeatureLoader.get).mockResolvedValue(feature as any);

        // Mock workflow states fetch (first call)
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              team: {
                states: {
                  nodes: [
                    { id: 'state-in-progress', name: 'In Progress' },
                    { id: 'state-backlog', name: 'Backlog' },
                  ],
                },
              },
            },
          }),
        });

        // Mock issue update (second call)
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              issueUpdate: {
                success: true,
                issue: { id: 'issue-123', state: { name: 'In Progress' } },
              },
            },
          }),
        });

        await emitter.emit('feature:status-changed', {
          featureId: 'test-feature-3',
          projectPath: '/test/path',
          status: 'in_progress',
        });

        // Allow async handlers to complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should have called fetch twice (workflow states + issue update)
        expect(mockFetch).toHaveBeenCalledTimes(2);

        // Verify sync metadata was updated
        const metadata = service.getSyncMetadata('test-feature-3');
        expect(metadata).toBeDefined();
        expect(metadata?.lastSyncStatus).toBe('success');
        expect(metadata?.linearIssueId).toBe('issue-123');
        expect(metadata?.syncSource).toBe('automaker');
        expect(metadata?.syncDirection).toBe('push');
      });

      it('should update sync metadata on error', async () => {
        const feature = {
          id: 'test-feature-4',
          description: 'Test feature',
          category: 'test',
          status: 'in_progress',
          linearIssueId: 'issue-456',
        };

        vi.mocked(mockFeatureLoader.get).mockResolvedValue(feature as any);

        // Mock fetch to fail
        mockFetch.mockRejectedValue(new Error('Linear API error'));

        await emitter.emit('feature:status-changed', {
          featureId: 'test-feature-4',
          projectPath: '/test/path',
          status: 'in_progress',
        });

        // Allow async handlers to complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        const metadata = service.getSyncMetadata('test-feature-4');
        expect(metadata).toBeDefined();
        expect(metadata?.lastSyncStatus).toBe('error');
        expect(metadata?.errorMessage).toContain('Linear API error');
      });

      it('should handle missing feature gracefully', async () => {
        vi.mocked(mockFeatureLoader.get).mockResolvedValue(null);

        await emitter.emit('feature:status-changed', {
          featureId: 'non-existent-feature',
          projectPath: '/test/path',
          status: 'in_progress',
        });

        // Allow async handlers to complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should not throw and should not call fetch
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });

    describe('Workflow State Fetching', () => {
      it('should fetch workflow states from Linear API', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              team: {
                states: {
                  nodes: [
                    { id: 'state-1', name: 'Backlog' },
                    { id: 'state-2', name: 'In Progress' },
                    { id: 'state-3', name: 'Done' },
                  ],
                },
              },
            },
          }),
        });

        const stateId = await (service as any).getWorkflowStateId(
          '/test/path',
          'team-123',
          'In Progress'
        );

        expect(stateId).toBe('state-2');
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.linear.app/graphql',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token-123',
            }),
          })
        );
      });

      it('should throw error when workflow state not found', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              team: {
                states: {
                  nodes: [{ id: 'state-1', name: 'Backlog' }],
                },
              },
            },
          }),
        });

        await expect(
          (service as any).getWorkflowStateId('/test/path', 'team-123', 'Non-existent State')
        ).rejects.toThrow('Workflow state "Non-existent State" not found');
      });

      it('should throw error when Linear API fails', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

        await expect(
          (service as any).getWorkflowStateId('/test/path', 'team-123', 'In Progress')
        ).rejects.toThrow('Linear API error: 500 Internal Server Error');
      });
    });
  });
});
