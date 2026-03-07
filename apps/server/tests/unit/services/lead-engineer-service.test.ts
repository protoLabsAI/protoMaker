import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EventType, Feature } from '@protolabsai/types';
import { LeadEngineerService } from '@/services/lead-engineer-service.js';
import { FeatureStateMachine } from '@/services/lead-engineer-state-machine.js';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
  FeatureProcessingState,
} from '@/services/lead-engineer-types.js';
import {
  createMockFeatureLoader,
  createMockSettingsService,
  createMockProjectService,
  createMockMetricsService,
  type MockFeatureLoader,
  type MockSettingsService,
  type MockProjectService,
  type MockMetricsService,
} from '../../helpers/mock-factories.js';

// ────────────────────────── Mocks ──────────────────────────

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/lib/settings-helpers.js', () => ({
  getWorkflowSettings: vi.fn(),
}));

import { getWorkflowSettings } from '@/lib/settings-helpers.js';
const mockGetWorkflowSettings = getWorkflowSettings as unknown as ReturnType<typeof vi.fn>;

function createMockEvents() {
  const subscribers: Array<(type: EventType, payload: unknown) => void> = [];
  const typedSubscribers: Array<{ type: EventType; cb: (payload: unknown) => void }> = [];
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
    on: vi.fn((type: EventType, cb: (payload: unknown) => void) => {
      typedSubscribers.push({ type, cb });
      return {
        unsubscribe: () => {
          const idx = typedSubscribers.findIndex((s) => s.type === type && s.cb === cb);
          if (idx >= 0) typedSubscribers.splice(idx, 1);
        },
      };
    }),
    _fire(type: EventType, payload: unknown) {
      for (const cb of subscribers) cb(type, payload);
      for (const s of typedSubscribers) {
        if (s.type === type) s.cb(payload);
      }
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

function createMockAutoModeService() {
  return {
    getRunningAgents: vi.fn().mockResolvedValue([]),
    getActiveAutoLoopProjects: vi.fn().mockReturnValue([]),
    startAutoLoop: vi.fn().mockResolvedValue(undefined),
    stopFeature: vi.fn().mockResolvedValue(true),
    followUpFeature: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockProjectLifecycleService() {
  return {
    launch: vi.fn().mockResolvedValue({ autoModeStarted: true }),
  };
}

// ────────────────────────── Mock State Processor ──────────────────────────

function createMockProcessor(
  nextState: FeatureProcessingState | null,
  shouldContinue = true
): StateProcessor {
  return {
    enter: vi.fn().mockResolvedValue(undefined),
    process: vi.fn().mockResolvedValue({
      nextState,
      shouldContinue,
      reason: `Mock transition to ${nextState}`,
    } as StateTransitionResult),
    exit: vi.fn().mockResolvedValue(undefined),
  };
}

// ────────────────────────── Tests ──────────────────────────

describe('LeadEngineerService', () => {
  let service: LeadEngineerService;
  let events: ReturnType<typeof createMockEvents>;
  let featureLoader: MockFeatureLoader;
  let autoModeService: ReturnType<typeof createMockAutoModeService>;
  let projectService: MockProjectService;
  let projectLifecycleService: ReturnType<typeof createMockProjectLifecycleService>;
  let settingsService: MockSettingsService;
  let metricsService: MockMetricsService;

  beforeEach(() => {
    vi.useFakeTimers();
    // Re-establish settings mock cleared by vitest's mockReset: true
    mockGetWorkflowSettings.mockResolvedValue({
      pipeline: {
        supervisorEnabled: false,
        checkpointEnabled: false,
        goalGatesEnabled: false,
        antagonisticPlanReview: false,
      },
    });
    events = createMockEvents();
    featureLoader = createMockFeatureLoader([]);
    autoModeService = createMockAutoModeService();
    projectService = createMockProjectService({
      getProject: vi.fn().mockResolvedValue({
        title: 'Test Project',
        slug: 'test-project',
        milestones: [],
      }),
    });
    projectLifecycleService = createMockProjectLifecycleService();
    settingsService = createMockSettingsService({
      getGlobalSettings: vi.fn().mockResolvedValue({ maxConcurrency: 3 }),
      getProjectSettings: vi.fn().mockResolvedValue({ workflow: {} }),
    });
    metricsService = createMockMetricsService({
      getProjectMetrics: vi.fn().mockResolvedValue({
        avgCycleTimeMs: 60000,
        totalCostUsd: 5.0,
        completedFeatures: 3,
      }),
    });

    service = new LeadEngineerService(
      events as any,
      featureLoader as any,
      autoModeService as any,
      projectService as any,
      projectLifecycleService as any,
      settingsService as any,
      metricsService as any
    );
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
  });

  // ──── Session Management ────

  describe('session management', () => {
    it('starts a session and emits lead-engineer:started', async () => {
      await service.initialize();
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
        metricsService as any
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
        metricsService as any
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
        metricsService as any
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

// ────────────────────────── FeatureStateMachine Pipeline Tests ──────────────────────────

describe('FeatureStateMachine — pipeline state transitions', () => {
  let mockEvents: ReturnType<typeof createMockEvents>;
  let mockFeatureLoader: ReturnType<typeof createMockFeatureLoader>;
  let mockAutoModeService: ReturnType<typeof createMockAutoModeService>;
  let serviceContext: ProcessorServiceContext;

  beforeEach(() => {
    mockEvents = createMockEvents();
    mockFeatureLoader = createMockFeatureLoader([]);
    mockAutoModeService = createMockAutoModeService();

    serviceContext = {
      events: mockEvents as any,
      featureLoader: mockFeatureLoader as any,
      autoModeService: mockAutoModeService as any,
    };
  });

  function makeFeature(overrides: Partial<Feature> = {}): Feature {
    return {
      id: 'feat-1',
      title: 'Test Feature',
      description: 'A feature to test the pipeline',
      status: 'backlog',
      category: 'feature',
      ...overrides,
    };
  }

  function makeOptions() {
    return { model: 'sonnet' };
  }

  it('happy path: INTAKE → EXECUTE → REVIEW → MERGE → DEPLOY (finalState=DEPLOY, status=done)', async () => {
    const feature = makeFeature();
    const stateMachine = new FeatureStateMachine(serviceContext, { goalGatesEnabled: false });

    // Replace processors with mocks that drive happy-path transitions
    stateMachine.registerProcessor('INTAKE', createMockProcessor('EXECUTE'));
    stateMachine.registerProcessor('PLAN', createMockProcessor('EXECUTE'));
    stateMachine.registerProcessor('EXECUTE', createMockProcessor('REVIEW'));
    stateMachine.registerProcessor('REVIEW', createMockProcessor('MERGE'));
    stateMachine.registerProcessor('MERGE', createMockProcessor('DEPLOY'));
    stateMachine.registerProcessor('DEPLOY', createMockProcessor(null, false));

    const { finalState } = await stateMachine.processFeature(
      feature,
      '/test/project',
      makeOptions()
    );
    expect(finalState).toBe('DEPLOY');
  });

  it('happy path with PLAN: INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY', async () => {
    const feature = makeFeature({ complexity: 'large' });
    const stateMachine = new FeatureStateMachine(serviceContext, { goalGatesEnabled: false });

    stateMachine.registerProcessor('INTAKE', createMockProcessor('PLAN'));
    stateMachine.registerProcessor('PLAN', createMockProcessor('EXECUTE'));
    stateMachine.registerProcessor('EXECUTE', createMockProcessor('REVIEW'));
    stateMachine.registerProcessor('REVIEW', createMockProcessor('MERGE'));
    stateMachine.registerProcessor('MERGE', createMockProcessor('DEPLOY'));
    stateMachine.registerProcessor('DEPLOY', createMockProcessor(null, false));

    const { finalState } = await stateMachine.processFeature(
      feature,
      '/test/project',
      makeOptions()
    );
    expect(finalState).toBe('DEPLOY');
  });

  it('INTAKE → ESCALATE when processor transitions to ESCALATE', async () => {
    const feature = makeFeature();
    mockFeatureLoader.update.mockResolvedValue(undefined);

    const stateMachine = new FeatureStateMachine(serviceContext, { goalGatesEnabled: false });

    // INTAKE processor signals ESCALATE (e.g. unmet deps)
    const intakeProcessor: StateProcessor = {
      enter: vi.fn().mockResolvedValue(undefined),
      process: vi.fn().mockResolvedValue({
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: 'Unmet dependencies: dep-1, dep-2',
      } as StateTransitionResult),
      exit: vi.fn().mockResolvedValue(undefined),
    };

    const escalateProcessor: StateProcessor = {
      enter: vi.fn().mockResolvedValue(undefined),
      process: vi.fn().mockResolvedValue({
        nextState: null,
        shouldContinue: false,
        reason: 'Escalated',
      } as StateTransitionResult),
      exit: vi.fn().mockResolvedValue(undefined),
    };

    stateMachine.registerProcessor('INTAKE', intakeProcessor);
    stateMachine.registerProcessor('ESCALATE', escalateProcessor);

    const { finalState } = await stateMachine.processFeature(
      feature,
      '/test/project',
      makeOptions()
    );

    expect(finalState).toBe('ESCALATE');
    expect(escalateProcessor.process).toHaveBeenCalled();
  });

  it('EXECUTE → ESCALATE when processor transitions to ESCALATE after retries', async () => {
    const feature = makeFeature();
    mockFeatureLoader.update.mockResolvedValue(undefined);

    const stateMachine = new FeatureStateMachine(serviceContext, { goalGatesEnabled: false });

    stateMachine.registerProcessor('INTAKE', createMockProcessor('EXECUTE'));

    // EXECUTE processor fails immediately and escalates
    const executeProcessor: StateProcessor = {
      enter: vi.fn().mockResolvedValue(undefined),
      process: vi.fn().mockResolvedValue({
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: 'Max agent retries exceeded (3)',
      } as StateTransitionResult),
      exit: vi.fn().mockResolvedValue(undefined),
    };

    const escalateProcessor: StateProcessor = {
      enter: vi.fn().mockResolvedValue(undefined),
      process: vi.fn().mockResolvedValue({
        nextState: null,
        shouldContinue: false,
        reason: 'Escalated',
      } as StateTransitionResult),
      exit: vi.fn().mockResolvedValue(undefined),
    };

    stateMachine.registerProcessor('EXECUTE', executeProcessor);
    stateMachine.registerProcessor('ESCALATE', escalateProcessor);

    const { finalState } = await stateMachine.processFeature(
      feature,
      '/test/project',
      makeOptions()
    );

    expect(finalState).toBe('ESCALATE');
    expect(escalateProcessor.process).toHaveBeenCalled();
  });

  it('state machine emits pipeline:state-entered events for each state', async () => {
    const feature = makeFeature();
    const stateMachine = new FeatureStateMachine(serviceContext, {
      goalGatesEnabled: false,
      events: mockEvents as any,
    });

    stateMachine.registerProcessor('INTAKE', createMockProcessor('EXECUTE'));
    stateMachine.registerProcessor('EXECUTE', createMockProcessor('REVIEW'));
    stateMachine.registerProcessor('REVIEW', createMockProcessor(null, false));

    await stateMachine.processFeature(feature, '/test/project', makeOptions());

    const stateEnteredCalls = (mockEvents.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([type]) => type === 'pipeline:state-entered'
    );

    const enteredStates = stateEnteredCalls.map(([, payload]) => (payload as any).state);
    expect(enteredStates).toContain('INTAKE');
    expect(enteredStates).toContain('EXECUTE');
    expect(enteredStates).toContain('REVIEW');
  });

  it('escalation signal is emitted when ESCALATE processor runs', async () => {
    const feature = makeFeature();
    // Wire up EscalateProcessor via real service context so it emits signal
    const stateMachine = new FeatureStateMachine(serviceContext, { goalGatesEnabled: false });

    stateMachine.registerProcessor('INTAKE', {
      enter: vi.fn().mockResolvedValue(undefined),
      process: vi.fn().mockImplementation(async (ctx: StateContext) => {
        ctx.escalationReason = 'Unmet dependencies: dep-1';
        return { nextState: 'ESCALATE', shouldContinue: true, reason: 'Unmet deps' };
      }),
      exit: vi.fn().mockResolvedValue(undefined),
    });

    mockFeatureLoader.update.mockResolvedValue(undefined);

    await stateMachine.processFeature(feature, '/test/project', makeOptions());

    // EscalateProcessor emits escalation:signal-received
    const escalationEmit = (mockEvents.emit as ReturnType<typeof vi.fn>).mock.calls.find(
      ([type]) => type === 'escalation:signal-received'
    );
    expect(escalationEmit).toBeDefined();
  });
});
