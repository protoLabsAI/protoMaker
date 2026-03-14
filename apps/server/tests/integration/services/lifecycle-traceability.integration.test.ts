/**
 * Lifecycle Traceability Integration Test
 *
 * Verifies the full paper trail is traceable in both directions:
 * (1) Forward:  project → milestone → phase → feature → agent execution → PR → done → archive
 * (2) Reverse:  archived feature → event ledger → pipeline states → project phase → milestone → project
 * (3) Cross-reference: Langfuse traceIds on feature match event ledger entries
 *
 * This test is the final validation that the entire lifecycle is connected.
 * All services are exercised against real file-system fixtures (no mocks).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { FeatureLoader } from '@/services/feature-loader.js';
import { EventLedgerService } from '@/services/event-ledger-service.js';
import { LedgerService } from '@/services/ledger-service.js';
import { ArchiveQueryService } from '@/services/archive-query-service.js';
import { ProjectService } from '@/services/project-service.js';
import { createEventEmitter } from '@/lib/events.js';
import type { Project } from '@protolabsai/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_SLUG = 'test-traceability';
const MILESTONE_SLUG = 'm1-traceability';
const FEATURE_ID = 'feature-trace-001';

const TRACE_ID_1 = 'langfuse-trace-abc-001';
const TRACE_ID_2 = 'langfuse-trace-abc-002';

const BRANCH_NAME = 'feature/trace-test-001';
const PR_NUMBER = 42;
const PR_URL = 'https://github.com/test/repo/pull/42';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('lifecycle-traceability (integration)', () => {
  let projectPath: string;
  let featureLoader: FeatureLoader;
  let eventLedger: EventLedgerService;
  let ledgerService: LedgerService;
  let archiveQuery: ArchiveQueryService;
  let projectService: ProjectService;
  let emitter: ReturnType<typeof createEventEmitter>;

  beforeEach(async () => {
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lifecycle-trace-'));

    featureLoader = new FeatureLoader();
    emitter = createEventEmitter();
    eventLedger = new EventLedgerService(projectPath);
    ledgerService = new LedgerService(featureLoader, emitter);
    archiveQuery = new ArchiveQueryService();
    projectService = new ProjectService(featureLoader);

    // Create base directory structure
    await fs.mkdir(path.join(projectPath, '.automaker', 'projects', PROJECT_SLUG), {
      recursive: true,
    });
    await fs.mkdir(path.join(projectPath, '.automaker', 'features', FEATURE_ID), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  it('traces full lifecycle in both forward and reverse directions', async () => {
    // ─── Timeline anchors ─────────────────────────────────────────────────
    const createdAt = new Date(Date.now() - 7200000).toISOString(); // 2 h ago
    const startedAt = new Date(Date.now() - 5400000).toISOString(); // 1.5 h ago
    const prCreatedAt = new Date(Date.now() - 3600000).toISOString(); // 1 h ago
    const prMergedAt = new Date(Date.now() - 1800000).toISOString(); // 30 min ago
    const completedAt = new Date(Date.now() - 1800000).toISOString(); // 30 min ago

    // ─── SETUP: project.json with milestone + phase referencing the feature ─

    const project: Project = {
      slug: PROJECT_SLUG,
      title: 'Traceability Test Project',
      goal: 'Verify full lifecycle paper trail is connected end-to-end',
      status: 'active',
      ongoing: false,
      milestones: [
        {
          number: 1,
          slug: MILESTONE_SLUG,
          title: 'Milestone 1: Traceability',
          description: 'Milestone for traceability verification',
          status: 'active',
          phases: [
            {
              number: 1,
              name: 'phase-1-core',
              title: 'Phase 1: Core Feature',
              description: 'Implements the core traceability feature',
              featureId: FEATURE_ID,
            },
          ],
        },
      ],
      createdAt,
      updatedAt: completedAt,
    } as unknown as Project;

    await fs.writeFile(
      path.join(projectPath, '.automaker', 'projects', PROJECT_SLUG, 'project.json'),
      JSON.stringify(project, null, 2)
    );

    // ─── SETUP: feature.json with full lifecycle data ─────────────────────

    const featureData = {
      id: FEATURE_ID,
      title: 'Traceability Test Feature',
      description: 'A feature that exercises the complete lifecycle paper trail',
      status: 'done',
      category: 'code',
      featureType: 'code',
      projectSlug: PROJECT_SLUG,
      milestoneSlug: MILESTONE_SLUG,
      complexity: 'medium',
      createdAt,
      startedAt,
      completedAt,
      // PR / merge data — populated so LedgerService skips GitHub enrichment
      branchName: BRANCH_NAME,
      prNumber: PR_NUMBER,
      prUrl: PR_URL,
      prCreatedAt,
      prMergedAt,
      // Langfuse observability trace IDs
      lastTraceId: TRACE_ID_2,
      traceIds: [TRACE_ID_1, TRACE_ID_2],
      // Full status history recording every transition
      statusHistory: [
        {
          from: null,
          to: 'backlog',
          timestamp: createdAt,
          reason: 'Feature created',
        },
        {
          from: 'backlog',
          to: 'in_progress',
          timestamp: startedAt,
          reason: 'Agent started execution',
        },
        {
          from: 'in_progress',
          to: 'done',
          timestamp: completedAt,
          reason: 'Agent execution succeeded, PR merged',
        },
      ],
      // Execution history with per-run costs and trace IDs
      executionHistory: [
        {
          model: 'claude-sonnet-4-20250514',
          costUsd: 0.05,
          durationMs: 45000,
          inputTokens: 10000,
          outputTokens: 2000,
          success: true,
          trigger: 'auto',
          traceId: TRACE_ID_1,
        },
        {
          model: 'claude-sonnet-4-20250514',
          costUsd: 0.03,
          durationMs: 30000,
          inputTokens: 6000,
          outputTokens: 1500,
          success: true,
          trigger: 'auto',
          traceId: TRACE_ID_2,
        },
      ],
    };

    await fs.writeFile(
      path.join(projectPath, '.automaker', 'features', FEATURE_ID, 'feature.json'),
      JSON.stringify(featureData, null, 2)
    );

    // ─── SETUP: Event ledger — one entry per state transition ─────────────

    await eventLedger.initialize();

    eventLedger.append({
      eventType: 'feature:created',
      correlationIds: {
        projectSlug: PROJECT_SLUG,
        milestoneSlug: MILESTONE_SLUG,
        featureId: FEATURE_ID,
      },
      payload: { status: 'backlog', title: featureData.title },
      source: 'FeatureLoader',
    });

    eventLedger.append({
      eventType: 'feature:status-changed',
      correlationIds: {
        projectSlug: PROJECT_SLUG,
        milestoneSlug: MILESTONE_SLUG,
        featureId: FEATURE_ID,
        traceId: TRACE_ID_1,
      },
      payload: { previousStatus: 'backlog', newStatus: 'in_progress', traceId: TRACE_ID_1 },
      source: 'AutoModeService',
    });

    eventLedger.append({
      eventType: 'agent:execution-completed',
      correlationIds: {
        projectSlug: PROJECT_SLUG,
        featureId: FEATURE_ID,
        traceId: TRACE_ID_1,
      },
      payload: { traceId: TRACE_ID_1, success: true, durationMs: 45000 },
      source: 'AutoModeService',
    });

    eventLedger.append({
      eventType: 'feature:pr-merged',
      correlationIds: {
        projectSlug: PROJECT_SLUG,
        milestoneSlug: MILESTONE_SLUG,
        featureId: FEATURE_ID,
        traceId: TRACE_ID_2,
      },
      payload: { prNumber: PR_NUMBER, prUrl: PR_URL, mergedAt: prMergedAt },
      source: 'AutoModeService',
    });

    eventLedger.append({
      eventType: 'feature:status-changed',
      correlationIds: {
        projectSlug: PROJECT_SLUG,
        milestoneSlug: MILESTONE_SLUG,
        featureId: FEATURE_ID,
        traceId: TRACE_ID_2,
      },
      payload: { previousStatus: 'in_progress', newStatus: 'done', traceId: TRACE_ID_2 },
      source: 'AutoModeService',
    });

    // Give fire-and-forget appends time to flush to disk
    await new Promise((r) => setTimeout(r, 300));

    // ─── SETUP: Metrics ledger — record completion before archival ────────

    const featureObj = await featureLoader.get(projectPath, FEATURE_ID);
    expect(featureObj, 'feature.json should be loadable before archival').toBeTruthy();
    await ledgerService.recordFeatureCompletion(projectPath, featureObj!);

    // ─── SETUP: Archive the feature ───────────────────────────────────────

    const archiveDirPath = await featureLoader.archiveFeature(projectPath, FEATURE_ID);
    expect(archiveDirPath, 'archiveFeature should return the archive directory path').toBeTruthy();

    // Let any remaining async I/O settle
    await new Promise((r) => setTimeout(r, 100));

    // ═════════════════════════════════════════════════════════════════════
    // FORWARD TRACE: project → milestone → phase → feature → execution → PR → done → archive
    // ═════════════════════════════════════════════════════════════════════

    // 1. Project loads and contains the milestone
    const loadedProject = await projectService.getProject(projectPath, PROJECT_SLUG);
    expect(loadedProject, 'project.json should be queryable by slug').toBeTruthy();
    expect(loadedProject!.milestones).toHaveLength(1);

    const milestone = loadedProject!.milestones[0];
    expect(milestone.slug).toBe(MILESTONE_SLUG);

    // 2. Milestone phase references our feature
    expect(milestone.phases).toHaveLength(1);
    const phase = milestone.phases[0];
    expect(phase.featureId).toBe(FEATURE_ID);

    // 3. Archived feature.json contains full statusHistory
    const archivedFeature = await archiveQuery.getArchivedFeatureJson(projectPath, FEATURE_ID);
    expect(archivedFeature, 'archived feature.json should be readable').toBeTruthy();

    expect(archivedFeature!.statusHistory).toBeDefined();
    expect(archivedFeature!.statusHistory!.length).toBeGreaterThanOrEqual(3);

    const transitions = archivedFeature!.statusHistory!.map((t) => `${t.from}→${t.to}`);
    expect(transitions).toContain('null→backlog');
    expect(transitions).toContain('backlog→in_progress');
    expect(transitions).toContain('in_progress→done');

    // 4. Feature has Langfuse trace IDs from agent execution runs
    expect(archivedFeature!.traceIds).toBeDefined();
    expect(archivedFeature!.traceIds).toContain(TRACE_ID_1);
    expect(archivedFeature!.traceIds).toContain(TRACE_ID_2);

    // 5. Feature has PR data documenting the merge
    expect(archivedFeature!.prNumber).toBe(PR_NUMBER);
    expect(archivedFeature!.prUrl).toBe(PR_URL);
    expect(archivedFeature!.prMergedAt).toBe(prMergedAt);

    // 6. Feature terminal status is "done"
    expect(archivedFeature!.status).toBe('done');

    // 7. Archive metadata confirms the archival timestamp
    const archiveDetail = await archiveQuery.getArchivedFeatureDetail(projectPath, FEATURE_ID);
    expect(archiveDetail, 'archive detail should be retrievable').toBeTruthy();
    expect(archiveDetail!.meta.archivedAt).toBeTruthy();
    expect(archiveDetail!.meta.projectPath).toBeTruthy();

    // ═════════════════════════════════════════════════════════════════════
    // REVERSE TRACE: archive → event ledger → pipeline → project
    // ═════════════════════════════════════════════════════════════════════

    // 1. From archive, recover the project/milestone slugs
    const reversedFeature = await archiveQuery.getArchivedFeatureJson(projectPath, FEATURE_ID);
    expect(reversedFeature).toBeTruthy();

    const recoveredProjectSlug = reversedFeature!.projectSlug;
    const recoveredMilestoneSlug = reversedFeature!.milestoneSlug;
    expect(recoveredProjectSlug).toBe(PROJECT_SLUG);
    expect(recoveredMilestoneSlug).toBe(MILESTONE_SLUG);

    // 2. Event ledger entries link back to the feature by featureId
    const ledgerEntries = await eventLedger.getByFeatureId(FEATURE_ID);
    expect(ledgerEntries.length).toBeGreaterThanOrEqual(5);

    const eventTypes = ledgerEntries.map((e) => e.eventType);
    expect(eventTypes).toContain('feature:created');
    expect(eventTypes).toContain('feature:status-changed');
    expect(eventTypes).toContain('agent:execution-completed');
    expect(eventTypes).toContain('feature:pr-merged');

    // 3. Event ledger also queryable by project slug — same entries are reachable
    const projectEvents = await eventLedger.getByProjectSlug(PROJECT_SLUG);
    expect(projectEvents.length).toBeGreaterThanOrEqual(5);
    const featureIdsInProjectEvents = new Set(projectEvents.map((e) => e.correlationIds.featureId));
    expect(featureIdsInProjectEvents.has(FEATURE_ID)).toBe(true);

    // 4. Reverse-navigate: archived project slug → project → milestone → phase → featureId
    const reverseProject = await projectService.getProject(projectPath, recoveredProjectSlug!);
    expect(reverseProject, 'project should be loadable from recovered slug').toBeTruthy();

    const reverseMilestone = reverseProject!.milestones.find(
      (m) => m.slug === recoveredMilestoneSlug
    );
    expect(reverseMilestone, 'milestone should be findable from recovered slug').toBeTruthy();

    const reversePhase = reverseMilestone!.phases.find((p) => p.featureId === FEATURE_ID);
    expect(reversePhase, 'phase should reference the feature from reverse trace').toBeTruthy();

    // ═════════════════════════════════════════════════════════════════════
    // CROSS-REFERENCE: Langfuse traceIds on feature match event ledger entries
    // ═════════════════════════════════════════════════════════════════════

    // Collect all traceIds stored on the archived feature
    const featureTraceIds = new Set(archivedFeature!.traceIds ?? []);

    // Collect all traceIds referenced in the event ledger
    const ledgerTraceIds = new Set(
      ledgerEntries
        .filter((e) => e.correlationIds.traceId)
        .map((e) => e.correlationIds.traceId as string)
    );

    // Every traceId from the feature's execution history should appear in the event ledger
    const intersecting = [...featureTraceIds].filter((id) => ledgerTraceIds.has(id));
    expect(
      intersecting.length,
      'at least one feature traceId must appear in the event ledger'
    ).toBeGreaterThan(0);
    expect(intersecting).toContain(TRACE_ID_1);
    expect(intersecting).toContain(TRACE_ID_2);

    // ═════════════════════════════════════════════════════════════════════
    // EVENT LEDGER: every state transition has a corresponding ledger entry
    // ═════════════════════════════════════════════════════════════════════

    const statusChangedEvents = ledgerEntries.filter(
      (e) => e.eventType === 'feature:status-changed'
    );
    expect(
      statusChangedEvents.length,
      'there should be a status-changed event for each transition'
    ).toBeGreaterThanOrEqual(2);

    const statusTransitions = statusChangedEvents.map((e) => {
      const p = e.payload as Record<string, unknown>;
      return `${p.previousStatus}→${p.newStatus}`;
    });
    expect(statusTransitions).toContain('backlog→in_progress');
    expect(statusTransitions).toContain('in_progress→done');

    // ═════════════════════════════════════════════════════════════════════
    // METRICS LEDGER: completion entry exists and is fully populated
    // ═════════════════════════════════════════════════════════════════════

    const hasRecord = await ledgerService.hasRecord(projectPath, FEATURE_ID);
    expect(hasRecord, 'metrics ledger should contain a completion record for the feature').toBe(
      true
    );

    const records = await ledgerService.getRecords(projectPath, {
      projectSlug: PROJECT_SLUG,
    });
    expect(records.length).toBeGreaterThanOrEqual(1);

    const completionRecord = records.find((r) => r.featureId === FEATURE_ID);
    expect(completionRecord, 'completion record should be findable by featureId').toBeTruthy();
    expect(completionRecord!.featureId).toBe(FEATURE_ID);
    expect(completionRecord!.projectSlug).toBe(PROJECT_SLUG);
    expect(completionRecord!.milestoneSlug).toBe(MILESTONE_SLUG);
    expect(completionRecord!.finalStatus).toBe('done');
    expect(completionRecord!.recordType).toBe('feature_completion');
    expect(completionRecord!.branchName).toBe(BRANCH_NAME);
  }, 20000);
});
