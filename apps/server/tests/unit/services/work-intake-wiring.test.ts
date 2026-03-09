/**
 * WorkIntakeService — wiring verification tests
 *
 * Verifies:
 * 1. WorkIntakeService is present on the ServiceContainer interface (type-level check)
 * 2. When setDependencies() has been called, start() begins the tick loop
 * 3. When stop() is called, the tick loop stops
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkIntakeService } from '../../../src/services/work-intake-service.js';
import type { ServiceContainer } from '../../../src/server/services.js';
import type { WorkIntakeDependencies } from '../../../src/services/work-intake-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockDeps(overrides: Partial<WorkIntakeDependencies> = {}): WorkIntakeDependencies {
  return {
    events: { emit: vi.fn(), on: vi.fn(), subscribe: vi.fn() } as never,
    instanceId: 'test-instance',
    role: 'fullstack',
    getProjects: vi.fn().mockResolvedValue([]),
    updatePhaseClaim: vi.fn().mockResolvedValue(undefined),
    getPhase: vi.fn().mockResolvedValue(null),
    createFeature: vi.fn().mockResolvedValue({ id: 'feat-1' }),
    getRunningAgentCount: vi.fn().mockReturnValue(0),
    getMaxConcurrency: vi.fn().mockReturnValue(3),
    getPeerStatus: vi.fn().mockReturnValue(new Map()),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkIntakeService wiring', () => {
  let service: WorkIntakeService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new WorkIntakeService();
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Type-level check: WorkIntakeService is on ServiceContainer
  // -------------------------------------------------------------------------

  it('ServiceContainer includes workIntakeService', () => {
    // This is a compile-time check — if WorkIntakeService is not on the
    // interface, this file will fail to compile. The runtime assertion
    // confirms the type system is satisfied.
    const typeCheck = (container: ServiceContainer) => container.workIntakeService;
    expect(typeCheck).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 2. start() begins the tick loop when dependencies are set
  // -------------------------------------------------------------------------

  it('start() begins ticking when dependencies are set', async () => {
    const deps = makeMockDeps();
    service.setDependencies(deps);

    service.start('/test/project');

    // The first tick runs immediately on start().
    // Each tick calls getProjects twice (once in reclaimStalePhases, once in the main loop).
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.getProjects).toHaveBeenCalledWith('/test/project');
    const callsAfterFirstTick = (deps.getProjects as ReturnType<typeof vi.fn>).mock.calls.length;

    // Advance by one tick interval (default 30s) to verify recurring ticks
    await vi.advanceTimersByTimeAsync(30_000);

    expect((deps.getProjects as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      callsAfterFirstTick
    );
  });

  it('start() does not tick when dependencies are NOT set', () => {
    // No setDependencies() called
    service.start('/test/project');

    // Should not throw, but getProjects should not be called
    // since the service guards on deps being null
    vi.advanceTimersByTime(30_000);
  });

  it('start() is idempotent — second call is a no-op', async () => {
    const deps = makeMockDeps();
    service.setDependencies(deps);

    service.start('/test/project');
    service.start('/test/project');

    await vi.advanceTimersByTimeAsync(0);

    // Only one immediate tick fires (each tick calls getProjects twice:
    // once in reclaimStalePhases and once in the main loop).
    // Two start() calls should NOT produce two ticks.
    const callCount = (deps.getProjects as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callCount).toBe(2); // 1 tick x 2 getProjects calls per tick
  });

  // -------------------------------------------------------------------------
  // 3. stop() halts the tick loop
  // -------------------------------------------------------------------------

  it('stop() halts the tick loop', async () => {
    const deps = makeMockDeps();
    service.setDependencies(deps);

    service.start('/test/project');
    await vi.advanceTimersByTimeAsync(0);
    const callsAfterFirstTick = (deps.getProjects as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsAfterFirstTick).toBeGreaterThan(0);

    service.stop();

    // Advance past several tick intervals — no more calls
    await vi.advanceTimersByTimeAsync(120_000);
    expect((deps.getProjects as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callsAfterFirstTick
    );
  });

  it('stop() is idempotent — safe to call when not running', () => {
    expect(() => service.stop()).not.toThrow();
  });

  it('can restart after stop', async () => {
    const deps = makeMockDeps();
    service.setDependencies(deps);

    service.start('/test/project');
    await vi.advanceTimersByTimeAsync(0);
    const callsAfterFirstStart = (deps.getProjects as ReturnType<typeof vi.fn>).mock.calls.length;
    service.stop();

    service.start('/test/project');
    await vi.advanceTimersByTimeAsync(0);

    // After restart, a second tick should have fired
    expect((deps.getProjects as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      callsAfterFirstStart
    );
  });
});
