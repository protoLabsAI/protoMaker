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
      findByLinearIssueId: vi.fn(),
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

    it('should return false when no token source is available', async () => {
      // Clear env vars that could provide a token
      const savedKey = process.env.LINEAR_API_KEY;
      const savedToken = process.env.LINEAR_API_TOKEN;
      delete process.env.LINEAR_API_KEY;
      delete process.env.LINEAR_API_TOKEN;

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
        integrations: {
          linear: {
            enabled: true,
            // No agentToken, no apiKey, no env vars
          },
        },
      } as any);

      const result = await service.isProjectSyncEnabled('/test/path');
      expect(result).toBe(false);

      // Restore env vars
      if (savedKey) process.env.LINEAR_API_KEY = savedKey;
      if (savedToken) process.env.LINEAR_API_TOKEN = savedToken;
    });

    it('should return true when env var provides token (no agentToken)', async () => {
      const savedToken = process.env.LINEAR_API_TOKEN;
      process.env.LINEAR_API_TOKEN = 'env-test-token';

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
        integrations: {
          linear: {
            enabled: true,
            // No agentToken, but env var is set
          },
        },
      } as any);

      const result = await service.isProjectSyncEnabled('/test/path');
      expect(result).toBe(true);

      // Restore
      if (savedToken) {
        process.env.LINEAR_API_TOKEN = savedToken;
      } else {
        delete process.env.LINEAR_API_TOKEN;
      }
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

    describe('addCommentToIssue', () => {
      let mockFetch: ReturnType<typeof vi.fn>;

      beforeEach(() => {
        mockFetch = vi.fn();
        global.fetch = mockFetch;

        (mockSettingsService.getProjectSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
          integrations: {
            linear: {
              enabled: true,
              agentToken: 'test-token-123',
            },
          },
        });
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('should successfully add comment to Linear issue', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              commentCreate: {
                success: true,
                comment: {
                  id: 'comment-123',
                  body: 'Test comment',
                },
              },
            },
          }),
        });

        await expect(
          (service as any).addCommentToIssue('/test/path', 'issue-123', 'Test comment')
        ).resolves.not.toThrow();

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.linear.app/graphql',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token-123',
            }),
            body: expect.stringContaining('commentCreate'),
          })
        );
      });

      it('should throw error when comment creation fails', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              commentCreate: {
                success: false,
              },
            },
          }),
        });

        await expect(
          (service as any).addCommentToIssue('/test/path', 'issue-123', 'Test comment')
        ).rejects.toThrow('Failed to add comment to Linear issue');
      });

      it('should throw error when Linear API returns GraphQL errors', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            errors: [{ message: 'Invalid issue ID' }],
          }),
        });

        await expect(
          (service as any).addCommentToIssue('/test/path', 'issue-123', 'Test comment')
        ).rejects.toThrow('Linear GraphQL error: Invalid issue ID');
      });
    });
  });

  describe('PR Merge Sync', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      service.initialize(emitter, mockSettingsService, mockFeatureLoader);
      service.start();

      mockFetch = vi.fn();
      global.fetch = mockFetch;

      (mockSettingsService.getProjectSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        integrations: {
          linear: {
            enabled: true,
            agentToken: 'test-token-123',
            teamId: 'team-123',
            syncOnFeatureCreate: true,
            syncOnStatusChange: true,
            commentOnCompletion: true,
          },
        },
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should handle PR merge event and add comment to Linear issue', async () => {
      const featureId = 'test-feature';
      const projectPath = '/test/path';

      (mockFeatureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        featureId,
        title: 'Test Feature',
        status: 'review',
        linearIssueId: 'issue-123',
      });

      // The order of API calls in onPRMerged is:
      // 1. addCommentToIssue
      // 2. getIssueState (within addCommentToIssue gets settings, then actual comment call)
      // 3. If not Done: getWorkflowStateId
      // 4. If not Done: updateIssueStatus

      // Mock addCommentToIssue
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            commentCreate: {
              success: true,
              comment: { id: 'comment-123', body: 'Test comment' },
            },
          },
        }),
      });

      // Mock getIssueState
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            issue: {
              state: { name: 'In Review' },
            },
          },
        }),
      });

      // Mock getWorkflowStateId for 'Done'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            team: {
              states: {
                nodes: [
                  { id: 'state-1', name: 'Backlog' },
                  { id: 'state-2', name: 'Done' },
                ],
              },
            },
          },
        }),
      });

      // Mock updateIssueStatus
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            issueUpdate: {
              success: true,
              issue: { id: 'issue-123', state: { name: 'Done' } },
            },
          },
        }),
      });

      // Emit PR merged event
      emitter.emit('feature:pr-merged', {
        featureId,
        projectPath,
        prUrl: 'https://github.com/org/repo/pull/123',
        prNumber: 123,
        mergedBy: 'test-agent',
      });

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify sync metadata was updated
      const metadata = service.getSyncMetadata(featureId);
      expect(metadata).toBeDefined();
      expect(metadata?.lastSyncStatus).toBe('success');
      expect(metadata?.linearIssueId).toBe('issue-123');
    });

    it('should skip PR merge sync when commentOnCompletion is disabled', async () => {
      (mockSettingsService.getProjectSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        integrations: {
          linear: {
            enabled: true,
            agentToken: 'test-token-123',
            commentOnCompletion: false,
          },
        },
      });

      const featureId = 'test-feature';

      emitter.emit('feature:pr-merged', {
        featureId,
        projectPath: '/test/path',
        prUrl: 'https://github.com/org/repo/pull/123',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify no comment was added
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip PR merge sync when feature has no Linear issue ID', async () => {
      const featureId = 'test-feature';

      (mockFeatureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        featureId,
        title: 'Test Feature',
        status: 'review',
        linearIssueId: undefined, // No Linear issue ID
      });

      emitter.emit('feature:pr-merged', {
        featureId,
        projectPath: '/test/path',
        prUrl: 'https://github.com/org/repo/pull/123',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify no comment was added
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not update status if issue is already Done', async () => {
      const featureId = 'test-feature';

      (mockFeatureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        featureId,
        title: 'Test Feature',
        status: 'done',
        linearIssueId: 'issue-123',
      });

      // Mock addCommentToIssue (called first)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            commentCreate: {
              success: true,
              comment: { id: 'comment-123', body: 'Test comment' },
            },
          },
        }),
      });

      // Mock getIssueState - already Done (called second)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            issue: {
              state: { name: 'Done' },
            },
          },
        }),
      });

      emitter.emit('feature:pr-merged', {
        featureId,
        projectPath: '/test/path',
        prUrl: 'https://github.com/org/repo/pull/123',
        prNumber: 123,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have called addCommentToIssue and getIssueState, but not updateIssueStatus
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Inbound Sync (Linear → Automaker)', () => {
    beforeEach(() => {
      service.initialize(emitter, mockSettingsService, mockFeatureLoader);
      service.start();

      // Default mock settings
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
        integrations: {
          linear: {
            enabled: true,
            agentToken: 'test-token-123',
            teamId: 'team-123',
          },
        },
      } as any);
    });

    describe('Reverse Status Mapping', () => {
      it('should map Linear Backlog to automaker backlog', () => {
        const result = (service as any).mapLinearStateToAutomaker('Backlog');
        expect(result).toBe('backlog');
      });

      it('should map Linear Todo to automaker backlog', () => {
        const result = (service as any).mapLinearStateToAutomaker('Todo');
        expect(result).toBe('backlog');
      });

      it('should map Linear In Progress to automaker in_progress', () => {
        const result = (service as any).mapLinearStateToAutomaker('In Progress');
        expect(result).toBe('in_progress');
      });

      it('should map Linear Started to automaker in_progress', () => {
        const result = (service as any).mapLinearStateToAutomaker('Started');
        expect(result).toBe('in_progress');
      });

      it('should map Linear In Review to automaker review', () => {
        const result = (service as any).mapLinearStateToAutomaker('In Review');
        expect(result).toBe('review');
      });

      it('should map Linear Done to automaker done', () => {
        const result = (service as any).mapLinearStateToAutomaker('Done');
        expect(result).toBe('done');
      });

      it('should map Linear Completed to automaker done', () => {
        const result = (service as any).mapLinearStateToAutomaker('Completed');
        expect(result).toBe('done');
      });

      it('should map Linear Blocked to automaker blocked', () => {
        const result = (service as any).mapLinearStateToAutomaker('Blocked');
        expect(result).toBe('blocked');
      });

      it('should be case insensitive', () => {
        expect((service as any).mapLinearStateToAutomaker('in progress')).toBe('in_progress');
        expect((service as any).mapLinearStateToAutomaker('IN PROGRESS')).toBe('in_progress');
      });

      it('should default unknown states to backlog', () => {
        const result = (service as any).mapLinearStateToAutomaker('Unknown State');
        expect(result).toBe('backlog');
      });
    });

    describe('onLinearIssueUpdated', () => {
      it('should update feature status when Linear issue is updated', async () => {
        const feature = {
          id: 'test-feature-1',
          description: 'Test feature',
          category: 'test',
          status: 'backlog',
          linearIssueId: 'LINEAR-123',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);
        vi.mocked(mockFeatureLoader.update).mockResolvedValue(feature as any);

        await service.onLinearIssueUpdated('LINEAR-123', 'In Progress', '/test/path');

        // Verify feature was updated
        expect(mockFeatureLoader.update).toHaveBeenCalledWith(
          '/test/path',
          'test-feature-1',
          expect.objectContaining({
            status: 'in_progress',
            statusChangeReason: 'Synced from Linear (In Progress)',
          })
        );

        // Verify sync metadata was updated
        const metadata = service.getSyncMetadata('test-feature-1');
        expect(metadata).toBeDefined();
        expect(metadata?.syncSource).toBe('linear');
        expect(metadata?.syncDirection).toBe('pull');
        expect(metadata?.lastLinearState).toBe('In Progress');
      });

      it('should skip update if feature not found', async () => {
        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(null);

        await service.onLinearIssueUpdated('LINEAR-999', 'In Progress', '/test/path');

        expect(mockFeatureLoader.update).not.toHaveBeenCalled();
      });

      it('should skip update if service not running', async () => {
        service.stop();

        const feature = {
          id: 'test-feature-2',
          description: 'Test feature',
          category: 'test',
          status: 'backlog',
          linearIssueId: 'LINEAR-456',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);

        await service.onLinearIssueUpdated('LINEAR-456', 'In Progress', '/test/path');

        expect(mockFeatureLoader.update).not.toHaveBeenCalled();
      });

      it('should skip update if sync not enabled for project', async () => {
        vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue({
          integrations: {
            linear: {
              enabled: false, // Disabled
            },
          },
        } as any);

        const feature = {
          id: 'test-feature-3',
          description: 'Test feature',
          category: 'test',
          status: 'backlog',
          linearIssueId: 'LINEAR-789',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);

        await service.onLinearIssueUpdated('LINEAR-789', 'In Progress', '/test/path');

        expect(mockFeatureLoader.update).not.toHaveBeenCalled();
      });

      it('should skip update if last sync was from automaker (loop prevention)', async () => {
        const feature = {
          id: 'test-feature-4',
          description: 'Test feature',
          category: 'test',
          status: 'backlog',
          linearIssueId: 'LINEAR-111',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);

        // Set metadata indicating recent sync from automaker
        service.updateSyncMetadata({
          featureId: 'test-feature-4',
          lastSyncTimestamp: Date.now(),
          lastSyncStatus: 'success',
          linearIssueId: 'LINEAR-111',
          syncCount: 1,
          syncSource: 'automaker', // Last sync was from automaker
          syncDirection: 'push',
        });

        await service.onLinearIssueUpdated('LINEAR-111', 'In Progress', '/test/path');

        // Should skip due to loop prevention
        expect(mockFeatureLoader.update).not.toHaveBeenCalled();
      });

      it('should update if last automaker sync was beyond debounce window', async () => {
        const originalDateNow = Date.now;
        let currentTime = 1000000;
        Date.now = vi.fn(() => currentTime);

        const feature = {
          id: 'test-feature-5',
          description: 'Test feature',
          category: 'test',
          status: 'backlog',
          linearIssueId: 'LINEAR-222',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);
        vi.mocked(mockFeatureLoader.update).mockResolvedValue(feature as any);

        // Set metadata indicating old sync from automaker
        service.updateSyncMetadata({
          featureId: 'test-feature-5',
          lastSyncTimestamp: currentTime - 10000, // 10 seconds ago
          lastSyncStatus: 'success',
          linearIssueId: 'LINEAR-222',
          syncCount: 1,
          syncSource: 'automaker',
          syncDirection: 'push',
        });

        await service.onLinearIssueUpdated('LINEAR-222', 'In Progress', '/test/path');

        // Should proceed since enough time has passed
        expect(mockFeatureLoader.update).toHaveBeenCalled();

        Date.now = originalDateNow;
      });

      it('should skip update if Linear state unchanged', async () => {
        const feature = {
          id: 'test-feature-6',
          description: 'Test feature',
          category: 'test',
          status: 'in_progress',
          linearIssueId: 'LINEAR-333',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);

        // Set metadata with same Linear state
        service.updateSyncMetadata({
          featureId: 'test-feature-6',
          lastSyncTimestamp: Date.now(),
          lastSyncStatus: 'success',
          linearIssueId: 'LINEAR-333',
          syncCount: 1,
          syncSource: 'linear',
          syncDirection: 'pull',
          lastLinearState: 'In Progress', // Same state
        });

        await service.onLinearIssueUpdated('LINEAR-333', 'In Progress', '/test/path');

        // Should skip since state unchanged
        expect(mockFeatureLoader.update).not.toHaveBeenCalled();
      });

      it('should skip update if Automaker status would remain unchanged', async () => {
        const feature = {
          id: 'test-feature-7',
          description: 'Test feature',
          category: 'test',
          status: 'in_progress', // Already in_progress
          linearIssueId: 'LINEAR-444',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);

        await service.onLinearIssueUpdated('LINEAR-444', 'In Progress', '/test/path');

        // Should skip since Automaker status wouldn't change
        expect(mockFeatureLoader.update).not.toHaveBeenCalled();

        // But should update metadata to track lastLinearState
        const metadata = service.getSyncMetadata('test-feature-7');
        expect(metadata?.lastLinearState).toBe('In Progress');
      });

      it('should detect conflict if syncs from both sources within window', async () => {
        const originalDateNow = Date.now;
        let currentTime = 1000000;
        Date.now = vi.fn(() => currentTime);

        const feature = {
          id: 'test-feature-8',
          description: 'Test feature',
          category: 'test',
          status: 'backlog',
          linearIssueId: 'LINEAR-555',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);
        vi.mocked(mockFeatureLoader.update).mockResolvedValue(feature as any);

        // Set metadata indicating recent sync
        service.updateSyncMetadata({
          featureId: 'test-feature-8',
          lastSyncTimestamp: currentTime - 5000, // 5 seconds ago
          lastSyncStatus: 'success',
          linearIssueId: 'LINEAR-555',
          syncCount: 1,
          syncSource: 'automaker',
          syncDirection: 'push',
          lastSyncedAt: currentTime - 5000,
        });

        await service.onLinearIssueUpdated('LINEAR-555', 'In Progress', '/test/path');

        // Verify conflict was detected
        const metadata = service.getSyncMetadata('test-feature-8');
        expect(metadata?.conflictDetected).toBe(true);

        Date.now = originalDateNow;
      });

      it('should emit linear:sync:completed event on success', async () => {
        const emitSpy = vi.fn();
        emitter.subscribe(emitSpy);

        const feature = {
          id: 'test-feature-9',
          description: 'Test feature',
          category: 'test',
          status: 'backlog',
          linearIssueId: 'LINEAR-666',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);
        vi.mocked(mockFeatureLoader.update).mockResolvedValue(feature as any);

        await service.onLinearIssueUpdated('LINEAR-666', 'In Progress', '/test/path');

        // Find the sync:completed event
        const syncCompletedCall = emitSpy.mock.calls.find(
          (call) => call[0] === 'linear:sync:completed'
        );
        expect(syncCompletedCall).toBeDefined();
        expect(syncCompletedCall?.[1]).toMatchObject({
          featureId: 'test-feature-9',
          direction: 'pull',
          conflictDetected: false,
        });
      });

      it('should emit linear:sync:error event on failure', async () => {
        const emitSpy = vi.fn();
        emitter.subscribe(emitSpy);

        const feature = {
          id: 'test-feature-10',
          description: 'Test feature',
          category: 'test',
          status: 'backlog',
          linearIssueId: 'LINEAR-777',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);
        vi.mocked(mockFeatureLoader.update).mockRejectedValue(new Error('Update failed'));

        await service.onLinearIssueUpdated('LINEAR-777', 'In Progress', '/test/path');

        // Find the sync:error event
        const syncErrorCall = emitSpy.mock.calls.find((call) => call[0] === 'linear:sync:error');
        expect(syncErrorCall).toBeDefined();
        expect(syncErrorCall?.[1]).toMatchObject({
          linearIssueId: 'LINEAR-777',
          direction: 'pull',
          error: 'Update failed',
        });
      });

      it('should sync title changes from Linear', async () => {
        const feature = {
          id: 'test-feature-title',
          description: 'Test feature',
          category: 'test',
          status: 'backlog',
          title: 'Old Title',
          linearIssueId: 'LINEAR-T1',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);
        vi.mocked(mockFeatureLoader.update).mockResolvedValue(feature as any);

        await service.onLinearIssueUpdated('LINEAR-T1', 'Backlog', '/test/path', {
          title: 'New Title from Linear',
        });

        expect(mockFeatureLoader.update).toHaveBeenCalledWith(
          '/test/path',
          'test-feature-title',
          expect.objectContaining({
            title: 'New Title from Linear',
          })
        );
      });

      it('should sync priority changes from Linear (direct 0-4 mapping)', async () => {
        const feature = {
          id: 'test-feature-priority',
          description: 'Test feature',
          category: 'test',
          status: 'backlog',
          priority: 3,
          linearIssueId: 'LINEAR-P1',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);
        vi.mocked(mockFeatureLoader.update).mockResolvedValue(feature as any);

        await service.onLinearIssueUpdated('LINEAR-P1', 'Backlog', '/test/path', {
          priority: 1,
        });

        expect(mockFeatureLoader.update).toHaveBeenCalledWith(
          '/test/path',
          'test-feature-priority',
          expect.objectContaining({
            priority: 1,
          })
        );
      });

      it('should batch title, priority, and status changes in single update', async () => {
        const feature = {
          id: 'test-feature-batch',
          description: 'Test feature',
          category: 'test',
          status: 'backlog',
          title: 'Old Title',
          priority: 4,
          linearIssueId: 'LINEAR-B1',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);
        vi.mocked(mockFeatureLoader.update).mockResolvedValue(feature as any);

        await service.onLinearIssueUpdated('LINEAR-B1', 'In Progress', '/test/path', {
          title: 'Updated Title',
          priority: 1,
        });

        // Should be called exactly once with all changes batched
        expect(mockFeatureLoader.update).toHaveBeenCalledTimes(1);
        expect(mockFeatureLoader.update).toHaveBeenCalledWith(
          '/test/path',
          'test-feature-batch',
          expect.objectContaining({
            status: 'in_progress',
            title: 'Updated Title',
            priority: 1,
          })
        );
      });

      it('should skip update if title and priority unchanged', async () => {
        const feature = {
          id: 'test-feature-nochange',
          description: 'Test feature',
          category: 'test',
          status: 'backlog',
          title: 'Same Title',
          priority: 2,
          linearIssueId: 'LINEAR-NC',
        };

        vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(feature as any);

        await service.onLinearIssueUpdated('LINEAR-NC', 'Backlog', '/test/path', {
          title: 'Same Title',
          priority: 2,
        });

        // No changes needed, update should not be called
        expect(mockFeatureLoader.update).not.toHaveBeenCalled();
      });
    });
  });

  describe('Project Sync', () => {
    let mockProjectService: any;

    beforeEach(() => {
      mockProjectService = {
        getProject: vi.fn(),
        updateProject: vi.fn(),
        listProjects: vi.fn(),
      };

      // Configure settings with sync enabled
      (mockSettingsService.getProjectSettings as any).mockResolvedValue({
        integrations: {
          linear: {
            enabled: true,
            agentToken: 'test-token',
            teamId: 'team-123',
            syncOnFeatureCreate: true,
            syncOnStatusChange: true,
            commentOnCompletion: true,
            enableProjectUpdates: true,
          },
        },
      });

      service.initialize(emitter, mockSettingsService, mockFeatureLoader, mockProjectService);
      service.start();
    });

    it('should subscribe to project:scaffolded events', async () => {
      const emitSpy = vi.fn();
      const unsubscribe = emitter.subscribe(emitSpy);

      emitter.emit('project:scaffolded', {
        projectPath: '/test/path',
        projectSlug: 'test-project',
        projectTitle: 'Test Project',
        milestoneCount: 3,
        featuresCreated: 10,
      });

      expect(emitSpy).toHaveBeenCalledWith('project:scaffolded', expect.any(Object));
      unsubscribe();
    });

    it('should skip project sync when service is not running', async () => {
      service.stop();

      mockProjectService.getProject.mockResolvedValue({
        slug: 'test-project',
        title: 'Test Project',
        goal: 'Test goal',
      });

      emitter.emit('project:scaffolded', {
        projectPath: '/test/path',
        projectSlug: 'test-project',
        projectTitle: 'Test Project',
        milestoneCount: 1,
        featuresCreated: 3,
      });

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockProjectService.getProject).not.toHaveBeenCalled();
    });

    it('should skip project sync when Linear sync is not enabled', async () => {
      (mockSettingsService.getProjectSettings as any).mockResolvedValue({
        integrations: {
          linear: {
            enabled: false,
          },
        },
      });

      emitter.emit('project:scaffolded', {
        projectPath: '/test/path',
        projectSlug: 'test-project',
        projectTitle: 'Test Project',
        milestoneCount: 1,
        featuresCreated: 3,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockProjectService.getProject).not.toHaveBeenCalled();
    });

    it('should skip project sync when project already has linearProjectId', async () => {
      mockProjectService.getProject.mockResolvedValue({
        slug: 'test-project',
        title: 'Test Project',
        goal: 'Test goal',
        linearProjectId: 'already-synced',
      });

      emitter.emit('project:scaffolded', {
        projectPath: '/test/path',
        projectSlug: 'test-project',
        projectTitle: 'Test Project',
        milestoneCount: 1,
        featuresCreated: 3,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockProjectService.updateProject).not.toHaveBeenCalled();
    });

    it('should skip when projectService is not available', async () => {
      // Destroy the outer service to avoid dual event handling
      service.destroy();

      // Initialize a new service without projectService on a fresh emitter
      const freshEmitter = createEventEmitter();
      const serviceNoProject = new LinearSyncService();
      serviceNoProject.initialize(freshEmitter, mockSettingsService, mockFeatureLoader);
      serviceNoProject.start();

      freshEmitter.emit('project:scaffolded', {
        projectPath: '/test/path',
        projectSlug: 'test-project',
        projectTitle: 'Test Project',
        milestoneCount: 1,
        featuresCreated: 3,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockProjectService.getProject).not.toHaveBeenCalled();
      serviceNoProject.destroy();
    });

    it('should record error metric on failure', async () => {
      mockProjectService.getProject.mockRejectedValue(new Error('DB error'));

      emitter.emit('project:scaffolded', {
        projectPath: '/test/path',
        projectSlug: 'test-project',
        projectTitle: 'Test Project',
        milestoneCount: 1,
        featuresCreated: 3,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const metrics = service.getMetrics();
      expect(metrics.failedOperations).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Conflict Resolution', () => {
    beforeEach(() => {
      service.initialize(emitter, mockSettingsService, mockFeatureLoader);
      service.start();
    });

    it('should return empty conflicts when none exist', () => {
      expect(service.getConflicts()).toEqual([]);
    });

    it('should return features with conflictDetected flag', () => {
      service.updateSyncMetadata({
        featureId: 'feat-1',
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'success',
        syncCount: 1,
        conflictDetected: true,
      });
      service.updateSyncMetadata({
        featureId: 'feat-2',
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'success',
        syncCount: 1,
        conflictDetected: false,
      });

      const conflicts = service.getConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].featureId).toBe('feat-1');
    });

    it('should resolve a conflict and clear the flag', async () => {
      service.updateSyncMetadata({
        featureId: 'feat-1',
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'error',
        syncCount: 1,
        conflictDetected: true,
      });

      const resolved = await service.resolveConflict('/test/path', 'feat-1', 'accept-linear');
      expect(resolved).toBe(true);

      const metadata = service.getSyncMetadata('feat-1');
      expect(metadata?.conflictDetected).toBe(false);
      expect(metadata?.lastSyncStatus).toBe('success');
    });

    it('should return false when resolving non-existent conflict', async () => {
      expect(await service.resolveConflict('/test/path', 'nonexistent', 'accept-linear')).toBe(
        false
      );
    });

    it('should return false when feature has no conflict', async () => {
      service.updateSyncMetadata({
        featureId: 'feat-1',
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'success',
        syncCount: 1,
        conflictDetected: false,
      });

      expect(await service.resolveConflict('/test/path', 'feat-1', 'accept-automaker')).toBe(false);
    });
  });
});
