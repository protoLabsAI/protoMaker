/**
 * WorkIntakeService — re-entrant tick guard regression tests
 *
 * Verifies that overlapping ticks cannot over-claim beyond maxConcurrency:
 * 1. tickInProgress guard skips interval fires while a tick is running
 * 2. Per-phase capacity re-check inside the claim loop prevents mid-tick over-claim
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkIntakeService } from '../../../src/services/work-intake-service.js';
import type { WorkIntakeDependencies } from '../../../src/services/work-intake-service.js';
import type { Project, Phase, Milestone, InstanceRole } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockDeps(overrides: Partial<WorkIntakeDependencies> = {}): WorkIntakeDependencies {
  return {
    events: { emit: vi.fn(), on: vi.fn(), subscribe: vi.fn() } as never,
    instanceId: 'test-instance',
    role: 'fullstack' as InstanceRole,
    getProjects: vi.fn().mockResolvedValue([]),
    updatePhaseClaim: vi.fn().mockResolvedValue(undefined),
    getPhase: vi.fn().mockResolvedValue({
      claimedBy: 'test-instance',
      claimedAt: new Date().toISOString(),
      executionStatus: 'claimed',
    }),
    createFeature: vi.fn().mockResolvedValue({ id: 'feat-1' }),
    getRunningAgentCount: vi.fn().mockReturnValue(0),
    getMaxConcurrency: vi.fn().mockReturnValue(3),
    ...overrides,
  };
}

function makeProject(slug: string, phases: { name: string; roles?: string[] }[]): Project {
  const milestone: Milestone = {
    slug: 'm1',
    title: 'Milestone 1',
    phases: phases.map((p) => ({
      name: p.name,
      description: '',
      roles: p.roles ?? ['fullstack'],
      executionStatus: 'unclaimed',
    })) as Phase[],
  };
  return {
    slug,
    title: slug,
    status: 'active',
    milestones: [milestone],
  } as Project;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkIntakeService — re-entrant tick guard', () => {
  let service: WorkIntakeService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new WorkIntakeService();
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  it('skips overlapping ticks when maxConcurrency=1 — createFeature called once', async () => {
    // Arrange: maxConcurrency=1, runningAgentCount=0, one claimable phase
    const project = makeProject('proj-a', [{ name: 'phase-1' }]);

    // getProjects is deferred so the first tick is still awaiting when the
    // interval fires, triggering the overlapping-tick scenario.
    let resolveGetProjects: () => void;
    const getProjectsPromise = new Promise<Project[]>((resolve) => {
      resolveGetProjects = () => resolve([project]);
    });

    const deps = makeMockDeps({
      getProjects: vi.fn().mockReturnValue(getProjectsPromise),
      getRunningAgentCount: vi.fn().mockReturnValue(0),
      getMaxConcurrency: vi.fn().mockReturnValue(1),
    });

    service.setDependencies(deps);
    service.start('/test/project');

    // Drain microtasks so the first tick begins (awaits getProjects)
    await vi.advanceTimersByTimeAsync(0);

    // The first tick is blocked on getProjects. Fire the interval to trigger
    // a second tick attempt.
    await vi.advanceTimersByTimeAsync(30_000);

    // The second tick should be skipped (tickInProgress=true).
    // getProjects should have been called exactly once (first tick).
    expect(deps.getProjects).toHaveBeenCalledTimes(1);

    // Resolve getProjects so the first tick can proceed
    resolveGetProjects!();
    await vi.advanceTimersByTimeAsync(500); // wait for claim verify delay + microtasks

    // createFeature should be called exactly once
    expect(deps.createFeature).toHaveBeenCalledTimes(1);
  });

  it('stops claiming mid-tick when capacity is exhausted', async () => {
    // Arrange: maxConcurrency=1, two claimable phases
    // getRunningAgentCount starts at 0 but returns 1 after the first claim
    let claimCount = 0;

    const project = makeProject('proj-b', [{ name: 'phase-a' }, { name: 'phase-b' }]);

    const deps = makeMockDeps({
      getProjects: vi.fn().mockResolvedValue([project]),
      getRunningAgentCount: vi.fn(() => claimCount),
      getMaxConcurrency: vi.fn().mockReturnValue(1),
      updatePhaseClaim: vi.fn().mockImplementation(async () => {
        // After the first claimAndMaterialize writes, bump the counter
        // so the per-phase re-check sees capacity exhausted
        claimCount++;
      }),
    });

    service.setDependencies(deps);
    service.start('/test/project');

    // Let the tick run
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500); // claim verify delay

    // Only phase-a should be claimed; phase-b should be skipped
    // because getRunningAgentCount(1) >= getMaxConcurrency(1)
    expect(deps.createFeature).toHaveBeenCalledTimes(1);

    // updatePhaseClaim is called for: claim (claimed) + verify mark (in_progress) = 2 calls
    // for the single phase claimed
    const updateCalls = (deps.updatePhaseClaim as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(updateCalls).toBeGreaterThanOrEqual(1);
  });

  it('tickInProgress guard prevents re-entrant tick during long tick', async () => {
    // Arrange: a long-running getProjects that takes longer than tickIntervalMs
    let resolveGetProjects: () => void;
    const getProjectsPromise = new Promise<Project[]>((resolve) => {
      resolveGetProjects = () => resolve([]);
    });

    const deps = makeMockDeps({
      getProjects: vi.fn().mockReturnValue(getProjectsPromise),
    });

    service.configure({ tickIntervalMs: 1000 });
    service.setDependencies(deps);
    service.start('/test/project');

    // First tick starts (t=0), blocked on getProjects
    await vi.advanceTimersByTimeAsync(0);

    // Interval fires at t=1000ms — tickInProgress=true, so it should skip
    await vi.advanceTimersByTimeAsync(1000);

    // Interval fires again at t=2000ms — still in progress
    await vi.advanceTimersByTimeAsync(1000);

    // First tick: getProjects called once (in reclaimStalePhases) — the tick
    // is blocked awaiting the deferred promise, so the main loop's getProjects
    // call hasn't been reached yet.
    expect(deps.getProjects).toHaveBeenCalledTimes(1);

    // Resolve and let the tick complete
    resolveGetProjects!();
    await vi.advanceTimersByTimeAsync(0);

    // The main loop's getProjects call fires now (2nd call total).
    // Both return the same resolved promise (empty array), so the tick returns early.
    expect(deps.getProjects).toHaveBeenCalledTimes(2);

    // After the tick completes, the next interval should fire normally
    // Second tick: 2 more calls (reclaimStalePhases + main loop)
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.getProjects).toHaveBeenCalledTimes(4);
  });
});
