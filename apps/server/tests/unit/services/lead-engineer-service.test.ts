import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EventType, Feature } from '@protolabs-ai/types';
import { LeadEngineerService } from '@/services/lead-engineer-service.js';

// ────────────────────────── Mocks ──────────────────────────

function createMockEvents() {
  const subscribers: Array<(type: EventType, payload: unknown) => void> = [];
  return {
    emit: vi.fn(),
    subscribe: vi.fn((cb: (type: EventType, payload: unknown) => void) => {
      subscribers.push(cb);
      const unsub = () => {
        const idx = subscribers.indexOf(cb);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
      (unsub as any).unsubscribe = unsub;
      return unsub;
    }),
    _fire(type: EventType, payload: unknown) {
      for (const cb of subscribers) cb(type, payload);
    },
    _subscribers: subscribers,
  };
}

function createMockFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'f1',
    category: 'feature',
    description: 'Test feature',
    status: 'backlog',
    ...overrides,
  };
}

function createMockFeatureLoader(features: Feature[] = []) {
  return {
    getAll: vi.fn().mockResolvedValue(features),
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockImplementation(async (_path: string, id: string) => {
      return features.find((f) => f.id === id) || null;
    }),
  };
}

function createMockAutoModeService() {
  return {
    getRunningAgents: vi.fn().mockResolvedValue([]),
    getActiveAutoLoopProjects: vi.fn().mockReturnValue([]),
    startAutoLoop: vi.fn().mockResolvedValue(undefined),
    stopFeature: vi.fn().mockResolvedValue(true),
    followUpFeature: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockProjectService() {
  return {
    getProject: vi.fn().mockResolvedValue({
      title: 'Test Project',
      slug: 'test-project',
      milestones: [],
    }),
  };
}

function createMockProjectLifecycleService() {
  return {
    launch: vi.fn().mockResolvedValue({ autoModeStarted: true }),
  };
}

function createMockSettingsService() {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({ maxConcurrency: 3 }),
  };
}

function createMockMetricsService() {
  return {
    getProjectMetrics: vi.fn().mockResolvedValue({
      avgCycleTimeMs: 60000,
      totalCostUsd: 5.0,
      completedFeatures: 3,
    }),
  };
}

// ────────────────────────── Tests ──────────────────────────

describe('LeadEngineerService', () => {
  let service: LeadEngineerService;
  let events: ReturnType<typeof createMockEvents>;
  let featureLoader: ReturnType<typeof createMockFeatureLoader>;
  let autoModeService: ReturnType<typeof createMockAutoModeService>;
  let projectService: ReturnType<typeof createMockProjectService>;
  let projectLifecycleService: ReturnType<typeof createMockProjectLifecycleService>;
  let settingsService: ReturnType<typeof createMockSettingsService>;
  let metricsService: ReturnType<typeof createMockMetricsService>;

  beforeEach(() => {
    vi.useFakeTimers();
    events = createMockEvents();
    featureLoader = createMockFeatureLoader([]);
    autoModeService = createMockAutoModeService();
    projectService = createMockProjectService();
    projectLifecycleService = createMockProjectLifecycleService();
    settingsService = createMockSettingsService();
    metricsService = createMockMetricsService();

    service = new LeadEngineerService(
      events as any,
      featureLoader as any,
      autoModeService as any,
      projectService as any,
      projectLifecycleService as any,
      settingsService as any,
      metricsService as any,
      '/test/repo'
    );
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
  });

  // ──── Session Management ────

  describe('session management', () => {
    it('starts a session and emits lead-engineer:started', async () => {
      await await service.initialize();
      const session = await service.start('/test/project', 'my-project');

      expect(session.projectPath).toBe('/test/project');
      expect(session.projectSlug).toBe('my-project');
      expect(session.flowState).toBe('running');
      expect(events.emit).toHaveBeenCalledWith('lead-engineer:started', {
        projectPath: '/test/project',
        projectSlug: 'my-project',
      });
    });

    it('returns existing session on duplicate start', async () => {
      await service.initialize();
      const session1 = await service.start('/test/project', 'my-project');
      const session2 = await service.start('/test/project', 'my-project');

      expect(session1).toBe(session2);
    });

    it('stops a session and emits lead-engineer:stopped', async () => {
      await service.initialize();
      await service.start('/test/project', 'my-project');
      await service.stop('/test/project');

      expect(events.emit).toHaveBeenCalledWith('lead-engineer:stopped', {
        projectPath: '/test/project',
        projectSlug: 'my-project',
      });
      expect(service.getSession('/test/project')).toBeUndefined();
    });

    it('isManaged returns true for managed projects', async () => {
      await service.initialize();
      expect(service.isManaged('/test/project')).toBe(false);

      await service.start('/test/project', 'my-project');
      expect(service.isManaged('/test/project')).toBe(true);

      await service.stop('/test/project');
      expect(service.isManaged('/test/project')).toBe(false);
    });

    it('getManagedProjectPaths returns all managed paths', async () => {
      await service.initialize();
      await service.start('/test/project-a', 'project-a');
      await service.start('/test/project-b', 'project-b');

      expect(service.getManagedProjectPaths()).toEqual(
        expect.arrayContaining(['/test/project-a', '/test/project-b'])
      );
    });

    it('getAllSessions returns all active sessions', async () => {
      await service.initialize();
      await service.start('/test/project-a', 'project-a');
      await service.start('/test/project-b', 'project-b');

      expect(service.getAllSessions()).toHaveLength(2);
    });
  });

  // ──── Auto-start from lifecycle event ────

  describe('auto-start', () => {
    it('auto-starts when project:lifecycle:launched fires', async () => {
      await service.initialize();

      // Simulate lifecycle launched event
      events._fire('project:lifecycle:launched' as EventType, {
        projectPath: '/test/project',
        projectSlug: 'my-project',
      });

      // Wait for async start
      await vi.advanceTimersByTimeAsync(10);

      expect(service.isManaged('/test/project')).toBe(true);
    });
  });

  // ──── Event routing ────

  describe('event routing', () => {
    it('ignores events for unmanaged projects', async () => {
      await service.initialize();
      await service.start('/test/project', 'my-project');

      // Fire event for a different project
      events._fire('feature:status-changed' as EventType, {
        featureId: 'f1',
        projectPath: '/other/project',
        newStatus: 'done',
      });

      // No actions should be taken — session unaffected
      const session = service.getSession('/test/project');
      expect(session?.actionsTaken).toBe(0);
    });

    it('routes events by featureId when projectPath is missing', async () => {
      const features = [createMockFeature({ id: 'f1', status: 'in_progress' })];
      featureLoader = createMockFeatureLoader(features);
      service = new LeadEngineerService(
        events as any,
        featureLoader as any,
        autoModeService as any,
        projectService as any,
        projectLifecycleService as any,
        settingsService as any,
        metricsService as any,
        '/test/repo'
      );
      await service.initialize();
      await service.start('/test/project', 'my-project');

      // Feature event without projectPath but with featureId
      events._fire('feature:completed' as EventType, { featureId: 'f1' });

      // The agent should be removed from world state
      const session = service.getSession('/test/project');
      expect(session?.worldState.agents.find((a) => a.featureId === 'f1')).toBeUndefined();
    });
  });

  // ──── WorldState updates ────

  describe('world state updates', () => {
    it('patches board counts on feature:status-changed', async () => {
      const features = [createMockFeature({ id: 'f1', status: 'review' })];
      featureLoader = createMockFeatureLoader(features);
      service = new LeadEngineerService(
        events as any,
        featureLoader as any,
        autoModeService as any,
        projectService as any,
        projectLifecycleService as any,
        settingsService as any,
        metricsService as any,
        '/test/repo'
      );
      await service.initialize();
      await service.start('/test/project', 'my-project');

      events._fire('feature:status-changed' as EventType, {
        featureId: 'f1',
        oldStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      const session = service.getSession('/test/project');
      expect(session?.worldState.features['f1'].status).toBe('done');
    });

    it('updates autoModeRunning on auto-mode events', async () => {
      await service.initialize();
      await service.start('/test/project', 'my-project');

      events._fire('auto-mode:started' as EventType, { projectPath: '/test/project' });
      expect(service.getSession('/test/project')?.worldState.autoModeRunning).toBe(true);

      events._fire('auto-mode:stopped' as EventType, { projectPath: '/test/project' });
      expect(service.getSession('/test/project')?.worldState.autoModeRunning).toBe(false);
    });
  });

  // ──── Flow state transitions ────

  describe('flow state transitions', () => {
    it('starts in running state', async () => {
      await service.initialize();
      const session = await service.start('/test/project', 'my-project');
      expect(session.flowState).toBe('running');
    });

    it('transitions to stopped on stop()', async () => {
      await service.initialize();
      await service.start('/test/project', 'my-project');
      await service.stop('/test/project');

      // Session is removed after stop, but stopped event was emitted
      expect(events.emit).toHaveBeenCalledWith('lead-engineer:stopped', expect.any(Object));
    });
  });

  // ──── Action execution ────

  describe('action execution', () => {
    it('launches auto-mode on start when backlog > 0', async () => {
      const features = [
        createMockFeature({ id: 'f1', status: 'backlog' }),
        createMockFeature({ id: 'f2', status: 'backlog' }),
      ];
      featureLoader = createMockFeatureLoader(features);
      service = new LeadEngineerService(
        events as any,
        featureLoader as any,
        autoModeService as any,
        projectService as any,
        projectLifecycleService as any,
        settingsService as any,
        metricsService as any,
        '/test/repo'
      );
      await service.initialize();
      await service.start('/test/project', 'my-project');

      expect(projectLifecycleService.launch).toHaveBeenCalledWith(
        '/test/project',
        'my-project',
        undefined
      );
    });

    it('does not launch auto-mode when auto-mode is already running', async () => {
      autoModeService.getActiveAutoLoopProjects.mockReturnValue(['/test/project']);
      await service.initialize();
      await service.start('/test/project', 'my-project');

      expect(projectLifecycleService.launch).not.toHaveBeenCalled();
    });
  });

  // ──── Cleanup ────

  describe('cleanup', () => {
    it('destroy clears all sessions and subscriptions', async () => {
      await service.initialize();
      await service.start('/test/project', 'my-project');
      expect(service.getAllSessions()).toHaveLength(1);

      service.destroy();
      expect(service.getAllSessions()).toHaveLength(0);
    });
  });
});
