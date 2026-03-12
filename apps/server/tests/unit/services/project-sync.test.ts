/**
 * Integration tests for the project sync pipeline.
 *
 * These tests verify that project state propagates correctly between instances
 * via the crdt-sync.module.ts wiring pattern: local EventBus events on instance A
 * are forwarded to instance B via persistRemoteProject(). This mirrors what
 * CrdtSyncService + crdt-sync.module do at runtime without needing real WebSockets.
 *
 * CRDT is intentionally disabled (no proto.config.yaml) so all reads/writes go to
 * disk — this keeps assertions simple and deterministic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { ProjectService } from '../../../src/services/project-service.js';
import { createEventEmitter } from '../../../src/lib/events.js';
import { normalizeProjectDocument } from '@protolabsai/crdt';
import type { FeatureLoader } from '../../../src/services/feature-loader.js';
import type { Project, Milestone, Phase } from '@protolabsai/types';

// ─── Stubs ──────────────────────────────────────────────────────────────────

/**
 * Minimal FeatureLoader stub — ProjectService only uses featureLoader in
 * getProjectStats(), which is not exercised by these tests.
 */
const stubFeatureLoader = {
  getAll: async () => [],
} as unknown as FeatureLoader;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a fresh temp directory. No proto.config.yaml → CRDT disabled, so all
 * ProjectService reads/writes are pure disk I/O with no Automerge in-memory layer.
 */
async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'project-sync-test-'));
}

function buildPhase(name: string, title: string): Phase {
  return {
    number: 1,
    name,
    title,
    description: `Implement the ${title} layer`,
    acceptanceCriteria: [`${title} is complete and tests pass`],
    executionStatus: 'unclaimed',
  };
}

function buildMilestone(slug: string, phases: Phase[]): Milestone {
  return {
    number: 1,
    slug,
    title: `Milestone: ${slug}`,
    description: 'Foundation work',
    phases,
    status: 'planned',
  };
}

/**
 * Simulate the crdt-sync.module.ts wiring for project:created / project:updated.
 * Returns an unsubscribe function.
 */
function wireSyncForward(
  eventsA: ReturnType<typeof createEventEmitter>,
  serviceB: ProjectService,
  pathB: string
): () => void {
  const unsubCreate = eventsA.on('project:created', async (payload) => {
    if (payload.project) {
      await serviceB.persistRemoteProject(pathB, payload.project as Project);
    }
  });

  const unsubUpdate = eventsA.on('project:updated', async (payload) => {
    if (payload.project) {
      await serviceB.persistRemoteProject(pathB, payload.project as Project);
    }
  });

  return () => {
    unsubCreate();
    unsubUpdate();
  };
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('Project sync pipeline', () => {
  let pathA: string;
  let pathB: string;

  beforeEach(async () => {
    pathA = await makeTempDir();
    pathB = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(pathA, { recursive: true, force: true });
    await fs.rm(pathB, { recursive: true, force: true });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Project create round-trip
  // ─────────────────────────────────────────────────────────────────────────

  it('project create round-trip: instance B receives full project with milestones and phases', async () => {
    const eventsA = createEventEmitter();
    const serviceA = new ProjectService(stubFeatureLoader, eventsA);
    const serviceB = new ProjectService(stubFeatureLoader);

    const unsub = wireSyncForward(eventsA, serviceB, pathB);

    // Create project with milestones and phases on instance A
    const created = await serviceA.createProject(pathA, {
      slug: 'crdt-roundtrip',
      title: 'CRDT Round-trip Test',
      goal: 'Verify project sync end-to-end',
      milestones: [
        {
          title: 'Foundation',
          description: 'Core types and services',
          phases: [
            {
              title: 'Types',
              description: 'Define shared TypeScript types',
              acceptanceCriteria: ['All domain types exported from @protolabsai/types'],
            },
            {
              title: 'Service',
              description: 'Implement the service layer',
              acceptanceCriteria: ['Service passes all unit tests'],
            },
          ],
        },
      ],
    });

    // Simulate the event reaching instance B (mirrors crdt-sync.module.ts)
    eventsA.emit('project:created', {
      projectSlug: created.slug,
      projectPath: pathA,
      project: created,
    });

    // Give async persistRemoteProject time to resolve
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Verify instance B now has the full project
    const projectOnB = await serviceB.getProject(pathB, 'crdt-roundtrip');
    expect(projectOnB).not.toBeNull();
    expect(projectOnB!.slug).toBe('crdt-roundtrip');
    expect(projectOnB!.title).toBe('CRDT Round-trip Test');
    expect(projectOnB!.milestones).toHaveLength(1);

    const milestoneOnB = projectOnB!.milestones[0];
    expect(milestoneOnB.title).toBe('Foundation');
    expect(milestoneOnB.phases).toHaveLength(2);
    expect(milestoneOnB.phases[0].title).toBe('Types');
    expect(milestoneOnB.phases[0].acceptanceCriteria).toEqual([
      'All domain types exported from @protolabsai/types',
    ]);
    expect(milestoneOnB.phases[1].title).toBe('Service');

    unsub();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Phase claim propagation
  // ─────────────────────────────────────────────────────────────────────────

  it('phase claim propagation: instance B reflects claim after project:updated event', async () => {
    const eventsA = createEventEmitter();
    const serviceA = new ProjectService(stubFeatureLoader, eventsA);
    const serviceB = new ProjectService(stubFeatureLoader);

    const unsub = wireSyncForward(eventsA, serviceB, pathB);

    const phase = buildPhase('types', 'Core Types');
    const milestone = buildMilestone('foundation', [phase]);

    // Bootstrap: both instances start with the same project
    const created = await serviceA.createProject(pathA, {
      slug: 'claim-test',
      title: 'Claim Propagation Test',
      goal: 'Verify phase claim sync',
    });
    await serviceB.persistRemoteProject(pathB, created);

    // Add milestones to the project so there is a claimable phase
    const withMilestones = await serviceA.saveProjectMilestones(pathA, 'claim-test', [milestone]);
    await serviceB.persistRemoteProject(pathB, withMilestones);

    // Instance A claims the phase
    await serviceA.updatePhaseClaim(pathA, 'claim-test', 'foundation', 'types', {
      claimedBy: 'instance-a',
      claimedAt: new Date().toISOString(),
      executionStatus: 'claimed',
    });

    // Read the updated project from A's disk and emit project:updated.
    // In production, this is done by the WorkIntakeService → route handler chain
    // (updatePhaseClaim writes to disk but does not auto-emit the event).
    const updatedProjectA = await serviceA.getProject(pathA, 'claim-test');
    expect(updatedProjectA).not.toBeNull();

    eventsA.emit('project:updated', {
      projectSlug: 'claim-test',
      projectPath: pathA,
      project: updatedProjectA,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    // Verify instance B now shows the phase as claimed by instance-a
    const phaseOnB = await serviceB.getPhase(pathB, 'claim-test', 'foundation', 'types');
    expect(phaseOnB).not.toBeNull();
    expect(phaseOnB!.claimedBy).toBe('instance-a');
    expect(phaseOnB!.executionStatus).toBe('claimed');

    unsub();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: Concurrent claim detection (last-writer-wins)
  // ─────────────────────────────────────────────────────────────────────────

  it('concurrent claim detection: last-writer-wins when both instances claim same phase', async () => {
    /**
     * DOCUMENTED BEHAVIOUR: When two instances claim the same phase concurrently,
     * the claim that arrives last on each instance wins. There is no consensus
     * mechanism — persistence is purely last-write-wins via persistRemoteProject().
     *
     * Scenario:
     *   1. A and B both start with an unclaimed phase.
     *   2. A claims first → A shows claimedBy:'instance-a'.
     *   3. A's event propagates to B → B also shows claimedBy:'instance-a'.
     *   4. B independently claims the same phase → B shows claimedBy:'instance-b'.
     *   5. B's event propagates to A → A is overwritten with B's claim.
     *   6. Final: both instances show claimedBy:'instance-b' (B was last writer).
     */
    const serviceA = new ProjectService(stubFeatureLoader);
    const serviceB = new ProjectService(stubFeatureLoader);

    const phase = buildPhase('server', 'Server Layer');
    const milestone = buildMilestone('phase-1', [phase]);

    // Bootstrap: both instances start with the same project + milestone
    const initial = await serviceA.createProject(pathA, {
      slug: 'concurrent-claim',
      title: 'Concurrent Claim Test',
      goal: 'Document last-writer-wins behaviour',
    });
    const withMilestones = await serviceA.saveProjectMilestones(pathA, 'concurrent-claim', [
      milestone,
    ]);
    await serviceB.persistRemoteProject(pathB, withMilestones);

    // Step 1: Instance A claims the phase
    await serviceA.updatePhaseClaim(pathA, 'concurrent-claim', 'phase-1', 'server', {
      claimedBy: 'instance-a',
      claimedAt: new Date().toISOString(),
      executionStatus: 'claimed',
    });
    const afterAclaim = await serviceA.getProject(pathA, 'concurrent-claim');
    expect(afterAclaim!.milestones[0].phases[0].claimedBy).toBe('instance-a');

    // Step 2: A's claim propagates to B
    await serviceB.persistRemoteProject(pathB, afterAclaim!);
    const phaseOnBAfterAClaim = await serviceB.getPhase(
      pathB,
      'concurrent-claim',
      'phase-1',
      'server'
    );
    expect(phaseOnBAfterAClaim!.claimedBy).toBe('instance-a');

    // Step 3: Instance B also claims the phase independently (concurrent scenario)
    await serviceB.updatePhaseClaim(pathB, 'concurrent-claim', 'phase-1', 'server', {
      claimedBy: 'instance-b',
      claimedAt: new Date().toISOString(),
      executionStatus: 'claimed',
    });
    const afterBclaim = await serviceB.getProject(pathB, 'concurrent-claim');
    expect(afterBclaim!.milestones[0].phases[0].claimedBy).toBe('instance-b');

    // Step 4: B's claim propagates to A — B was the last writer, overwrites A's view
    await serviceA.persistRemoteProject(pathA, afterBclaim!);
    const phaseOnAAfterBPropagation = await serviceA.getPhase(
      pathA,
      'concurrent-claim',
      'phase-1',
      'server'
    );

    // Last-writer-wins: B's claim overwrote A's claim on instance A
    expect(phaseOnAAfterBPropagation!.claimedBy).toBe('instance-b');

    // Both instances now converge on B's claim
    const phaseOnBFinal = await serviceB.getPhase(pathB, 'concurrent-claim', 'phase-1', 'server');
    expect(phaseOnBFinal!.claimedBy).toBe('instance-b');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: Milestone save propagation
  // ─────────────────────────────────────────────────────────────────────────

  it('milestone save propagation: instance B receives updated milestones array', async () => {
    const eventsA = createEventEmitter();
    const serviceA = new ProjectService(stubFeatureLoader, eventsA);
    const serviceB = new ProjectService(stubFeatureLoader);

    const unsub = wireSyncForward(eventsA, serviceB, pathB);

    // Create base project on A and bootstrap B
    const created = await serviceA.createProject(pathA, {
      slug: 'milestone-sync',
      title: 'Milestone Sync Test',
      goal: 'Verify saveProjectMilestones propagates correctly',
    });
    await serviceB.persistRemoteProject(pathB, created);

    // Instance A calls saveProjectMilestones with a structured milestone tree
    const newMilestones: Milestone[] = [
      buildMilestone('m1', [
        buildPhase('types', 'Type Definitions'),
        buildPhase('service', 'Service Layer'),
      ]),
      buildMilestone('m2', [buildPhase('ui', 'UI Components')]),
    ];

    const updated = await serviceA.saveProjectMilestones(pathA, 'milestone-sync', newMilestones);

    // Emit project:updated so the sync bridge forwards to B.
    // saveProjectMilestones writes to disk but does not auto-emit;
    // in production this is done by the calling route/agent via syncProjectToCrdt.
    eventsA.emit('project:updated', {
      projectSlug: 'milestone-sync',
      projectPath: pathA,
      project: updated,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    // Verify instance B has the updated milestones array
    const projectOnB = await serviceB.getProject(pathB, 'milestone-sync');
    expect(projectOnB).not.toBeNull();
    expect(projectOnB!.milestones).toHaveLength(2);

    const m1 = projectOnB!.milestones.find((m) => m.slug === 'm1');
    expect(m1).toBeDefined();
    expect(m1!.phases).toHaveLength(2);
    expect(m1!.phases[0].name).toBe('types');
    expect(m1!.phases[1].name).toBe('service');

    const m2 = projectOnB!.milestones.find((m) => m.slug === 'm2');
    expect(m2).toBeDefined();
    expect(m2!.phases).toHaveLength(1);
    expect(m2!.phases[0].name).toBe('ui');

    unsub();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: Schema normalization
  // ─────────────────────────────────────────────────────────────────────────

  it('schema normalization: legacy thin ProjectDocument gets safe defaults for all missing fields', () => {
    /**
     * Legacy thin documents only have {id, title, goal, prd: string}.
     * normalizeProjectDocument() must supply safe defaults for all missing fields
     * so downstream code never encounters undefined where an array or status is expected.
     */
    const legacyDoc = {
      id: 'legacy-proj',
      title: 'Legacy Project',
      goal: 'Migrate to new schema',
      prd: 'This is the old plain-string PRD describing the project approach.',
      // missing: status, milestones, createdAt, updatedAt, _meta, schemaVersion
    };

    const normalized = normalizeProjectDocument(
      legacyDoc as Parameters<typeof normalizeProjectDocument>[0]
    );

    // Identity fields survive normalization
    expect(normalized.id).toBe('legacy-proj');
    expect(normalized.title).toBe('Legacy Project');
    expect(normalized.goal).toBe('Migrate to new schema');

    // Missing status defaults to 'researching'
    expect(normalized.status).toBe('researching');

    // Missing milestones array defaults to []
    expect(Array.isArray(normalized.milestones)).toBe(true);
    expect(normalized.milestones).toHaveLength(0);

    // Legacy plain-string prd is wrapped into SPARCPrd with content in approach
    expect(normalized.prd).toBeDefined();
    expect(normalized.prd!.approach).toBe(
      'This is the old plain-string PRD describing the project approach.'
    );
    expect(normalized.prd!.situation).toBe('');
    expect(normalized.prd!.problem).toBe('');
    expect(normalized.prd!.results).toBe('');
    expect(normalized.prd!.constraints).toBe('');

    // Missing _meta is synthesised with instanceId: 'unknown'
    expect(normalized._meta).toBeDefined();
    expect(normalized._meta.instanceId).toBe('unknown');

    // createdAt / updatedAt are derived from _meta when absent in legacy doc
    expect(typeof normalized.createdAt).toBe('string');
    expect(typeof normalized.updatedAt).toBe('string');
  });

  it('schema normalization: milestone phases missing executionStatus default to unclaimed', () => {
    const docWithMilestones = {
      id: 'proj-with-milestones',
      title: 'Project With Milestones',
      goal: 'Test phase defaults',
      milestones: [
        {
          number: 1,
          slug: 'foundation',
          title: 'Foundation',
          description: 'Core work',
          status: 'planned' as const,
          phases: [
            {
              number: 1,
              name: 'types',
              title: 'Types',
              description: 'Type definitions',
              // executionStatus intentionally absent (legacy phase)
            },
          ],
        },
      ],
    };

    const normalized = normalizeProjectDocument(
      docWithMilestones as Parameters<typeof normalizeProjectDocument>[0]
    );

    expect(normalized.milestones).toHaveLength(1);
    expect(normalized.milestones[0].phases).toHaveLength(1);
    // Missing executionStatus defaults to 'unclaimed'
    expect(normalized.milestones[0].phases[0].executionStatus).toBe('unclaimed');
  });
});
