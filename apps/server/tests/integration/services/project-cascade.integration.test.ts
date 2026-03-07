/**
 * Project Cascade Integration Test (TDD)
 *
 * Verifies that features created by orchestrateProjectFeatures carry the correct
 * milestoneSlug so the full cascade fires automatically:
 *
 *   feature:done → (epic:done →) milestone:completed → project:completed
 *
 * Scenario:
 *   - 1 project with 2 milestones, each with 2 phase features
 *   - orchestrateProjectFeatures is used to scaffold the features (no manual writes)
 *   - All features are marked done via feature:status-changed events
 *   - milestone:completed fires once per milestone
 *   - project:completed fires once when both milestones are done
 *
 * TDD notes:
 *   This test initially FAILS because orchestrateProjectFeatures does not set
 *   milestoneSlug on created features, so CompletionDetectorService never calls
 *   checkMilestoneCompletion (the guard `if (feature.milestoneSlug)` in onFeatureDone
 *   blocks it). The fix is to pass milestoneSlug in the featureLoader.create() call.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { CompletionDetectorService } from '@/services/completion-detector-service.js';
import { FeatureLoader } from '@/services/feature-loader.js';
import { ProjectService } from '@/services/project-service.js';
import { orchestrateProjectFeatures } from '@/services/project-orchestration-service.js';
import { createEventEmitter } from '@/lib/events.js';
import type { Project } from '@protolabsai/types';

// ─── Test helpers ────────────────────────────────────────────────────────────

/**
 * Wait for the next emission of an event type that passes an optional filter.
 * Timeout prevents tests from hanging on missed events.
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
 * Yield to async handlers to allow fire-and-forget I/O to complete before
 * triggering the next status change. Prevents two concurrent handlers from
 * both seeing "all done" when only one should.
 */
function yieldToHandlers(ms = 200): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Build a minimal Project object for use with orchestrateProjectFeatures.
 * No epics — createEpics=false keeps the scaffold lean so the test focuses
 * on the milestoneSlug cascade path.
 */
function buildTestProject(): Project {
  return {
    slug: 'cascade-test',
    title: 'Cascade Test Project',
    goal: 'Verify milestoneSlug cascade through orchestrateProjectFeatures',
    status: 'active',
    ongoing: false,
    milestones: [
      {
        number: 1,
        slug: 'ms1',
        title: 'Milestone One',
        description: 'First milestone',
        status: 'active',
        phases: [
          {
            number: 1,
            name: 'phase-1',
            title: 'MS1 Phase 1',
            description: 'First phase of milestone one',
          },
          {
            number: 2,
            name: 'phase-2',
            title: 'MS1 Phase 2',
            description: 'Second phase of milestone one',
          },
        ],
      },
      {
        number: 2,
        slug: 'ms2',
        title: 'Milestone Two',
        description: 'Second milestone',
        status: 'active',
        phases: [
          {
            number: 1,
            name: 'phase-1',
            title: 'MS2 Phase 1',
            description: 'First phase of milestone two',
          },
          {
            number: 2,
            name: 'phase-2',
            title: 'MS2 Phase 2',
            description: 'Second phase of milestone two',
          },
        ],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as Project;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('project-cascade (integration)', () => {
  let projectPath: string;
  let featureLoader: FeatureLoader;
  let projectService: ProjectService;
  let emitter: ReturnType<typeof createEventEmitter>;
  let detector: CompletionDetectorService;

  beforeEach(async () => {
    // Isolated temp dir per test
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'project-cascade-'));

    // Real services, no mocks
    featureLoader = new FeatureLoader();
    projectService = new ProjectService(featureLoader);
    emitter = createEventEmitter();
    detector = new CompletionDetectorService();
    detector.initialize(emitter, featureLoader, projectService);

    // Create the project directory so orchestrateProjectFeatures can write project.json
    const projectDir = path.join(projectPath, '.automaker', 'projects', 'cascade-test');
    await fs.mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    detector.destroy();
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  /**
   * Mark a feature as done: update its on-disk status then fire the board event.
   * CompletionDetectorService reads from disk, so the file must be updated first.
   */
  async function markFeatureDone(featureId: string): Promise<void> {
    // Read the current feature.json, flip status to done, write back
    const featureDir = path.join(projectPath, '.automaker', 'features', featureId);
    const featurePath = path.join(featureDir, 'feature.json');
    const raw = await fs.readFile(featurePath, 'utf-8');
    const feature = JSON.parse(raw) as Record<string, unknown>;
    feature.status = 'done';
    await fs.writeFile(featurePath, JSON.stringify(feature, null, 2), 'utf-8');

    emitter.emit('feature:status-changed', {
      projectPath,
      featureId,
      previousStatus: 'backlog',
      newStatus: 'done',
    });
  }

  it('cascades feature:done → milestone:completed × 2 → project:completed via orchestrateProjectFeatures', async () => {
    const project = buildTestProject();

    // Scaffold all features via the production code path (no epics to keep test focused)
    const scaffoldResult = await orchestrateProjectFeatures(
      project,
      {
        projectPath,
        projectSlug: 'cascade-test',
        createEpics: false,
        setupDependencies: false,
        initialStatus: 'backlog',
      },
      featureLoader,
      emitter
    );

    expect(scaffoldResult.errors).toHaveLength(0);
    expect(scaffoldResult.featuresCreated).toBe(4); // 2 milestones × 2 phases

    // Collect all feature IDs from the phaseFeatureMap
    const featureIds = Object.values(scaffoldResult.phaseFeatureMap);
    expect(featureIds).toHaveLength(4);

    // Verify each created feature has milestoneSlug set (the fix being tested)
    for (const featureId of featureIds) {
      const feature = await featureLoader.get(projectPath, featureId);
      expect(feature).not.toBeNull();
      expect(feature!.milestoneSlug).toBeTruthy();
    }

    // ── Mark MS1 features done ────────────────────────────────────────────

    const ms1DonePromise = waitForEvent(
      emitter,
      'milestone:completed',
      (p) => (p as Record<string, unknown>).milestoneTitle === 'Milestone One'
    );

    const ms1P1Id = scaffoldResult.phaseFeatureMap['ms1:phase-1'];
    const ms1P2Id = scaffoldResult.phaseFeatureMap['ms1:phase-2'];

    expect(ms1P1Id).toBeTruthy();
    expect(ms1P2Id).toBeTruthy();

    await markFeatureDone(ms1P1Id);
    await yieldToHandlers(); // let first handler settle before next status change
    await markFeatureDone(ms1P2Id);

    const ms1Payload = (await ms1DonePromise) as Record<string, unknown>;
    expect(ms1Payload).toMatchObject({
      projectSlug: 'cascade-test',
      milestoneSlug: 'ms1',
      milestoneTitle: 'Milestone One',
      milestoneNumber: 1,
    });

    // ── Mark MS2 features done ────────────────────────────────────────────

    const ms2DonePromise = waitForEvent(
      emitter,
      'milestone:completed',
      (p) => (p as Record<string, unknown>).milestoneTitle === 'Milestone Two'
    );
    const projectDonePromise = waitForEvent(emitter, 'project:completed');

    const ms2P1Id = scaffoldResult.phaseFeatureMap['ms2:phase-1'];
    const ms2P2Id = scaffoldResult.phaseFeatureMap['ms2:phase-2'];

    expect(ms2P1Id).toBeTruthy();
    expect(ms2P2Id).toBeTruthy();

    await markFeatureDone(ms2P1Id);
    await yieldToHandlers();
    await markFeatureDone(ms2P2Id);

    const ms2Payload = (await ms2DonePromise) as Record<string, unknown>;
    expect(ms2Payload).toMatchObject({
      projectSlug: 'cascade-test',
      milestoneSlug: 'ms2',
      milestoneTitle: 'Milestone Two',
      milestoneNumber: 2,
    });

    const projectPayload = (await projectDonePromise) as Record<string, unknown>;
    expect(projectPayload).toMatchObject({
      projectSlug: 'cascade-test',
      totalMilestones: 2,
    });

    // ── Verify detector counts ────────────────────────────────────────────

    const status = detector.getStatus();
    expect(status.completionCounts.milestones).toBe(2);
    expect(status.completionCounts.projects).toBe(1);
    expect(status.emittedMilestones).toBe(2);
    expect(status.emittedProjects).toBe(1);
  }, 15000);

  it('does not emit milestone:completed when only one of two MS1 features is done', async () => {
    const project = buildTestProject();

    const scaffoldResult = await orchestrateProjectFeatures(
      project,
      {
        projectPath,
        projectSlug: 'cascade-test',
        createEpics: false,
        setupDependencies: false,
        initialStatus: 'backlog',
      },
      featureLoader,
      emitter
    );

    const events: unknown[] = [];
    emitter.on('milestone:completed', (p) => events.push(p));

    const ms1P1Id = scaffoldResult.phaseFeatureMap['ms1:phase-1'];
    await markFeatureDone(ms1P1Id);
    await yieldToHandlers();

    expect(events).toHaveLength(0);
  });
});
