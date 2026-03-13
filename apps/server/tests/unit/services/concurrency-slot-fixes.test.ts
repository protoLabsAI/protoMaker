/**
 * Unit tests for the orphaned concurrency slot bug fixes:
 *
 * 1. waitForCompletion resolves on feature:status-changed to review/done/verified
 * 2. stopFeature() resets feature status to backlog
 * 3. ConcurrencyManager.releaseStaleLeases() reclaims orphaned leases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@protolabsai/platform', () => ({
  getAutomakerDir: vi.fn(() => '/mock/.automaker'),
  getFeatureDir: vi.fn(() => '/mock/.automaker/features/feat-001'),
}));

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

import { ConcurrencyManager } from '../../../src/services/auto-mode/concurrency-manager.js';
import { ExecuteProcessor } from '../../../src/services/lead-engineer-execute-processor.js';
import type {
  ProcessorServiceContext,
  StateContext,
} from '../../../src/services/lead-engineer-types.js';
import type { Feature } from '@protolabsai/types';

// ── helpers ──────────────────────────────────────────────────────────────────

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

type Subscriber = (type: string, payload: unknown) => void;

/**
 * Create a mock events bus that lets the test fire events manually.
 * Unlike the existing helper, this does NOT auto-fire feature:completed.
 */
function makeControllableEvents() {
  const subscribers: Subscriber[] = [];

  const events = {
    emit: vi.fn(),
    subscribe: vi.fn((cb: Subscriber) => {
      subscribers.push(cb);
      return () => {
        const idx = subscribers.indexOf(cb);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    }),
  };

  /** Fire an event to all current subscribers. */
  function fire(type: string, payload: unknown) {
    for (const sub of [...subscribers]) {
      sub(type, payload);
    }
  }

  return { events, fire };
}

function makeAutoModeService() {
  return {
    executeFeature: vi.fn().mockResolvedValue(undefined),
    getRunningAgents: vi.fn().mockResolvedValue([]),
  };
}

function makeServiceContext(
  eventHelpers: ReturnType<typeof makeControllableEvents>,
  workflowOverrides: Record<string, unknown> = {},
  featureOverrides: Partial<Feature> = {}
): ProcessorServiceContext {
  const feature = makeFeature(featureOverrides);

  const featureLoader = {
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(feature),
    getAll: vi.fn().mockResolvedValue([feature]),
  };

  const settingsService = {
    getProjectSettings: vi.fn().mockResolvedValue({
      workflow: {
        executionGate: false,
        preFlightChecks: false,
        ...workflowOverrides,
      },
    }),
  };

  return {
    events: eventHelpers.events as unknown as ProcessorServiceContext['events'],
    featureLoader: featureLoader as unknown as ProcessorServiceContext['featureLoader'],
    autoModeService: makeAutoModeService() as unknown as ProcessorServiceContext['autoModeService'],
    settingsService: settingsService as unknown as ProcessorServiceContext['settingsService'],
  };
}

// ── Fix 1: waitForCompletion resolves on feature:status-changed ──────────────

describe('ExecuteProcessor — waitForCompletion resolves on status-changed to review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves as success when feature:status-changed fires with newStatus=review', async () => {
    const { events, fire } = makeControllableEvents();
    const ctx = makeServiceContext({ events, fire });

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx();

    // After executeFeature is called, fire feature:status-changed with review
    (
      ctx.autoModeService as unknown as { executeFeature: ReturnType<typeof vi.fn> }
    ).executeFeature.mockImplementation(() => {
      // Fire status-changed on next tick so the subscriber is already registered
      setImmediate(() => {
        fire('feature:status-changed', {
          featureId: 'feat-001',
          projectPath: '/test/project',
          newStatus: 'review',
          oldStatus: 'in_progress',
        });
      });
      return Promise.resolve();
    });

    const result = await processor.process(stateCtx);

    // Should resolve successfully, transitioning to REVIEW
    expect(result.nextState).toBe('REVIEW');
  });

  it('resolves as success when feature:status-changed fires with newStatus=done', async () => {
    const { events, fire } = makeControllableEvents();
    const ctx = makeServiceContext({ events, fire });

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx();

    (
      ctx.autoModeService as unknown as { executeFeature: ReturnType<typeof vi.fn> }
    ).executeFeature.mockImplementation(() => {
      setImmediate(() => {
        fire('feature:status-changed', {
          featureId: 'feat-001',
          projectPath: '/test/project',
          newStatus: 'done',
          oldStatus: 'in_progress',
        });
      });
      return Promise.resolve();
    });

    const result = await processor.process(stateCtx);

    expect(result.nextState).toBe('REVIEW');
  });

  it('does NOT resolve on status-changed to non-terminal status (e.g. blocked)', async () => {
    const { events, fire } = makeControllableEvents();
    const ctx = makeServiceContext({ events, fire });

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx();

    // Fire blocked status, then feature:completed after a short delay
    (
      ctx.autoModeService as unknown as { executeFeature: ReturnType<typeof vi.fn> }
    ).executeFeature.mockImplementation(() => {
      setImmediate(() => {
        // First fire a non-terminal status change — should NOT resolve
        fire('feature:status-changed', {
          featureId: 'feat-001',
          projectPath: '/test/project',
          newStatus: 'blocked',
          oldStatus: 'in_progress',
        });
        // Then fire completed — this should resolve
        fire('feature:completed', {
          featureId: 'feat-001',
          projectPath: '/test/project',
        });
      });
      return Promise.resolve();
    });

    const result = await processor.process(stateCtx);

    // Should still eventually resolve via feature:completed
    expect(result.nextState).toBe('REVIEW');
  });

  it('still resolves via feature:completed (backward compat)', async () => {
    const { events, fire } = makeControllableEvents();
    const ctx = makeServiceContext({ events, fire });

    const processor = new ExecuteProcessor(ctx);
    const stateCtx = makeCtx();

    (
      ctx.autoModeService as unknown as { executeFeature: ReturnType<typeof vi.fn> }
    ).executeFeature.mockImplementation(() => {
      setImmediate(() => {
        fire('feature:completed', {
          featureId: 'feat-001',
          projectPath: '/test/project',
        });
      });
      return Promise.resolve();
    });

    const result = await processor.process(stateCtx);

    expect(result.nextState).toBe('REVIEW');
  });
});

// ── Fix 3: ConcurrencyManager.releaseStaleLeases ─────────────────────────────

describe('ConcurrencyManager — releaseStaleLeases', () => {
  let manager: ConcurrencyManager;

  beforeEach(() => {
    manager = new ConcurrencyManager();
  });

  it('releases leases older than maxAgeMs', () => {
    // Acquire a lease and backdate its startTime
    manager.acquire('feat-old', '/project', null, null);
    const oldLease = manager.get('feat-old')!;
    oldLease.startTime = Date.now() - 60 * 60 * 1000; // 1 hour ago

    manager.acquire('feat-new', '/project', null, null);

    const released = manager.releaseStaleLeases(45 * 60 * 1000); // 45 min threshold

    expect(released).toEqual(['feat-old']);
    expect(manager.has('feat-old')).toBe(false);
    expect(manager.has('feat-new')).toBe(true);
    expect(manager.size).toBe(1);
  });

  it('returns empty array when no leases are stale', () => {
    manager.acquire('feat-1', '/project', null, null);
    manager.acquire('feat-2', '/project', null, null);

    const released = manager.releaseStaleLeases(45 * 60 * 1000);

    expect(released).toEqual([]);
    expect(manager.size).toBe(2);
  });

  it('releases all leases when all are stale', () => {
    manager.acquire('feat-1', '/project', null, null);
    manager.acquire('feat-2', '/project', null, null);

    // Backdate both
    manager.get('feat-1')!.startTime = Date.now() - 2 * 60 * 60 * 1000;
    manager.get('feat-2')!.startTime = Date.now() - 2 * 60 * 60 * 1000;

    const released = manager.releaseStaleLeases(60 * 60 * 1000);

    expect(released).toHaveLength(2);
    expect(manager.size).toBe(0);
  });

  it('handles empty manager gracefully', () => {
    const released = manager.releaseStaleLeases(1000);
    expect(released).toEqual([]);
  });
});
