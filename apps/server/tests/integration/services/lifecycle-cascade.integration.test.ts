/**
 * Lifecycle Cascade Integration Test
 *
 * Verifies the end-to-end milestone and project completion cascade using
 * real (non-mocked) CompletionDetectorService and CeremonyStateMachine.
 *
 * Scenario:
 *   - 1 project with 2 milestones
 *   - Each milestone has 2 phase features
 *   - Features are marked done one-by-one
 *   - Cascade is verified at each step via event listeners (no polling)
 *   - CeremonyStateMachine state transitions are verified at each step
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { CompletionDetectorService } from '@/services/completion-detector-service.js';
import { transition } from '@/services/ceremony-state-machine.js';
import { FeatureLoader } from '@/services/feature-loader.js';
import { ProjectService } from '@/services/project-service.js';
import { createEventEmitter } from '@/lib/events.js';
import type { CeremonyState } from '@protolabsai/types';
import type { Project } from '@protolabsai/types';

// ─── Test helpers ────────────────────────────────────────────────────────────

/**
 * Wait for the next emission of an event type that passes an optional filter.
 * Timeout prevents tests from hanging on missed events.
 *
 * NOTE: Register the listener BEFORE triggering the action that causes the event,
 * so no events are missed even with fast async execution.
 */
function waitForEvent(
  emitter: ReturnType<typeof createEventEmitter>,
  eventType: string,
  filter?: (payload: unknown) => boolean,
  timeoutMs = 5000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting ${timeoutMs}ms for event "${eventType}"`));
    }, timeoutMs);

    const unsub = emitter.on(eventType as Parameters<typeof emitter.on>[0], (payload) => {
      if (!filter || filter(payload)) {
        clearTimeout(timer);
        unsub();
        resolve(payload);
      }
    });
  });
}

/**
 * A small delay that gives fire-and-forget async handlers time to complete
 * their current round of file I/O before we write the next feature file.
 * This prevents the race condition where two concurrent handlers both see
 * "all features done" when only one should.
 */
function yieldToHandlers(ms = 200): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Build a minimal project.json structure for testing.
 */
function buildTestProject(projectPath: string): Project {
  return {
    slug: 'test-cascade',
    title: 'Test Cascade Project',
    goal: 'Verify milestone cascade end-to-end',
    status: 'active',
    ongoing: false,
    milestones: [
      {
        number: 1,
        slug: 'm1',
        title: 'Milestone 1',
        description: 'First milestone with 2 phases',
        status: 'active',
        phases: [
          {
            number: 1,
            name: 'phase-1',
            title: 'M1 Phase 1',
            description: 'First phase of milestone 1',
            featureId: 'feature-m1p1',
          },
          {
            number: 2,
            name: 'phase-2',
            title: 'M1 Phase 2',
            description: 'Second phase of milestone 1',
            featureId: 'feature-m1p2',
          },
        ],
      },
      {
        number: 2,
        slug: 'm2',
        title: 'Milestone 2',
        description: 'Second milestone with 2 phases',
        status: 'active',
        phases: [
          {
            number: 1,
            name: 'phase-1',
            title: 'M2 Phase 1',
            description: 'First phase of milestone 2',
            featureId: 'feature-m2p1',
          },
          {
            number: 2,
            name: 'phase-2',
            title: 'M2 Phase 2',
            description: 'Second phase of milestone 2',
            featureId: 'feature-m2p2',
          },
        ],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as Project;
}

/**
 * Write the minimal feature.json needed by CompletionDetectorService.
 */
async function writeFeatureFile(
  projectPath: string,
  featureId: string,
  milestoneSlug: string,
  status: string = 'backlog'
): Promise<void> {
  const featureDir = path.join(projectPath, '.automaker', 'features', featureId);
  await fs.mkdir(featureDir, { recursive: true });
  await fs.writeFile(
    path.join(featureDir, 'feature.json'),
    JSON.stringify(
      {
        id: featureId,
        title: `Feature ${featureId}`,
        description: `Phase feature for ${milestoneSlug}`,
        status,
        category: 'code',
        featureType: 'code',
        projectSlug: 'test-cascade',
        milestoneSlug,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('lifecycle-cascade (integration)', () => {
  let projectPath: string;
  let featureLoader: FeatureLoader;
  let projectService: ProjectService;
  let emitter: ReturnType<typeof createEventEmitter>;
  let detector: CompletionDetectorService;

  beforeEach(async () => {
    // Create isolated temp directory
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lifecycle-cascade-'));

    // Real service instances (no mocks)
    featureLoader = new FeatureLoader();
    projectService = new ProjectService(featureLoader);
    emitter = createEventEmitter();
    detector = new CompletionDetectorService();
    detector.initialize(emitter, featureLoader, projectService);

    // Write project.json
    const projectDir = path.join(projectPath, '.automaker', 'projects', 'test-cascade');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'project.json'),
      JSON.stringify(buildTestProject(projectPath), null, 2)
    );

    // Write feature files (all start as backlog)
    await writeFeatureFile(projectPath, 'feature-m1p1', 'm1');
    await writeFeatureFile(projectPath, 'feature-m1p2', 'm1');
    await writeFeatureFile(projectPath, 'feature-m2p1', 'm2');
    await writeFeatureFile(projectPath, 'feature-m2p2', 'm2');
  });

  afterEach(async () => {
    detector.destroy();
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  /**
   * Mark a feature as done on disk, then emit the status-changed event.
   * This mirrors what the UI/API does when a user drags a card to "done".
   */
  async function markFeatureDone(featureId: string, milestoneSlug: string): Promise<void> {
    // Update the file on disk first so that areMilestonePhasesDone sees the new status
    await writeFeatureFile(projectPath, featureId, milestoneSlug, 'done');

    // Emit the event that CompletionDetectorService subscribes to
    emitter.emit('feature:status-changed', {
      projectPath,
      featureId,
      previousStatus: 'backlog',
      newStatus: 'done',
    });
  }

  it('cascades: epic → milestone → project completion with ceremony state transitions', async () => {
    // ── Ceremony state machine (pure, not mocked) ─────────────────────────

    let ceremonyState: CeremonyState = {
      phase: 'awaiting_kickoff',
      projectPath,
      projectSlug: 'test-cascade',
      lastStandup: new Date().toISOString(),
      lastRetro: new Date().toISOString(),
      standupCadence: '0 9 * * 1',
      history: [],
    };

    // Kickoff: awaiting_kickoff → milestone_active
    ceremonyState = transition(ceremonyState, 'project:lifecycle:launched', null);
    expect(ceremonyState.phase).toBe('milestone_active');

    // ── Mark M1 features done ─────────────────────────────────────────────

    // Set up listener BEFORE triggering so we don't miss the event.
    // Filter to the specific milestone so spurious duplicate events
    // (from concurrent handlers) don't resolve this promise early.
    const m1CompletedPromise = waitForEvent(
      emitter,
      'milestone:completed',
      (p) => (p as Record<string, unknown>).milestoneTitle === 'Milestone 1'
    );

    // First M1 feature done — milestone is NOT complete yet (m1p2 still backlog).
    await markFeatureDone('feature-m1p1', 'm1');

    // Yield long enough for the m1p1 handler to read features from disk and
    // find m1p2 still as "backlog" — so it returns without emitting.
    // This prevents two concurrent handlers from both seeing M1 as complete.
    await yieldToHandlers();

    // Second M1 feature done — this should trigger milestone:completed for M1
    await markFeatureDone('feature-m1p2', 'm1');

    const m1Payload = (await m1CompletedPromise) as Record<string, unknown>;

    expect(m1Payload).toMatchObject({
      projectSlug: 'test-cascade',
      milestoneTitle: 'Milestone 1',
      milestoneNumber: 1,
    });

    // ── Ceremony: milestone_active → milestone_retro (M1 done) ───────────

    ceremonyState = transition(ceremonyState, 'milestone:completed', null);
    expect(ceremonyState.phase).toBe('milestone_retro');

    // Fire the retro ceremony — 1 milestone remaining → back to milestone_active
    ceremonyState = transition(ceremonyState, 'ceremony:fired(retro)', {
      remainingMilestones: 1,
    });
    expect(ceremonyState.phase).toBe('milestone_active');

    // ── Mark M2 features done ─────────────────────────────────────────────

    const m2CompletedPromise = waitForEvent(
      emitter,
      'milestone:completed',
      (p) => (p as Record<string, unknown>).milestoneTitle === 'Milestone 2'
    );
    const projectCompletedPromise = waitForEvent(emitter, 'project:completed');

    await markFeatureDone('feature-m2p1', 'm2');
    await yieldToHandlers();
    await markFeatureDone('feature-m2p2', 'm2');

    const m2Payload = (await m2CompletedPromise) as Record<string, unknown>;
    expect(m2Payload).toMatchObject({
      projectSlug: 'test-cascade',
      milestoneTitle: 'Milestone 2',
      milestoneNumber: 2,
    });

    // Project should complete after all milestones are done
    const projectPayload = (await projectCompletedPromise) as Record<string, unknown>;
    expect(projectPayload).toMatchObject({
      projectSlug: 'test-cascade',
      totalMilestones: 2,
    });

    // ── Ceremony: milestone_active → milestone_retro (M2 done) ───────────

    ceremonyState = transition(ceremonyState, 'milestone:completed', null);
    expect(ceremonyState.phase).toBe('milestone_retro');

    // No remaining milestones → project_retro
    ceremonyState = transition(ceremonyState, 'ceremony:fired(retro)', {
      remainingMilestones: 0,
    });
    expect(ceremonyState.phase).toBe('project_retro');

    // Fire project retro → project_complete
    ceremonyState = transition(ceremonyState, 'ceremony:fired(project_retro)', null);
    expect(ceremonyState.phase).toBe('project_complete');

    // ── Verify detector observability counts ─────────────────────────────

    const status = detector.getStatus();
    expect(status.completionCounts.milestones).toBe(2);
    expect(status.completionCounts.projects).toBe(1);
    expect(status.emittedMilestones).toBe(2);
    expect(status.emittedProjects).toBe(1);

    // ── Verify ceremony history ───────────────────────────────────────────

    expect(ceremonyState.history).toHaveLength(6);
    expect(ceremonyState.history.map((t) => `${t.from}→${t.to}`)).toEqual([
      'awaiting_kickoff→milestone_active',
      'milestone_active→milestone_retro',
      'milestone_retro→milestone_active',
      'milestone_active→milestone_retro',
      'milestone_retro→project_retro',
      'project_retro→project_complete',
    ]);
  }, 15000);

  it('does not emit milestone:completed if only one of two M1 features is done', async () => {
    const events: unknown[] = [];
    emitter.on('milestone:completed', (p) => events.push(p));

    await markFeatureDone('feature-m1p1', 'm1');

    // Give the async handler enough time to complete its checks
    await yieldToHandlers();

    expect(events).toHaveLength(0);
  });

  it('does not emit project:completed if only one milestone is done', async () => {
    const projectEvents: unknown[] = [];
    emitter.on('project:completed', (p) => projectEvents.push(p));

    // Complete M1 only
    const m1Done = waitForEvent(
      emitter,
      'milestone:completed',
      (p) => (p as Record<string, unknown>).milestoneTitle === 'Milestone 1'
    );
    await markFeatureDone('feature-m1p1', 'm1');
    await yieldToHandlers();
    await markFeatureDone('feature-m1p2', 'm1');
    await m1Done;

    // Wait to confirm project:completed is NOT fired (M2 still active)
    await yieldToHandlers();

    expect(projectEvents).toHaveLength(0);
  });
});
