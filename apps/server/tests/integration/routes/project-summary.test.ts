/**
 * Integration tests for GET /api/projects/:slug/summary
 *
 * Verifies that the endpoint returns a unified ProjectSummary with:
 *   - project:        core metadata
 *   - featureCount:   feature counts keyed by FeatureStatus
 *   - milestones:     milestone list with completion percentages
 *   - artifacts:      { ceremonies, changelogs, escalations } from the artifact index
 *   - recentTimeline: last 20 EventLedger events
 *
 * All external dependencies (ProjectService, ProjectArtifactService,
 * EventLedgerService) are mocked — no file system required.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';

import { createSummaryHandler } from '@/routes/projects/routes/summary.js';
import type {
  Project,
  Feature,
  ArtifactIndexEntry,
  EventLedgerEntry,
  ProjectSummary,
} from '@protolabsai/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PROJECT_SLUG = 'my-project';
const PROJECT_PATH = '/test/projects';

const MOCK_PROJECT: Project = {
  slug: PROJECT_SLUG,
  title: 'My Project',
  goal: 'Build something great',
  status: 'active',
  health: 'on-track',
  priority: 'high',
  lead: 'alice',
  startDate: '2026-01-01',
  targetDate: '2026-06-30',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  milestones: [
    {
      number: 1,
      slug: 'foundation',
      title: 'Foundation',
      description: 'Set up the basics',
      status: 'in-progress',
      phases: [
        { number: 1, name: 'types', title: 'Types', description: 'Add types', featureId: 'f1' },
        {
          number: 2,
          name: 'server',
          title: 'Server',
          description: 'Add server',
          featureId: 'f2',
        },
      ],
    },
    {
      number: 2,
      slug: 'ui',
      title: 'UI',
      description: 'Build the UI',
      status: 'pending',
      phases: [
        {
          number: 1,
          name: 'components',
          title: 'Components',
          description: 'UI components',
          featureId: 'f3',
        },
      ],
    },
    {
      number: 3,
      slug: 'empty-milestone',
      title: 'Empty Milestone',
      description: 'No phases yet',
      status: 'planning',
      phases: [],
    },
  ],
};

function makeFeature(
  id: string,
  status: 'backlog' | 'in_progress' | 'review' | 'done' | 'blocked'
): Feature {
  return {
    id,
    title: `Feature ${id}`,
    status,
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Feature;
}

function makeArtifact(
  id: string,
  type: 'ceremony-report' | 'changelog' | 'escalation'
): ArtifactIndexEntry {
  return {
    id,
    type,
    timestamp: '2026-01-01T10:00:00.000Z',
    filename: `${id}.json`,
  };
}

function makeEvent(id: string, eventType: string): EventLedgerEntry {
  return {
    id,
    timestamp: `2026-01-01T${id.padStart(2, '0')}:00:00.000Z`,
    eventType,
    correlationIds: { projectSlug: PROJECT_SLUG },
    payload: {},
    source: 'test',
  };
}

/** Minimal mock Express response */
function mockRes() {
  const res = {
    _status: 200,
    _body: null as unknown,
    json(body: unknown) {
      this._body = body;
      return this;
    },
    status(code: number) {
      this._status = code;
      return this;
    },
  };
  return res as unknown as Response & { _status: number; _body: unknown };
}

/** Minimal mock Express request */
function mockReq(slug: string, query: Record<string, string> = {}): Request {
  return { params: { slug }, query } as unknown as Request;
}

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeProjectService(project: Project | null, features: Feature[] = []) {
  return {
    getProject: vi.fn().mockResolvedValue(project),
    getProjectFeatures: vi.fn().mockResolvedValue({ features, epics: [] }),
  } as unknown as import('@/services/project-service.js').ProjectService;
}

function makeArtifactService(
  ceremonies: ArtifactIndexEntry[] = [],
  changelogs: ArtifactIndexEntry[] = [],
  escalations: ArtifactIndexEntry[] = []
) {
  return {
    listArtifacts: vi
      .fn()
      .mockImplementation((_projectPath: string, _slug: string, type: string) => {
        if (type === 'ceremony-report') return Promise.resolve(ceremonies);
        if (type === 'changelog') return Promise.resolve(changelogs);
        if (type === 'escalation') return Promise.resolve(escalations);
        return Promise.resolve([]);
      }),
  } as unknown as import('@/services/project-artifact-service.js').ProjectArtifactService;
}

function makeEventLedger(events: EventLedgerEntry[] = []) {
  return {
    queryByProject: vi.fn().mockResolvedValue(events),
  } as unknown as import('@/services/event-ledger-service.js').EventLedgerService;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/projects/:slug/summary', () => {
  // ─── 404 / 400 guards ─────────────────────────────────────────────────────

  it('returns 400 when projectPath query param is missing', async () => {
    const handler = createSummaryHandler(
      makeProjectService(null),
      makeArtifactService(),
      makeEventLedger()
    );
    const req = mockReq(PROJECT_SLUG, {}); // no projectPath
    const res = mockRes();

    await handler(req, res as unknown as Response);

    expect(res._status).toBe(400);
    const body = res._body as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/projectPath/i);
  });

  it('returns 404 when the project does not exist', async () => {
    const handler = createSummaryHandler(
      makeProjectService(null),
      makeArtifactService(),
      makeEventLedger()
    );
    const req = mockReq(PROJECT_SLUG, { projectPath: PROJECT_PATH });
    const res = mockRes();

    await handler(req, res as unknown as Response);

    expect(res._status).toBe(404);
    const body = res._body as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not found/i);
  });

  // ─── Full response shape ───────────────────────────────────────────────────

  describe('full response shape', () => {
    let handler: ReturnType<typeof createSummaryHandler>;
    let result: { success: boolean; summary: ProjectSummary };

    const features = [
      makeFeature('f1', 'done'),
      makeFeature('f2', 'in_progress'),
      makeFeature('f3', 'done'),
      makeFeature('f4', 'backlog'),
      makeFeature('f5', 'backlog'),
    ];

    const ceremonies = [
      makeArtifact('c1', 'ceremony-report'),
      makeArtifact('c2', 'ceremony-report'),
    ];
    const changelogs = [makeArtifact('ch1', 'changelog')];
    const escalations: ArtifactIndexEntry[] = [];

    // 25 events — recentTimeline should return the last 20
    const events = Array.from({ length: 25 }, (_, i) =>
      makeEvent(String(i + 1), i % 2 === 0 ? 'feature:started' : 'feature:completed')
    );

    beforeEach(async () => {
      handler = createSummaryHandler(
        makeProjectService(MOCK_PROJECT, features),
        makeArtifactService(ceremonies, changelogs, escalations),
        makeEventLedger(events)
      );
      const req = mockReq(PROJECT_SLUG, { projectPath: PROJECT_PATH });
      const res = mockRes();

      await handler(req, res as unknown as Response);
      result = res._body as { success: boolean; summary: ProjectSummary };
    });

    it('returns success: true', () => {
      expect(result.success).toBe(true);
    });

    it('includes project metadata with correct fields', () => {
      const { project } = result.summary;
      expect(project.slug).toBe(PROJECT_SLUG);
      expect(project.title).toBe('My Project');
      expect(project.goal).toBe('Build something great');
      expect(project.status).toBe('active');
      expect(project.health).toBe('on-track');
      expect(project.priority).toBe('high');
      expect(project.lead).toBe('alice');
      expect(project.startDate).toBe('2026-01-01');
      expect(project.targetDate).toBe('2026-06-30');
      expect(project.createdAt).toBeDefined();
      expect(project.updatedAt).toBeDefined();
    });

    it('includes featureCount keyed by status', () => {
      const { featureCount } = result.summary;
      expect(featureCount['done']).toBe(2);
      expect(featureCount['in_progress']).toBe(1);
      expect(featureCount['backlog']).toBe(2);
      // No blocked or review features in fixture
      expect(featureCount['blocked']).toBeUndefined();
    });

    it('includes milestones with correct shape', () => {
      const { milestones } = result.summary;
      expect(milestones).toHaveLength(3);

      for (const m of milestones) {
        expect(m).toHaveProperty('slug');
        expect(m).toHaveProperty('title');
        expect(m).toHaveProperty('status');
        expect(m).toHaveProperty('completionPct');
        expect(m).toHaveProperty('phaseCount');
        expect(m).toHaveProperty('completedPhaseCount');
      }
    });

    it('calculates milestone completion percentage correctly', () => {
      const { milestones } = result.summary;

      // foundation: 2 phases — f1=done, f2=in_progress → 1/2 = 50%
      const foundation = milestones.find((m) => m.slug === 'foundation');
      expect(foundation?.phaseCount).toBe(2);
      expect(foundation?.completedPhaseCount).toBe(1);
      expect(foundation?.completionPct).toBe(50);

      // ui: 1 phase — f3=done → 1/1 = 100%
      const ui = milestones.find((m) => m.slug === 'ui');
      expect(ui?.phaseCount).toBe(1);
      expect(ui?.completedPhaseCount).toBe(1);
      expect(ui?.completionPct).toBe(100);

      // empty-milestone: 0 phases → 0%
      const empty = milestones.find((m) => m.slug === 'empty-milestone');
      expect(empty?.phaseCount).toBe(0);
      expect(empty?.completionPct).toBe(0);
    });

    it('includes artifacts grouped by type', () => {
      const { artifacts } = result.summary;
      expect(artifacts).toHaveProperty('ceremonies');
      expect(artifacts).toHaveProperty('changelogs');
      expect(artifacts).toHaveProperty('escalations');

      expect(artifacts.ceremonies).toHaveLength(2);
      expect(artifacts.changelogs).toHaveLength(1);
      expect(artifacts.escalations).toHaveLength(0);

      // Each artifact entry should have required fields
      for (const a of artifacts.ceremonies) {
        expect(a).toHaveProperty('id');
        expect(a).toHaveProperty('type');
        expect(a).toHaveProperty('timestamp');
        expect(a).toHaveProperty('filename');
      }
    });

    it('returns at most 20 events in recentTimeline', () => {
      const { recentTimeline } = result.summary;
      expect(recentTimeline).toHaveLength(20);
    });

    it('recentTimeline contains the last 20 events', () => {
      const { recentTimeline } = result.summary;
      // Events array has 25 entries (indices 0–24); last 20 = indices 5–24
      const ids = recentTimeline.map((e) => e.id);
      // First returned event should be the 6th event (id='6')
      expect(ids[0]).toBe('6');
      // Last returned event should be the 25th event (id='25')
      expect(ids[ids.length - 1]).toBe('25');
    });

    it('recentTimeline events have required EventLedgerEntry fields', () => {
      for (const event of result.summary.recentTimeline) {
        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('eventType');
        expect(event).toHaveProperty('correlationIds');
        expect(event).toHaveProperty('payload');
        expect(event).toHaveProperty('source');
      }
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────

  it('returns empty featureCount when project has no features', async () => {
    const handler = createSummaryHandler(
      makeProjectService(MOCK_PROJECT, []),
      makeArtifactService(),
      makeEventLedger()
    );
    const req = mockReq(PROJECT_SLUG, { projectPath: PROJECT_PATH });
    const res = mockRes();

    await handler(req, res as unknown as Response);

    const body = res._body as { success: boolean; summary: ProjectSummary };
    expect(body.success).toBe(true);
    expect(body.summary.featureCount).toEqual({});
  });

  it('returns empty recentTimeline when there are no events', async () => {
    const handler = createSummaryHandler(
      makeProjectService(MOCK_PROJECT, []),
      makeArtifactService(),
      makeEventLedger([])
    );
    const req = mockReq(PROJECT_SLUG, { projectPath: PROJECT_PATH });
    const res = mockRes();

    await handler(req, res as unknown as Response);

    const body = res._body as { success: boolean; summary: ProjectSummary };
    expect(body.summary.recentTimeline).toHaveLength(0);
  });

  it('returns fewer than 20 events when total count < 20', async () => {
    const fewEvents = Array.from({ length: 5 }, (_, i) =>
      makeEvent(String(i + 1), 'feature:started')
    );
    const handler = createSummaryHandler(
      makeProjectService(MOCK_PROJECT, []),
      makeArtifactService(),
      makeEventLedger(fewEvents)
    );
    const req = mockReq(PROJECT_SLUG, { projectPath: PROJECT_PATH });
    const res = mockRes();

    await handler(req, res as unknown as Response);

    const body = res._body as { success: boolean; summary: ProjectSummary };
    expect(body.summary.recentTimeline).toHaveLength(5);
  });

  it('returns 500 on unexpected service error', async () => {
    const brokenService = {
      getProject: vi.fn().mockRejectedValue(new Error('disk error')),
      getProjectFeatures: vi.fn(),
    } as unknown as import('@/services/project-service.js').ProjectService;

    const handler = createSummaryHandler(brokenService, makeArtifactService(), makeEventLedger());
    const req = mockReq(PROJECT_SLUG, { projectPath: PROJECT_PATH });
    const res = mockRes();

    await handler(req, res as unknown as Response);

    expect(res._status).toBe(500);
    const body = res._body as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/disk error/i);
  });
});
