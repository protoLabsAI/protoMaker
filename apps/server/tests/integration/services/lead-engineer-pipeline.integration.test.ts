/**
 * Lead Engineer Pipeline Integration Test
 *
 * Tests the FeatureStateMachine pipeline end-to-end with mock processors
 * that simulate real processor behavior (status updates, escalation writes).
 *
 * Covers:
 *   1. Happy path: INTAKE -> PLAN -> EXECUTE -> REVIEW -> MERGE -> DEPLOY -> DONE
 *   2. INTAKE ESCALATE: unmet deps -> blocked, statusChangeReason set, failureCount incremented
 *   3. EXECUTE ESCALATE: agent failure -> blocked after retries
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature } from '@protolabsai/types';
import { FeatureStateMachine } from '@/services/lead-engineer-state-machine.js';
import { EscalateProcessor } from '@/services/lead-engineer-escalation.js';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
  FeatureProcessingState,
} from '@/services/lead-engineer-types.js';

// ────────────────────────── Mocks ──────────────────────────

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@protolabsai/platform', async () => {
  const actual =
    await vi.importActual<typeof import('@protolabsai/platform')>('@protolabsai/platform');
  return {
    ...actual,
    getFeatureDir: vi.fn().mockReturnValue('/tmp/test-features'),
    getAutomakerDir: vi.fn().mockReturnValue('/tmp/test-automaker'),
  };
});

// ────────────────────────── Test Helpers ──────────────────────────

function createMockEvents() {
  const emittedEvents: Array<{ type: string; payload: unknown }> = [];
  return {
    emit: vi.fn((type: string, payload: unknown) => {
      emittedEvents.push({ type, payload });
    }),
    subscribe: vi.fn(() => {
      const unsub = () => {};
      (unsub as any).unsubscribe = unsub;
      return unsub;
    }),
    on: vi.fn(() => ({
      unsubscribe: () => {},
    })),
    _emittedEvents: emittedEvents,
  };
}

function createMockFeatureLoader() {
  const updates: Array<{ projectPath: string; featureId: string; data: Record<string, unknown> }> =
    [];
  return {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    findByTitle: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(null),
    update: vi
      .fn()
      .mockImplementation(
        async (projectPath: string, featureId: string, data: Record<string, unknown>) => {
          updates.push({ projectPath, featureId, data });
        }
      ),
    delete: vi.fn().mockResolvedValue(false),
    claim: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(undefined),
    setEventEmitter: vi.fn(),
    setIntegrityWatchdog: vi.fn(),
    _updates: updates,
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

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'test-feature-1',
    title: 'Integration Test Feature',
    description: 'A feature for pipeline integration testing',
    status: 'backlog',
    category: 'feature',
    ...overrides,
  };
}

/**
 * Creates a mock processor that transitions to the specified next state.
 * Optionally runs a side-effect function for simulating real processor behavior.
 */
function createTransitionProcessor(
  nextState: FeatureProcessingState | null,
  shouldContinue = true,
  sideEffect?: (ctx: StateContext) => void | Promise<void>
): StateProcessor {
  return {
    enter: vi.fn().mockResolvedValue(undefined),
    process: vi.fn().mockImplementation(async (ctx: StateContext) => {
      if (sideEffect) await sideEffect(ctx);
      return {
        nextState,
        shouldContinue,
        reason: nextState ? `Transition to ${nextState}` : 'Terminal state reached',
      } as StateTransitionResult;
    }),
    exit: vi.fn().mockResolvedValue(undefined),
  };
}

// ────────────────────────── Tests ──────────────────────────

describe('Lead Engineer Pipeline (integration)', () => {
  let events: ReturnType<typeof createMockEvents>;
  let featureLoader: ReturnType<typeof createMockFeatureLoader>;
  let autoModeService: ReturnType<typeof createMockAutoModeService>;
  let serviceContext: ProcessorServiceContext;

  beforeEach(() => {
    events = createMockEvents();
    featureLoader = createMockFeatureLoader();
    autoModeService = createMockAutoModeService();

    serviceContext = {
      events: events as any,
      featureLoader: featureLoader as any,
      autoModeService: autoModeService as any,
    };
  });

  // ──── Happy Path ────────────────────────────────────────────────

  describe('happy path: INTAKE -> PLAN -> EXECUTE -> REVIEW -> MERGE -> DEPLOY -> DONE', () => {
    it('transitions through all 7 states and ends with finalState=DONE', async () => {
      const feature = makeFeature({ complexity: 'large' });
      const stateMachine = new FeatureStateMachine(serviceContext, {
        goalGatesEnabled: false,
        events: events as any,
      });

      // Wire up processors that simulate the happy path
      stateMachine.registerProcessor('INTAKE', createTransitionProcessor('PLAN'));
      stateMachine.registerProcessor('PLAN', createTransitionProcessor('EXECUTE'));
      stateMachine.registerProcessor(
        'EXECUTE',
        createTransitionProcessor('REVIEW', true, (ctx) => {
          ctx.prNumber = 42;
        })
      );
      stateMachine.registerProcessor('REVIEW', createTransitionProcessor('MERGE'));
      stateMachine.registerProcessor('MERGE', createTransitionProcessor('DEPLOY'));
      stateMachine.registerProcessor(
        'DEPLOY',
        createTransitionProcessor('DONE', false, async (ctx) => {
          // Simulate DeployProcessor marking feature as done
          await featureLoader.update(ctx.projectPath, ctx.feature.id, { status: 'done' });
        })
      );

      const { finalState, context } = await stateMachine.processFeature(feature, '/test/project');

      expect(finalState).toBe('DONE');
      expect(context.retryCount).toBe(0);

      // Verify feature was marked done during DEPLOY
      const doneUpdate = featureLoader._updates.find((u) => u.data.status === 'done');
      expect(doneUpdate).toBeDefined();
      expect(doneUpdate!.featureId).toBe('test-feature-1');
    });

    it('emits pipeline:state-entered for every state in the happy path', async () => {
      const feature = makeFeature();
      const stateMachine = new FeatureStateMachine(serviceContext, {
        goalGatesEnabled: false,
        events: events as any,
      });

      stateMachine.registerProcessor('INTAKE', createTransitionProcessor('PLAN'));
      stateMachine.registerProcessor('PLAN', createTransitionProcessor('EXECUTE'));
      stateMachine.registerProcessor('EXECUTE', createTransitionProcessor('REVIEW'));
      stateMachine.registerProcessor('REVIEW', createTransitionProcessor('MERGE'));
      stateMachine.registerProcessor('MERGE', createTransitionProcessor('DEPLOY'));
      stateMachine.registerProcessor('DEPLOY', createTransitionProcessor('DONE', false));

      await stateMachine.processFeature(feature, '/test/project');

      const stateEnteredEvents = events._emittedEvents
        .filter((e) => e.type === 'pipeline:state-entered')
        .map((e) => (e.payload as Record<string, unknown>).state);

      expect(stateEnteredEvents).toEqual([
        'INTAKE',
        'PLAN',
        'EXECUTE',
        'REVIEW',
        'MERGE',
        'DEPLOY',
      ]);
    });

    it('skips PLAN for simple features: INTAKE -> EXECUTE -> ... -> DONE', async () => {
      const feature = makeFeature({ complexity: 'small' });
      const stateMachine = new FeatureStateMachine(serviceContext, {
        goalGatesEnabled: false,
        events: events as any,
      });

      stateMachine.registerProcessor('INTAKE', createTransitionProcessor('EXECUTE'));
      stateMachine.registerProcessor('EXECUTE', createTransitionProcessor('REVIEW'));
      stateMachine.registerProcessor('REVIEW', createTransitionProcessor('MERGE'));
      stateMachine.registerProcessor('MERGE', createTransitionProcessor('DEPLOY'));
      stateMachine.registerProcessor('DEPLOY', createTransitionProcessor('DONE', false));

      const { finalState } = await stateMachine.processFeature(feature, '/test/project');

      expect(finalState).toBe('DONE');

      const stateEnteredEvents = events._emittedEvents
        .filter((e) => e.type === 'pipeline:state-entered')
        .map((e) => (e.payload as Record<string, unknown>).state);

      // PLAN should not appear
      expect(stateEnteredEvents).not.toContain('PLAN');
      expect(stateEnteredEvents).toContain('INTAKE');
      expect(stateEnteredEvents).toContain('EXECUTE');
    });
  });

  // ──── INTAKE ESCALATE: Unmet Dependencies ────────────────────────

  describe('INTAKE ESCALATE: unmet dependencies', () => {
    it('escalates to blocked with statusChangeReason set and failureCount incremented', async () => {
      const feature = makeFeature({
        failureCount: 0,
        dependencies: ['dep-feature-1', 'dep-feature-2'],
      });

      const stateMachine = new FeatureStateMachine(serviceContext, {
        goalGatesEnabled: false,
        events: events as any,
      });

      // INTAKE signals ESCALATE due to unmet dependencies
      stateMachine.registerProcessor('INTAKE', {
        enter: vi.fn().mockResolvedValue(undefined),
        process: vi.fn().mockImplementation(async (ctx: StateContext) => {
          ctx.escalationReason = 'Unmet dependencies: dep-feature-1, dep-feature-2';
          return {
            nextState: 'ESCALATE' as FeatureProcessingState,
            shouldContinue: true,
            reason: 'Unmet dependencies: dep-feature-1, dep-feature-2',
          };
        }),
        exit: vi.fn().mockResolvedValue(undefined),
      });

      // Use real EscalateProcessor so it writes statusChangeReason + failureCount
      // (already registered by default in FeatureStateMachine constructor)

      const { finalState, context } = await stateMachine.processFeature(feature, '/test/project');

      expect(finalState).toBe('ESCALATE');

      // Verify featureLoader.update was called with escalation data
      const escalationUpdate = featureLoader._updates.find((u) => u.data.status === 'blocked');
      expect(escalationUpdate).toBeDefined();
      expect(escalationUpdate!.data.statusChangeReason).toBe(
        'Unmet dependencies: dep-feature-1, dep-feature-2'
      );
      expect(escalationUpdate!.data.failureCount).toBe(1);

      // Verify escalation signal was emitted
      const escalationEvent = events._emittedEvents.find(
        (e) => e.type === 'escalation:signal-received'
      );
      expect(escalationEvent).toBeDefined();
      const escalationPayload = escalationEvent!.payload as Record<string, unknown>;
      expect(escalationPayload.type).toBe('feature_escalated');

      const escalationContext = escalationPayload.context as Record<string, unknown>;
      expect(escalationContext.reason).toBe('Unmet dependencies: dep-feature-1, dep-feature-2');
      expect(escalationContext.featureId).toBe('test-feature-1');
    });

    it('increments existing failureCount (does not reset to 1)', async () => {
      const feature = makeFeature({ failureCount: 2 });

      const stateMachine = new FeatureStateMachine(serviceContext, {
        goalGatesEnabled: false,
      });

      stateMachine.registerProcessor('INTAKE', {
        enter: vi.fn().mockResolvedValue(undefined),
        process: vi.fn().mockImplementation(async (ctx: StateContext) => {
          ctx.escalationReason = 'Unmet dependencies: dep-1';
          return {
            nextState: 'ESCALATE' as FeatureProcessingState,
            shouldContinue: true,
            reason: 'Unmet deps',
          };
        }),
        exit: vi.fn().mockResolvedValue(undefined),
      });

      await stateMachine.processFeature(feature, '/test/project');

      const escalationUpdate = featureLoader._updates.find((u) => u.data.status === 'blocked');
      expect(escalationUpdate).toBeDefined();
      // failureCount was 2, EscalateProcessor adds 1
      expect(escalationUpdate!.data.failureCount).toBe(3);
    });
  });

  // ──── EXECUTE ESCALATE: Agent Failure ────────────────────────────

  describe('EXECUTE ESCALATE: agent failure after max retries', () => {
    it('escalates to blocked after agent retries are exhausted', async () => {
      const feature = makeFeature({ failureCount: 0 });

      const stateMachine = new FeatureStateMachine(serviceContext, {
        goalGatesEnabled: false,
        events: events as any,
      });

      // INTAKE passes through to EXECUTE
      stateMachine.registerProcessor('INTAKE', createTransitionProcessor('EXECUTE'));

      // EXECUTE simulates agent failure after max retries
      stateMachine.registerProcessor('EXECUTE', {
        enter: vi.fn().mockResolvedValue(undefined),
        process: vi.fn().mockImplementation(async (ctx: StateContext) => {
          ctx.retryCount = 3;
          ctx.escalationReason = 'Max agent retries exceeded (3)';
          return {
            nextState: 'ESCALATE' as FeatureProcessingState,
            shouldContinue: true,
            reason: 'Max agent retries exceeded (3)',
          };
        }),
        exit: vi.fn().mockResolvedValue(undefined),
      });

      // Real EscalateProcessor handles the escalation

      const { finalState, context } = await stateMachine.processFeature(feature, '/test/project');

      expect(finalState).toBe('ESCALATE');
      expect(context.retryCount).toBe(3);

      // Verify status is blocked with proper reason
      const escalationUpdate = featureLoader._updates.find((u) => u.data.status === 'blocked');
      expect(escalationUpdate).toBeDefined();
      expect(escalationUpdate!.data.statusChangeReason).toBe('Max agent retries exceeded (3)');
      expect(escalationUpdate!.data.failureCount).toBe(1);

      // Verify failure classification was included
      expect(escalationUpdate!.data.failureClassification).toBeDefined();
      const classification = escalationUpdate!.data.failureClassification as Record<
        string,
        unknown
      >;
      expect(classification.timestamp).toBeDefined();
    });

    it('escalation from EXECUTE emits pipeline:phase-skipped with EXECUTE origin', async () => {
      const feature = makeFeature();

      const stateMachine = new FeatureStateMachine(serviceContext, {
        goalGatesEnabled: false,
        events: events as any,
      });

      stateMachine.registerProcessor('INTAKE', createTransitionProcessor('EXECUTE'));
      stateMachine.registerProcessor('EXECUTE', {
        enter: vi.fn().mockResolvedValue(undefined),
        process: vi.fn().mockImplementation(async (ctx: StateContext) => {
          ctx.retryCount = 3;
          ctx.escalationReason = 'Agent process crashed';
          return {
            nextState: 'ESCALATE' as FeatureProcessingState,
            shouldContinue: true,
            reason: 'Agent process crashed',
          };
        }),
        exit: vi.fn().mockResolvedValue(undefined),
      });

      await stateMachine.processFeature(feature, '/test/project');

      // EscalateProcessor.exit() emits pipeline:phase-skipped
      const phaseSkipped = events._emittedEvents.find((e) => e.type === 'pipeline:phase-skipped');
      expect(phaseSkipped).toBeDefined();
      const skippedPayload = phaseSkipped!.payload as Record<string, unknown>;
      expect(skippedPayload.featureId).toBe('test-feature-1');
      expect(skippedPayload.phase).toBe('EXECUTE');
    });

    it('pipeline:state-entered events show INTAKE -> EXECUTE -> ESCALATE path', async () => {
      const feature = makeFeature();

      const stateMachine = new FeatureStateMachine(serviceContext, {
        goalGatesEnabled: false,
        events: events as any,
      });

      stateMachine.registerProcessor('INTAKE', createTransitionProcessor('EXECUTE'));
      stateMachine.registerProcessor('EXECUTE', {
        enter: vi.fn().mockResolvedValue(undefined),
        process: vi.fn().mockImplementation(async (ctx: StateContext) => {
          ctx.escalationReason = 'Agent failure';
          return {
            nextState: 'ESCALATE' as FeatureProcessingState,
            shouldContinue: true,
            reason: 'Agent failure',
          };
        }),
        exit: vi.fn().mockResolvedValue(undefined),
      });

      await stateMachine.processFeature(feature, '/test/project');

      const stateEnteredEvents = events._emittedEvents
        .filter((e) => e.type === 'pipeline:state-entered')
        .map((e) => (e.payload as Record<string, unknown>).state);

      expect(stateEnteredEvents).toEqual(['INTAKE', 'EXECUTE', 'ESCALATE']);
    });
  });
});
