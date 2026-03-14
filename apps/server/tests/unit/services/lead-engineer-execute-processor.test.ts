/**
 * Unit tests for ExecuteProcessor — cost cap and runtime cap kill criteria.
 *
 * Verifies that after agent execution completes, the processor checks the running
 * costUsd against maxCostUsdPerFeature and elapsed time against
 * maxRuntimeMinutesPerFeature. If either is exceeded: the feature is blocked,
 * the appropriate event is emitted, and execution stops.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock heavy filesystem / platform helpers so tests stay fast and isolated
vi.mock('@protolabsai/platform', () => ({
  getAutomakerDir: vi.fn(() => '/mock/.automaker'),
  getFeatureDir: vi.fn(() => '/mock/.automaker/features/feat-001'),
}));

vi.mock('node:child_process', () => ({
  // Default: call the callback with empty stdout so promisify(exec) resolves immediately.
  // Existing tests never call exec (gate/pre-flight disabled), so this is backward-compatible.
  exec: vi.fn(
    (
      _cmd: string,
      _opts: unknown,
      cb: (err: null, result: { stdout: string; stderr: string }) => void
    ) => {
      if (typeof cb === 'function') {
        cb(null, { stdout: '', stderr: '' });
      }
    }
  ),
}));

import { ExecuteProcessor } from '../../../src/services/lead-engineer-execute-processor.js';
import type {
  ProcessorServiceContext,
  StateContext,
} from '../../../src/services/lead-engineer-types.js';
import type { Feature } from '@protolabsai/types';

// ── helpers ────────────────────────────────────────────────────────────────────

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-001',
    title: 'Test Feature',
    description: 'A test feature',
    status: 'in_progress',
    costUsd: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    order: 0,
    ...overrides,
  };
}

/**
 * Build a StateContext with sensible defaults.
 * startedAt defaults to 10 minutes ago so the runtime cap tests have predictable values.
 */
function makeCtx(overrides: Partial<StateContext> = {}): StateContext {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  return {
    feature: makeFeature(),
    projectPath: '/test/project',
    options: {},
    retryCount: 0,
    infraRetryCount: 0,
    planRequired: false,
    remediationAttempts: 0,
    mergeRetryCount: 0,
    planRetryCount: 0,
    startedAt: tenMinutesAgo,
    ...overrides,
  };
}

/**
 * Create a mock events bus that exposes a helper to fire events synchronously.
 * The subscribe mock immediately fires 'feature:completed' so waitForCompletion resolves.
 */
function makeEvents(featureId = 'feat-001', projectPath = '/test/project') {
  type Subscriber = (type: string, payload: unknown) => void;
  const subscribers: Subscriber[] = [];

  const events = {
    emit: vi.fn(),
    subscribe: vi.fn((cb: Subscriber) => {
      subscribers.push(cb);
      // Immediately fire feature:completed so waitForCompletion resolves on the next tick.
      // We use setImmediate to allow the timeout to be registered first.
      setImmediate(() => {
        cb('feature:completed', { featureId, projectPath });
      });
      return () => {
        const idx = subscribers.indexOf(cb);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    }),
  };

  return events;
}

function makeAutoModeService() {
  return {
    executeFeature: vi.fn().mockResolvedValue(undefined),
    getRunningAgents: vi.fn().mockResolvedValue([]),
  };
}

/**
 * Build a minimal ProcessorServiceContext.
 * Pass workflowSettings overrides to control maxCostUsdPerFeature / maxRuntimeMinutesPerFeature.
 */
function makeServiceContext(
  workflowOverrides: Record<string, unknown> = {},
  featureOverrides: Partial<Feature> = {},
  eventFeatureId = 'feat-001'
): {
  ctx: ProcessorServiceContext;
  featureLoader: {
    update: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    getAll: ReturnType<typeof vi.fn>;
  };
  events: ReturnType<typeof makeEvents>;
} {
  const feature = makeFeature(featureOverrides);
  const events = makeEvents(eventFeatureId);
  const featureLoader = {
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(feature),
    getAll: vi.fn().mockResolvedValue([feature]),
  };

  const settingsService = {
    getProjectSettings: vi.fn().mockResolvedValue({
      workflow: {
        // Disable execution gate and pre-flight so they don't interfere
        executionGate: false,
        preFlightChecks: false,
        ...workflowOverrides,
      },
    }),
  };

  const ctx: ProcessorServiceContext = {
    events: events as unknown as ProcessorServiceContext['events'],
    featureLoader: featureLoader as unknown as ProcessorServiceContext['featureLoader'],
    autoModeService: makeAutoModeService() as unknown as ProcessorServiceContext['autoModeService'],
    settingsService: settingsService as unknown as ProcessorServiceContext['settingsService'],
  };

  return { ctx, featureLoader, events };
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('ExecuteProcessor — cost cap (maxCostUsdPerFeature)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('continues to REVIEW when cost is under cap', async () => {
    // Feature cost: $3. Cap: $10. Should proceed normally → REVIEW.
    const { ctx, featureLoader, events } = makeServiceContext(
      { maxCostUsdPerFeature: 10 },
      { costUsd: 3 }
    );

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx({ feature: makeFeature({ costUsd: 3 }) });
    const result = await processor.process(stateCtx);

    expect(result.nextState).toBe('REVIEW');
    expect(events.emit).not.toHaveBeenCalledWith('cost:exceeded', expect.anything());
    expect(featureLoader.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: 'blocked' })
    );
  });

  it('blocks feature and emits cost:exceeded when cost equals cap', async () => {
    // Feature cost: $5. Cap: $5. Should block → emit cost:exceeded.
    const { ctx, featureLoader, events } = makeServiceContext(
      { maxCostUsdPerFeature: 5 },
      { costUsd: 5 }
    );

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx({ feature: makeFeature({ costUsd: 5 }) });
    const result = await processor.process(stateCtx);

    expect(result.nextState).toBeNull();
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toMatch(/cost cap exceeded/i);

    expect(featureLoader.update).toHaveBeenCalledWith(
      '/test/project',
      'feat-001',
      expect.objectContaining({
        status: 'blocked',
        statusChangeReason: expect.stringMatching(/cost cap exceeded/i),
      })
    );

    expect(events.emit).toHaveBeenCalledWith(
      'cost:exceeded',
      expect.objectContaining({
        featureId: 'feat-001',
        projectPath: '/test/project',
        costUsd: 5,
        capUsd: 5,
      })
    );
  });

  it('blocks feature and emits cost:exceeded when cost exceeds cap', async () => {
    // Feature cost: $7. Cap: $5. Should block.
    // (Kept below the internal MAX_BUDGET_USD=$10 so only the new cap fires.)
    const { ctx, featureLoader, events } = makeServiceContext(
      { maxCostUsdPerFeature: 5 },
      { costUsd: 7 }
    );

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx({ feature: makeFeature({ costUsd: 7 }) });
    const result = await processor.process(stateCtx);

    expect(result.nextState).toBeNull();
    expect(result.shouldContinue).toBe(false);

    expect(events.emit).toHaveBeenCalledWith(
      'cost:exceeded',
      expect.objectContaining({ costUsd: 7, capUsd: 5 })
    );
  });

  it('no-op when maxCostUsdPerFeature is not set (cap off)', async () => {
    // No cap configured. Feature cost: $3 (below internal MAX_BUDGET_USD=$10). Should proceed to REVIEW.
    const { ctx, events } = makeServiceContext(
      {
        /* maxCostUsdPerFeature omitted */
      },
      { costUsd: 3 }
    );

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx({ feature: makeFeature({ costUsd: 3 }) });
    const result = await processor.process(stateCtx);

    expect(result.nextState).toBe('REVIEW');
    expect(events.emit).not.toHaveBeenCalledWith('cost:exceeded', expect.anything());
  });
});

describe('ExecuteProcessor — runtime cap (maxRuntimeMinutesPerFeature)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('continues to REVIEW when elapsed time is under cap', async () => {
    // startedAt: 10 min ago. Cap: 60 min. Should proceed to REVIEW.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const { ctx, events } = makeServiceContext({ maxRuntimeMinutesPerFeature: 60 });

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx({ startedAt: tenMinutesAgo });
    const result = await processor.process(stateCtx);

    expect(result.nextState).toBe('REVIEW');
    expect(events.emit).not.toHaveBeenCalledWith('runtime:exceeded', expect.anything());
  });

  it('blocks feature and emits runtime:exceeded when elapsed time exceeds cap', async () => {
    // startedAt: 90 min ago. Cap: 60 min. Should block.
    const ninetyMinutesAgo = new Date(Date.now() - 90 * 60_000).toISOString();
    const { ctx, featureLoader, events } = makeServiceContext({ maxRuntimeMinutesPerFeature: 60 });

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx({ startedAt: ninetyMinutesAgo });
    const result = await processor.process(stateCtx);

    expect(result.nextState).toBeNull();
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toMatch(/runtime cap exceeded/i);

    expect(featureLoader.update).toHaveBeenCalledWith(
      '/test/project',
      'feat-001',
      expect.objectContaining({
        status: 'blocked',
        statusChangeReason: expect.stringMatching(/runtime cap exceeded/i),
      })
    );

    expect(events.emit).toHaveBeenCalledWith(
      'runtime:exceeded',
      expect.objectContaining({
        featureId: 'feat-001',
        projectPath: '/test/project',
        capMinutes: 60,
      })
    );
  });

  it('no-op when startedAt is not set (cannot compute elapsed time)', async () => {
    // No startedAt — runtime cap check is skipped. Should proceed to REVIEW.
    const { ctx, events } = makeServiceContext({ maxRuntimeMinutesPerFeature: 60 });

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx({ startedAt: undefined });
    const result = await processor.process(stateCtx);

    expect(result.nextState).toBe('REVIEW');
    expect(events.emit).not.toHaveBeenCalledWith('runtime:exceeded', expect.anything());
  });

  it('uses default 60-minute cap when maxRuntimeMinutesPerFeature is not configured', async () => {
    // No cap in settings → default 60 min. startedAt: 90 min ago → should block.
    const ninetyMinutesAgo = new Date(Date.now() - 90 * 60_000).toISOString();
    // Omit maxRuntimeMinutesPerFeature from settings
    const { ctx, events } = makeServiceContext({
      /* no maxRuntimeMinutesPerFeature */
    });

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx({ startedAt: ninetyMinutesAgo });
    const result = await processor.process(stateCtx);

    expect(result.nextState).toBeNull();
    expect(events.emit).toHaveBeenCalledWith(
      'runtime:exceeded',
      expect.objectContaining({ capMinutes: 60 })
    );
  });
});

describe('ExecuteProcessor — pre-flight failure (Bug 2: shouldContinue:true)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns shouldContinue:true so ESCALATE state actually runs on pre-flight failure', async () => {
    // Enable pre-flight but make it fail by returning a blocked feature with unmerged
    // foundation dependencies. featureLoader.getAll returns a dep with isFoundation:true
    // and status 'in_progress' (not merged), which triggers the dep-check failure.
    const { ctx } = makeServiceContext({
      preFlightChecks: true,
      executionGate: false,
    });

    // Override getAll to return a foundation dep that is not yet merged
    const depFeature = makeFeature({
      id: 'dep-001',
      status: 'in_progress' as const,
      isFoundation: true,
    });
    (ctx.featureLoader.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeFeature(),
      depFeature,
    ]);

    const processor = new ExecuteProcessor(ctx);
    // Feature has a dep on dep-001 so the foundation dep check triggers
    const stateCtx = makeCtx({
      feature: makeFeature({ dependencies: ['dep-001'] }),
    });
    const result = await processor.process(stateCtx);

    // Must return ESCALATE with shouldContinue:true so the state machine continues
    expect(result.nextState).toBe('ESCALATE');
    expect(result.shouldContinue).toBe(true);
    expect(result.reason).toMatch(/pre-flight/i);
  });
});

describe('ExecuteProcessor — execution gate rejection tracking (Bug 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns to backlog on first gate rejection (count < 3)', async () => {
    // Gate enabled. featureLoader.getAll returns 6 features in 'review' (> default maxPendingReviews=5).
    const reviewFeatures = Array.from({ length: 6 }, (_, i) =>
      makeFeature({ id: `feat-review-${i}`, status: 'review' as const })
    );
    const { ctx, featureLoader } = makeServiceContext({
      executionGate: true,
      preFlightChecks: false,
    });
    (featureLoader.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(reviewFeatures);

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx({ gateRejectionCount: 0 });
    const result = await processor.process(stateCtx);

    expect(result.nextState).toBeNull();
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toMatch(/review queue saturated/i);
    expect(stateCtx.gateRejectionCount).toBe(1);

    expect(featureLoader.update).toHaveBeenCalledWith(
      '/test/project',
      'feat-001',
      expect.objectContaining({ status: 'backlog' })
    );
  });

  it('escalates after 3rd consecutive gate rejection', async () => {
    const reviewFeatures = Array.from({ length: 6 }, (_, i) =>
      makeFeature({ id: `feat-review-${i}`, status: 'review' as const })
    );
    const { ctx, featureLoader } = makeServiceContext({
      executionGate: true,
      preFlightChecks: false,
    });
    (featureLoader.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(reviewFeatures);

    const processor = new ExecuteProcessor(ctx);
    // Simulate 2 prior rejections already tracked on ctx
    const stateCtx = makeCtx({ gateRejectionCount: 2 });
    const result = await processor.process(stateCtx);

    expect(result.nextState).toBe('ESCALATE');
    expect(result.shouldContinue).toBe(true);
    expect(result.reason).toMatch(/3/);
    expect(stateCtx.gateRejectionCount).toBe(3);

    // Must NOT return to backlog on escalation
    expect(featureLoader.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: 'backlog' })
    );
  });

  it('increments gateRejectionCount from undefined on first rejection', async () => {
    const reviewFeatures = Array.from({ length: 6 }, (_, i) =>
      makeFeature({ id: `feat-review-${i}`, status: 'review' as const })
    );
    const { ctx } = makeServiceContext({
      executionGate: true,
      preFlightChecks: false,
    });
    (ctx.featureLoader.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(reviewFeatures);

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx(); // gateRejectionCount not set → undefined
    await processor.process(stateCtx);

    expect(stateCtx.gateRejectionCount).toBe(1);
  });
});
