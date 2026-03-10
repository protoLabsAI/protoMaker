/**
 * PMWorldStateBuilder — unit tests
 *
 * Covers:
 * - State building from disk (projects, milestones, ceremonies, timelines)
 * - Graceful handling of missing directories/files
 * - getDistilledSummary() markdown output
 * - 60s refresh interval (start / stop)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import { PMWorldStateBuilder } from '@/services/pm-world-state-builder.js';
import { WorldStateDomain } from '@protolabsai/types';

// ────────────────────────── Module Mocks ──────────────────────────

vi.mock('node:fs/promises');
vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual<typeof import('@protolabsai/utils')>('@protolabsai/utils');
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  };
});

// ────────────────────────── Helpers ──────────────────────────

function makeProjectJson(overrides: object = {}): string {
  return JSON.stringify({
    status: 'active',
    phase: 'development',
    milestones: [
      {
        slug: 'milestone-1',
        title: 'Milestone One',
        phases: [
          { featureId: 'f1', status: 'done' },
          { featureId: 'f2', status: 'in_progress' },
        ],
        dueAt: '2026-04-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  });
}

function setupMockFs(
  opts: {
    projects?: Array<{ slug: string; projectJson?: string }>;
    ceremonyState?: object;
    timeline?: object;
  } = {}
) {
  const mReaddir = vi.mocked(fs.readdir);
  const mReadFile = vi.mocked(fs.readFile);

  mReaddir.mockImplementation(async (dirPath, _opts) => {
    const p = String(dirPath);
    if (p.endsWith('projects')) {
      return (opts.projects ?? []).map(
        (proj) =>
          ({ name: proj.slug, isDirectory: () => true }) as unknown as import('node:fs').Dirent
      );
    }
    return [];
  });

  mReadFile.mockImplementation(async (filePath) => {
    const p = String(filePath);

    // project.json files
    for (const proj of opts.projects ?? []) {
      if (p.endsWith(`${proj.slug}/project.json`)) {
        return proj.projectJson ?? makeProjectJson();
      }
    }

    // ceremony-state.json
    if (p.endsWith('ceremony-state.json')) {
      if (opts.ceremonyState) return JSON.stringify(opts.ceremonyState);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }

    // timeline.json
    if (p.endsWith('timeline.json')) {
      if (opts.timeline) return JSON.stringify(opts.timeline);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }

    throw Object.assign(new Error('ENOENT: ' + p), { code: 'ENOENT' });
  });
}

// ────────────────────────── Tests ──────────────────────────

describe('PMWorldStateBuilder', () => {
  let builder: PMWorldStateBuilder;

  beforeEach(() => {
    vi.useFakeTimers();
    builder = new PMWorldStateBuilder({ projectRoot: '/workspace' });
  });

  afterEach(() => {
    builder.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ── Initial State ──────────────────────────────────────────────────

  describe('initial state', () => {
    it('should have domain = WorldStateDomain.Project', () => {
      const state = builder.getState();
      expect(state.domain).toBe(WorldStateDomain.Project);
    });

    it('should start with empty collections', () => {
      const state = builder.getState();
      expect(state.projects).toEqual({});
      expect(state.milestones).toEqual({});
      expect(state.ceremonies).toEqual({});
      expect(state.upcomingDeadlines).toEqual([]);
    });
  });

  // ── buildState() ──────────────────────────────────────────────────

  describe('buildState()', () => {
    it('should populate projects and milestones from project.json', async () => {
      setupMockFs({
        projects: [{ slug: 'my-project', projectJson: makeProjectJson() }],
      });

      await builder.buildState();
      const state = builder.getState();

      expect(state.projects['my-project']).toEqual({
        status: 'active',
        phase: 'development',
        milestoneCount: 1,
        completedMilestones: 0, // only 1 of 2 phases done
      });

      expect(state.milestones['milestone-1']).toEqual({
        title: 'Milestone One',
        totalPhases: 2,
        completedPhases: 1,
        dueAt: '2026-04-01T00:00:00.000Z',
      });
    });

    it('should mark milestone as completed when all phases are done', async () => {
      const projectJson = JSON.stringify({
        status: 'active',
        phase: 'development',
        milestones: [
          {
            slug: 'ms-complete',
            title: 'Complete MS',
            phases: [
              { featureId: 'f1', status: 'done' },
              { featureId: 'f2', status: 'verified' },
            ],
          },
        ],
      });

      setupMockFs({ projects: [{ slug: 'proj', projectJson }] });
      await builder.buildState();
      const state = builder.getState();

      expect(state.projects['proj'].completedMilestones).toBe(1);
      expect(state.milestones['ms-complete'].completedPhases).toBe(2);
    });

    it('should derive milestone slug from title when slug field is absent', async () => {
      const projectJson = JSON.stringify({
        milestones: [{ title: 'My Feature Set', phases: [] }],
      });

      setupMockFs({ projects: [{ slug: 'proj', projectJson }] });
      await builder.buildState();
      const state = builder.getState();

      expect(state.milestones['my-feature-set']).toBeDefined();
    });

    it('should load ceremony schedules from ceremony-state.json', async () => {
      setupMockFs({
        ceremonyState: {
          standup: { type: 'standup', nextRunAt: '2026-03-11T09:00:00.000Z' },
          retro: { type: 'retro', nextRunAt: '2026-03-15T14:00:00.000Z' },
        },
      });

      await builder.buildState();
      const state = builder.getState();

      expect(state.ceremonies['standup']).toBe('2026-03-11T09:00:00.000Z');
      expect(state.ceremonies['retro']).toBe('2026-03-15T14:00:00.000Z');
    });

    it('should load timeline deadlines from timeline.json', async () => {
      setupMockFs({
        timeline: [
          { projectSlug: 'proj-a', label: 'Launch', dueAt: '2026-05-01T00:00:00.000Z' },
          { projectSlug: 'proj-b', label: 'Beta', dueAt: '2026-04-15T00:00:00.000Z' },
        ],
      });

      await builder.buildState();
      const state = builder.getState();

      expect(state.upcomingDeadlines).toHaveLength(2);
      expect(state.upcomingDeadlines[0]).toEqual({
        projectSlug: 'proj-a',
        label: 'Launch',
        dueAt: '2026-05-01T00:00:00.000Z',
      });
    });

    it('should handle missing .automaker/projects directory gracefully', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );
      vi.mocked(fs.readFile).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      await expect(builder.buildState()).resolves.toBeUndefined();

      const state = builder.getState();
      expect(state.projects).toEqual({});
      expect(state.milestones).toEqual({});
    });

    it('should skip a project when project.json is malformed JSON', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'bad-proj', isDirectory: () => true } as unknown as import('node:fs').Dirent,
      ]);
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const ps = String(p);
        if (ps.endsWith('project.json')) return '{ not valid json';
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      await builder.buildState();
      const state = builder.getState();
      expect(state.projects['bad-proj']).toBeUndefined();
    });

    it('should handle missing ceremony-state.json gracefully', async () => {
      setupMockFs({ projects: [] }); // no ceremony file set → mock throws ENOENT

      await builder.buildState();
      expect(builder.getState().ceremonies).toEqual({});
    });

    it('should handle missing timeline.json gracefully', async () => {
      setupMockFs({ projects: [] }); // no timeline file set → mock throws ENOENT

      await builder.buildState();
      expect(builder.getState().upcomingDeadlines).toEqual([]);
    });

    it('should update lastRefreshed (updatedAt) after each build', async () => {
      setupMockFs({});
      const before = new Date('2026-03-10T00:00:00.000Z');
      vi.setSystemTime(before);

      await builder.buildState();
      const firstUpdated = builder.getState().updatedAt;

      vi.setSystemTime(new Date('2026-03-10T00:01:00.000Z'));
      await builder.buildState();
      const secondUpdated = builder.getState().updatedAt;

      expect(secondUpdated > firstUpdated).toBe(true);
    });
  });

  // ── getDistilledSummary() ──────────────────────────────────────────

  describe('getDistilledSummary()', () => {
    it('should return markdown with expected section headers', () => {
      const summary = builder.getDistilledSummary();
      expect(summary).toContain('## Project Status');
      expect(summary).toContain('## Milestone Progress');
      expect(summary).toContain('## Upcoming Items');
    });

    it('should show empty state placeholders when no data', () => {
      const summary = builder.getDistilledSummary();
      expect(summary).toContain('_No active projects_');
      expect(summary).toContain('_No milestones_');
      expect(summary).toContain('_No upcoming items_');
    });

    it('should include project status after buildState()', async () => {
      setupMockFs({
        projects: [
          {
            slug: 'alpha',
            projectJson: makeProjectJson({ status: 'on-track', phase: 'execution' }),
          },
        ],
      });
      await builder.buildState();

      const summary = builder.getDistilledSummary();
      expect(summary).toContain('**alpha**');
      expect(summary).toContain('on-track');
      expect(summary).toContain('execution');
    });

    it('should include milestone progress after buildState()', async () => {
      setupMockFs({
        projects: [{ slug: 'proj', projectJson: makeProjectJson() }],
      });
      await builder.buildState();

      const summary = builder.getDistilledSummary();
      expect(summary).toContain('Milestone One');
      expect(summary).toContain('1/2');
    });

    it('should include upcoming deadlines from timeline', async () => {
      setupMockFs({
        timeline: [{ projectSlug: 'proj', label: 'Launch v1', dueAt: '2099-05-01T00:00:00.000Z' }],
      });
      await builder.buildState();

      const summary = builder.getDistilledSummary();
      expect(summary).toContain('Launch v1');
      expect(summary).toContain('2099-05-01');
    });

    it('should include ceremony dates in upcoming items', async () => {
      setupMockFs({
        ceremonyState: {
          standup: { type: 'standup', nextRunAt: '2099-06-01T09:00:00.000Z' },
        },
      });
      await builder.buildState();

      const summary = builder.getDistilledSummary();
      expect(summary).toContain('standup');
      expect(summary).toContain('2099-06-01');
    });

    it('should not show past items in upcoming items', async () => {
      setupMockFs({
        timeline: [
          { projectSlug: 'proj', label: 'Past Deadline', dueAt: '2020-01-01T00:00:00.000Z' },
        ],
      });
      await builder.buildState();

      const summary = builder.getDistilledSummary();
      expect(summary).toContain('_No upcoming items_');
    });

    it('should limit upcoming items to 10 entries', async () => {
      const deadlines = Array.from({ length: 15 }, (_, i) => ({
        projectSlug: 'proj',
        label: `Deadline ${i + 1}`,
        dueAt: `2099-0${Math.floor(i / 10) + 1}-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      }));

      setupMockFs({ timeline: deadlines });
      await builder.buildState();

      const summary = builder.getDistilledSummary();
      const matches = summary.match(/^- \d{4}-\d{2}-\d{2}/gm) ?? [];
      expect(matches.length).toBeLessThanOrEqual(10);
    });
  });

  // ── start() / stop() ──────────────────────────────────────────────

  describe('start() / stop()', () => {
    it('should call buildState immediately on start()', async () => {
      setupMockFs({});
      const spy = vi.spyOn(builder, 'buildState').mockResolvedValue();

      builder.start();
      // Flush the initial async call
      await Promise.resolve();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should call buildState again after 60s', async () => {
      setupMockFs({});
      const spy = vi.spyOn(builder, 'buildState').mockResolvedValue();

      builder.start();
      await Promise.resolve();

      vi.advanceTimersByTime(60_000);
      await Promise.resolve();

      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should not call buildState after stop()', async () => {
      setupMockFs({});
      const spy = vi.spyOn(builder, 'buildState').mockResolvedValue();

      builder.start();
      await Promise.resolve();

      builder.stop();
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should not create duplicate timers on multiple start() calls', async () => {
      setupMockFs({});
      const spy = vi.spyOn(builder, 'buildState').mockResolvedValue();

      builder.start();
      builder.start(); // second call should be a no-op
      await Promise.resolve();

      vi.advanceTimersByTime(60_000);
      await Promise.resolve();

      // Only 1 timer running → 2 calls total (initial + one interval tick)
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
