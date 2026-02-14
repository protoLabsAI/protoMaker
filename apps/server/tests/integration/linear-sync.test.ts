/**
 * Linear Sync Integration Tests
 *
 * Tests the bidirectional sync flow between Automaker and Linear:
 * - Loop prevention (guards against ping-pong)
 * - Debounce mechanism
 * - Conflict detection
 * - Event emission patterns
 * - onLinearIssueUpdated inbound flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LinearSyncService } from '../../src/services/linear-sync-service.js';
import { createEventEmitter } from '../../src/lib/events.js';
import type { EventEmitter } from '../../src/lib/events.js';
import type { SettingsService } from '../../src/services/settings-service.js';
import type { FeatureLoader } from '../../src/services/feature-loader.js';

/**
 * Helper to create a mock SettingsService with Linear integration enabled
 */
function createMockSettingsService(
  overrides: Partial<{
    enabled: boolean;
    agentToken: string;
    teamId: string;
    syncOnFeatureCreate: boolean;
    syncOnStatusChange: boolean;
  }> = {}
): SettingsService {
  const defaults = {
    enabled: true,
    agentToken: 'test-token',
    teamId: 'test-team-id',
    syncOnFeatureCreate: true,
    syncOnStatusChange: true,
    ...overrides,
  };

  return {
    getProjectSettings: vi.fn().mockResolvedValue({
      integrations: {
        linear: {
          enabled: defaults.enabled,
          agentToken: defaults.agentToken,
          teamId: defaults.teamId,
          syncOnFeatureCreate: defaults.syncOnFeatureCreate,
          syncOnStatusChange: defaults.syncOnStatusChange,
        },
      },
    }),
    get: vi.fn(),
    set: vi.fn(),
  } as any;
}

/**
 * Helper to create a mock FeatureLoader
 */
function createMockFeatureLoader(features: Record<string, any> = {}): FeatureLoader {
  return {
    get: vi.fn().mockImplementation((_path: string, featureId: string) => {
      return Promise.resolve(features[featureId] || null);
    }),
    getAll: vi.fn().mockResolvedValue(Object.values(features)),
    findByLinearIssueId: vi.fn().mockImplementation((_path: string, linearIssueId: string) => {
      const found = Object.values(features).find((f: any) => f.linearIssueId === linearIssueId);
      return Promise.resolve(found || null);
    }),
    update: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    load: vi.fn(),
  } as any;
}

/**
 * Helper to collect all emitted events
 */
function captureEvents(emitter: EventEmitter): Array<{ type: string; payload: any }> {
  const events: Array<{ type: string; payload: any }> = [];
  emitter.subscribe((type, payload) => {
    events.push({ type, payload });
  });
  return events;
}

describe('LinearSyncService (Integration)', () => {
  let service: LinearSyncService;
  let emitter: EventEmitter;
  let settingsService: SettingsService;
  let featureLoader: FeatureLoader;
  let capturedEvents: Array<{ type: string; payload: any }>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Stub global fetch (Linear API calls)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              issueCreate: {
                success: true,
                issue: { id: 'linear-issue-new', url: 'https://linear.app/issue/new' },
              },
            },
          }),
      })
    );

    service = new LinearSyncService();
    emitter = createEventEmitter();
    capturedEvents = captureEvents(emitter);
  });

  afterEach(() => {
    service.destroy();
    vi.unstubAllGlobals();
  });

  describe('Guard: Loop Prevention', () => {
    it('prevents re-entry when a feature is currently syncing', () => {
      settingsService = createMockSettingsService();
      featureLoader = createMockFeatureLoader();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      // Manually mark a feature as syncing
      (service as any).markSyncing('feature-1');

      // shouldSync must return false
      expect(service.shouldSync('feature-1')).toBe(false);

      // Different feature should still pass
      expect(service.shouldSync('feature-2')).toBe(true);
    });

    it('clears syncing flag after successful sync', async () => {
      featureLoader = createMockFeatureLoader({
        'feature-1': {
          id: 'feature-1',
          title: 'Test Feature',
          description: 'Test',
          status: 'backlog',
        },
      });
      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      // Trigger feature:created event
      emitter.emit('feature:created', {
        featureId: 'feature-1',
        projectPath: '/test/project',
      });

      // Wait for async processing
      await vi.waitFor(() => {
        expect(featureLoader.update).toHaveBeenCalled();
      });

      // Should no longer be marked as syncing
      expect((service as any).syncingFeatures.has('feature-1')).toBe(false);
    });

    it('clears syncing flag even on error', async () => {
      featureLoader = createMockFeatureLoader({
        'feature-1': {
          id: 'feature-1',
          title: 'Test Feature',
          description: 'Test',
          status: 'backlog',
        },
      });
      settingsService = createMockSettingsService();

      // Make fetch fail
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      emitter.emit('feature:created', {
        featureId: 'feature-1',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        const errorEvents = capturedEvents.filter((e) => e.type === 'linear:sync:error');
        expect(errorEvents.length).toBe(1);
      });

      // Syncing flag must be cleared
      expect((service as any).syncingFeatures.has('feature-1')).toBe(false);
    });
  });

  describe('Guard: Debouncing', () => {
    it('blocks rapid repeated syncs for the same feature', () => {
      settingsService = createMockSettingsService();
      featureLoader = createMockFeatureLoader();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      // First sync should pass
      expect(service.shouldSync('feature-1')).toBe(true);

      // Simulate that a sync just happened
      (service as any).lastSyncTimes.set('feature-1', Date.now());

      // Second sync within debounce window (5s) should be blocked
      expect(service.shouldSync('feature-1')).toBe(false);
    });

    it('allows sync after debounce window expires', () => {
      settingsService = createMockSettingsService();
      featureLoader = createMockFeatureLoader();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      // Set last sync time to 6 seconds ago (past the 5s debounce window)
      (service as any).lastSyncTimes.set('feature-1', Date.now() - 6000);

      expect(service.shouldSync('feature-1')).toBe(true);
    });
  });

  describe('Guard: Service State', () => {
    it('blocks sync when service is stopped', () => {
      settingsService = createMockSettingsService();
      featureLoader = createMockFeatureLoader();
      service.initialize(emitter, settingsService, featureLoader);

      // Service not started
      expect(service.shouldSync('feature-1')).toBe(false);
    });

    it('allows sync when service is running', () => {
      settingsService = createMockSettingsService();
      featureLoader = createMockFeatureLoader();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      expect(service.shouldSync('feature-1')).toBe(true);
    });

    it('blocks sync after service is stopped', () => {
      settingsService = createMockSettingsService();
      featureLoader = createMockFeatureLoader();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();
      service.stop();

      expect(service.shouldSync('feature-1')).toBe(false);
    });
  });

  describe('Outbound: Feature Created → Linear Issue', () => {
    it('creates a Linear issue when feature:created event fires', async () => {
      featureLoader = createMockFeatureLoader({
        'feature-1': {
          id: 'feature-1',
          title: 'New Feature',
          description: 'Feature description',
          status: 'backlog',
        },
      });
      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      emitter.emit('feature:created', {
        featureId: 'feature-1',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(featureLoader.update).toHaveBeenCalledWith('/test/project', 'feature-1', {
          linearIssueId: 'linear-issue-new',
          linearIssueUrl: 'https://linear.app/issue/new',
        });
      });

      // Check sync:completed event was emitted
      const syncEvents = capturedEvents.filter((e) => e.type === 'linear:sync:completed');
      expect(syncEvents.length).toBe(1);
      expect(syncEvents[0].payload).toEqual(
        expect.objectContaining({
          featureId: 'feature-1',
          direction: 'push',
          conflictDetected: false,
        })
      );
    });

    it('skips if feature already has a Linear issue ID', async () => {
      featureLoader = createMockFeatureLoader({
        'feature-1': {
          id: 'feature-1',
          title: 'Already Synced',
          description: 'Has issue',
          linearIssueId: 'existing-issue-id',
        },
      });
      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      emitter.emit('feature:created', {
        featureId: 'feature-1',
        projectPath: '/test/project',
      });

      // Give time for async processing
      await new Promise((r) => setTimeout(r, 50));

      // Should NOT have called update (no sync needed)
      expect(featureLoader.update).not.toHaveBeenCalled();
      // No fetch call to Linear API
      expect(fetch).not.toHaveBeenCalled();
    });

    it('skips if Linear sync is disabled for the project', async () => {
      featureLoader = createMockFeatureLoader({
        'feature-1': {
          id: 'feature-1',
          title: 'Feature',
          description: 'Desc',
        },
      });
      settingsService = createMockSettingsService({ enabled: false });
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      emitter.emit('feature:created', {
        featureId: 'feature-1',
        projectPath: '/test/project',
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(featureLoader.update).not.toHaveBeenCalled();
    });
  });

  describe('Inbound: Linear → Automaker (onLinearIssueUpdated)', () => {
    it('updates feature status from Linear state change', async () => {
      featureLoader = createMockFeatureLoader();
      vi.mocked(featureLoader.findByLinearIssueId).mockResolvedValue({
        id: 'feature-1',
        title: 'Test',
        description: 'Test',
        status: 'backlog',
        linearIssueId: 'linear-issue-1',
      } as any);

      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      await service.onLinearIssueUpdated('linear-issue-1', 'In Progress', '/test/project', {
        title: 'Updated Title',
        priority: 2,
      });

      // Feature should be updated with new status
      expect(featureLoader.update).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        expect.objectContaining({
          status: 'in_progress',
        })
      );
    });

    it('updates feature title and priority from Linear', async () => {
      featureLoader = createMockFeatureLoader();
      vi.mocked(featureLoader.findByLinearIssueId).mockResolvedValue({
        id: 'feature-1',
        title: 'Old Title',
        description: 'Test',
        status: 'backlog',
        linearIssueId: 'linear-issue-1',
      } as any);

      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      await service.onLinearIssueUpdated('linear-issue-1', 'Backlog', '/test/project', {
        title: 'New Title',
        priority: 1,
      });

      expect(featureLoader.update).toHaveBeenCalledWith(
        '/test/project',
        'feature-1',
        expect.objectContaining({
          title: 'New Title',
          priority: 1,
        })
      );
    });

    it('skips update if no matching feature found', async () => {
      featureLoader = createMockFeatureLoader();
      vi.mocked(featureLoader.findByLinearIssueId).mockResolvedValue(null);

      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      await service.onLinearIssueUpdated('no-match', 'In Progress', '/test/project', {
        title: 'Title',
      });

      expect(featureLoader.update).not.toHaveBeenCalled();
    });

    it('records sync metadata as pull direction', async () => {
      featureLoader = createMockFeatureLoader();
      vi.mocked(featureLoader.findByLinearIssueId).mockResolvedValue({
        id: 'feature-1',
        title: 'Test',
        description: 'Test',
        status: 'backlog',
        linearIssueId: 'linear-issue-1',
      } as any);

      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      await service.onLinearIssueUpdated('linear-issue-1', 'Done', '/test/project', {
        title: 'Test',
      });

      const metadata = service.getSyncMetadata('feature-1');
      expect(metadata).toBeDefined();
      expect(metadata!.syncDirection).toBe('pull');
      expect(metadata!.syncSource).toBe('linear');
      expect(metadata!.lastSyncStatus).toBe('success');
    });
  });

  describe('Conflict Detection', () => {
    it('detects conflict when push and pull happen within detection window', async () => {
      featureLoader = createMockFeatureLoader();
      vi.mocked(featureLoader.findByLinearIssueId).mockResolvedValue({
        id: 'feature-1',
        title: 'Test',
        description: 'Test',
        status: 'backlog',
        linearIssueId: 'linear-issue-1',
      } as any);

      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      // Simulate a push from Automaker 7 seconds ago
      // (past the 5s debounce window but within the 10s conflict detection window)
      const sevenSecondsAgo = Date.now() - 7000;
      service.updateSyncMetadata({
        featureId: 'feature-1',
        lastSyncTimestamp: sevenSecondsAgo,
        lastSyncStatus: 'success',
        syncCount: 1,
        syncSource: 'automaker',
        syncDirection: 'push',
        lastSyncedAt: sevenSecondsAgo,
      });

      // Now a pull from Linear arrives within the conflict window
      await service.onLinearIssueUpdated('linear-issue-1', 'Done', '/test/project', {
        title: 'Test',
      });

      const metadata = service.getSyncMetadata('feature-1');
      expect(metadata).toBeDefined();
      expect(metadata!.conflictDetected).toBe(true);
    });

    it('does not flag conflict when sufficient time has passed', async () => {
      featureLoader = createMockFeatureLoader();
      vi.mocked(featureLoader.findByLinearIssueId).mockResolvedValue({
        id: 'feature-1',
        title: 'Test',
        description: 'Test',
        status: 'backlog',
        linearIssueId: 'linear-issue-1',
      } as any);

      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      // Simulate a push from Automaker that happened 15 seconds ago
      // (past the 10s conflict detection window)
      service.updateSyncMetadata({
        featureId: 'feature-1',
        lastSyncTimestamp: Date.now() - 15000,
        lastSyncStatus: 'success',
        syncCount: 1,
        syncSource: 'automaker',
        syncDirection: 'push',
        lastSyncedAt: Date.now() - 15000,
      });

      await service.onLinearIssueUpdated('linear-issue-1', 'Done', '/test/project', {
        title: 'Test',
      });

      const metadata = service.getSyncMetadata('feature-1');
      expect(metadata!.conflictDetected).toBe(false);
    });
  });

  describe('Sync Metadata Tracking', () => {
    it('stores and retrieves sync metadata', () => {
      settingsService = createMockSettingsService();
      featureLoader = createMockFeatureLoader();
      service.initialize(emitter, settingsService, featureLoader);

      const metadata = {
        featureId: 'feature-1',
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'success' as const,
        linearIssueId: 'linear-123',
        syncCount: 3,
        syncSource: 'automaker' as const,
        syncDirection: 'push' as const,
      };

      service.updateSyncMetadata(metadata);

      const retrieved = service.getSyncMetadata('feature-1');
      expect(retrieved).toEqual(metadata);
    });

    it('returns undefined for unknown features', () => {
      settingsService = createMockSettingsService();
      featureLoader = createMockFeatureLoader();
      service.initialize(emitter, settingsService, featureLoader);

      expect(service.getSyncMetadata('nonexistent')).toBeUndefined();
    });

    it('clears metadata on destroy', () => {
      settingsService = createMockSettingsService();
      featureLoader = createMockFeatureLoader();
      service.initialize(emitter, settingsService, featureLoader);

      service.updateSyncMetadata({
        featureId: 'feature-1',
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'success',
        syncCount: 1,
      });

      service.destroy();

      expect(service.getSyncMetadata('feature-1')).toBeUndefined();
    });
  });

  describe('Event Emission', () => {
    it('emits linear:sync:completed on successful outbound sync', async () => {
      featureLoader = createMockFeatureLoader({
        'feature-1': {
          id: 'feature-1',
          title: 'Feature',
          description: 'Desc',
          status: 'backlog',
        },
      });
      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      emitter.emit('feature:created', {
        featureId: 'feature-1',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        const syncEvents = capturedEvents.filter((e) => e.type === 'linear:sync:completed');
        expect(syncEvents.length).toBe(1);
        expect(syncEvents[0].payload.direction).toBe('push');
      });
    });

    it('emits linear:sync:error on failed outbound sync', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

      featureLoader = createMockFeatureLoader({
        'feature-1': {
          id: 'feature-1',
          title: 'Feature',
          description: 'Desc',
          status: 'backlog',
        },
      });
      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      emitter.emit('feature:created', {
        featureId: 'feature-1',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        const errorEvents = capturedEvents.filter((e) => e.type === 'linear:sync:error');
        expect(errorEvents.length).toBe(1);
        expect(errorEvents[0].payload.error).toContain('Connection refused');
      });
    });
  });

  describe('Settings Integration', () => {
    it('checks project sync is enabled before syncing', async () => {
      settingsService = createMockSettingsService();
      featureLoader = createMockFeatureLoader();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      const enabled = await service.isProjectSyncEnabled('/test/project');
      expect(enabled).toBe(true);
      expect(settingsService.getProjectSettings).toHaveBeenCalledWith('/test/project');
    });

    it('returns false when Linear integration is disabled', async () => {
      settingsService = createMockSettingsService({ enabled: false });
      featureLoader = createMockFeatureLoader();
      service.initialize(emitter, settingsService, featureLoader);

      const enabled = await service.isProjectSyncEnabled('/test/project');
      expect(enabled).toBe(false);
    });

    it('returns false when no token source is available', async () => {
      // Clear env vars that could provide a token fallback
      const savedKey = process.env.LINEAR_API_KEY;
      const savedToken = process.env.LINEAR_API_TOKEN;
      delete process.env.LINEAR_API_KEY;
      delete process.env.LINEAR_API_TOKEN;

      settingsService = createMockSettingsService({ agentToken: '' });
      featureLoader = createMockFeatureLoader();
      service.initialize(emitter, settingsService, featureLoader);

      const enabled = await service.isProjectSyncEnabled('/test/project');
      expect(enabled).toBe(false);

      // Restore env vars
      if (savedKey) process.env.LINEAR_API_KEY = savedKey;
      if (savedToken) process.env.LINEAR_API_TOKEN = savedToken;
    });
  });

  describe('Parent/Child Issue Hierarchy', () => {
    it('creates child issue with parentId when feature has epicId', async () => {
      const parentFeature = {
        id: 'milestone-epic-1',
        title: 'Milestone Epic',
        description: 'Epic feature',
        status: 'backlog',
        isEpic: true,
        linearIssueId: 'linear-parent-issue-id',
      };

      const childFeature = {
        id: 'phase-feature-1',
        title: 'Phase Feature',
        description: 'Child feature',
        status: 'backlog',
        epicId: 'milestone-epic-1',
      };

      featureLoader = createMockFeatureLoader({
        'milestone-epic-1': parentFeature,
        'phase-feature-1': childFeature,
      });

      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      // Mock fetch to verify parentId is passed
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              issueCreate: {
                success: true,
                issue: { id: 'linear-child-issue-id', url: 'https://linear.app/issue/child' },
              },
            },
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      // Trigger feature creation for child feature
      emitter.emit('feature:created', {
        featureId: 'phase-feature-1',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const fetchCall = mockFetch.mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);

        // Verify parentId was included in the GraphQL mutation variables
        expect(body.variables.parentId).toBe('linear-parent-issue-id');
      });
    });

    it('creates issue without parentId when feature has no epicId', async () => {
      const standaloneFeature = {
        id: 'standalone-1',
        title: 'Standalone Feature',
        description: 'No parent',
        status: 'backlog',
      };

      featureLoader = createMockFeatureLoader({
        'standalone-1': standaloneFeature,
      });

      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              issueCreate: {
                success: true,
                issue: { id: 'linear-standalone-id', url: 'https://linear.app/issue/standalone' },
              },
            },
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      emitter.emit('feature:created', {
        featureId: 'standalone-1',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const fetchCall = mockFetch.mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);

        // Verify parentId is undefined
        expect(body.variables.parentId).toBeUndefined();
      });
    });

    it('skips parentId when parent feature has no linearIssueId', async () => {
      const parentFeature = {
        id: 'milestone-epic-2',
        title: 'Milestone Epic Without Linear Issue',
        description: 'Epic without sync',
        status: 'backlog',
        isEpic: true,
        // No linearIssueId
      };

      const childFeature = {
        id: 'phase-feature-2',
        title: 'Phase Feature',
        description: 'Child feature',
        status: 'backlog',
        epicId: 'milestone-epic-2',
      };

      featureLoader = createMockFeatureLoader({
        'milestone-epic-2': parentFeature,
        'phase-feature-2': childFeature,
      });

      settingsService = createMockSettingsService();
      service.initialize(emitter, settingsService, featureLoader);
      service.start();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              issueCreate: {
                success: true,
                issue: { id: 'linear-orphan-id', url: 'https://linear.app/issue/orphan' },
              },
            },
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      emitter.emit('feature:created', {
        featureId: 'phase-feature-2',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        const fetchCall = mockFetch.mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);

        // Verify parentId is undefined when parent has no Linear issue
        expect(body.variables.parentId).toBeUndefined();
      });
    });
  });
});
