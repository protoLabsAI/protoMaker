/**
 * AvaWorldStateBuilder — unit tests
 *
 * Covers:
 * - getFullBriefing() aggregates PM + LE summaries
 * - getFullBriefing() includes all required section headers
 * - Team health metrics are included
 * - Cross-project dependency detection
 * - Brand/content status from PM upcoming deadlines
 * - buildState() returns structured AvaWorldState
 * - Graceful handling of PM / LE errors
 * - Strategic context is included when configured
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvaWorldStateBuilder } from '@/services/ava-world-state-builder.js';
import type { LeadEngineerWorldStateProvider } from '@/services/ava-world-state-builder.js';
import type { PMWorldStateBuilder } from '@/services/pm-world-state-builder.js';
import { WorldStateDomain } from '@protolabsai/types';

// ────────────────────────── Module Mocks ──────────────────────────

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

function makePmState(
  overrides: Partial<{
    projects: Record<
      string,
      { status: string; phase: string; milestoneCount: number; completedMilestones: number }
    >;
    milestones: Record<
      string,
      { title: string; totalPhases: number; completedPhases: number; dueAt?: string }
    >;
    ceremonies: Record<string, string>;
    upcomingDeadlines: Array<{ projectSlug: string; label: string; dueAt: string }>;
    updatedAt: string;
  }> = {}
) {
  return {
    domain: WorldStateDomain.Project,
    updatedAt: overrides.updatedAt ?? '2026-03-10T00:00:00.000Z',
    projects: overrides.projects ?? {},
    milestones: overrides.milestones ?? {},
    ceremonies: overrides.ceremonies ?? {},
    upcomingDeadlines: overrides.upcomingDeadlines ?? [],
  };
}

function makeMockPmBuilder(pmStateOverrides: Parameters<typeof makePmState>[0] = {}) {
  const state = makePmState(pmStateOverrides);
  return {
    getState: vi.fn(() => state),
    getDistilledSummary: vi.fn(
      () => `## Project Status\n- **test-project**: active / development (0/1 milestones)`
    ),
  } as unknown as PMWorldStateBuilder;
}

function makeMockLeProvider(summary = '## Engineering\n- 3 features in progress') {
  return {
    getWorldStateSummary: vi.fn(() => summary),
  } as LeadEngineerWorldStateProvider;
}

// ────────────────────────── Tests ──────────────────────────

describe('AvaWorldStateBuilder', () => {
  let pmBuilder: PMWorldStateBuilder;
  let leProvider: LeadEngineerWorldStateProvider;
  let builder: AvaWorldStateBuilder;

  beforeEach(() => {
    pmBuilder = makeMockPmBuilder();
    leProvider = makeMockLeProvider();
    builder = new AvaWorldStateBuilder(pmBuilder, leProvider);
  });

  // ── getFullBriefing() — structure ──────────────────────────────────

  describe('getFullBriefing() — structure', () => {
    it('should include top-level heading', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('# Ava Full Briefing');
    });

    it('should include PM layer section', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('## Project Management Layer');
    });

    it('should include Engineering layer section', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('## Engineering Layer');
    });

    it('should include Strategic Context section', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('## Strategic Context');
    });

    it('should include Team Health subsection', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('### Team Health');
    });

    it('should include Cross-Project Dependencies subsection', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('### Cross-Project Dependencies');
    });

    it('should include Brand & Content subsection', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('### Brand & Content');
    });

    it('should include a generation timestamp', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toMatch(/_Generated: \d{4}-\d{2}-\d{2}/);
    });
  });

  // ── getFullBriefing() — aggregation ──────────────────────────────────

  describe('getFullBriefing() — aggregation', () => {
    it('should include PM distilled summary content', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('## Project Status');
      expect(briefing).toContain('test-project');
    });

    it('should call pmBuilder.getDistilledSummary()', () => {
      builder.getFullBriefing();
      expect(vi.mocked(pmBuilder.getDistilledSummary)).toHaveBeenCalledOnce();
    });

    it('should include LE world state summary content', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('## Engineering');
      expect(briefing).toContain('3 features in progress');
    });

    it('should call leProvider.getWorldStateSummary()', () => {
      builder.getFullBriefing();
      expect(vi.mocked(leProvider.getWorldStateSummary)).toHaveBeenCalledOnce();
    });
  });

  // ── Team health ──────────────────────────────────────────────────────

  describe('team health metrics', () => {
    it('should show active agents count', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('Active Agents: 0');
    });

    it('should show escalations count', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('Escalations: 0');
    });

    it('should flag errorBudgetExhausted=true when no projects exist', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('Error Budget Exhausted: Yes');
    });

    it('should flag errorBudgetExhausted=false when projects exist', () => {
      pmBuilder = makeMockPmBuilder({
        projects: {
          'my-project': {
            status: 'active',
            phase: 'dev',
            milestoneCount: 1,
            completedMilestones: 0,
          },
        },
      });
      builder = new AvaWorldStateBuilder(pmBuilder, leProvider);
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('Error Budget Exhausted: No');
    });
  });

  // ── Cross-project dependencies ───────────────────────────────────────

  describe('cross-project dependencies', () => {
    it('should show no-dependency placeholder with single project', () => {
      pmBuilder = makeMockPmBuilder({
        projects: {
          solo: { status: 'active', phase: 'dev', milestoneCount: 0, completedMilestones: 0 },
        },
      });
      builder = new AvaWorldStateBuilder(pmBuilder, leProvider);
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('_No cross-project dependencies detected_');
    });

    it('should flag multiple active projects', () => {
      pmBuilder = makeMockPmBuilder({
        projects: {
          'proj-a': { status: 'active', phase: 'dev', milestoneCount: 1, completedMilestones: 0 },
          'proj-b': { status: 'active', phase: 'dev', milestoneCount: 1, completedMilestones: 0 },
        },
      });
      builder = new AvaWorldStateBuilder(pmBuilder, leProvider);
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('2 active projects');
      expect(briefing).toContain('shared dependencies');
    });
  });

  // ── Brand & content status ───────────────────────────────────────────

  describe('brand & content status', () => {
    it('should show no-deadlines placeholder when none exist', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('_No brand/content deadlines on the horizon_');
    });

    it('should show upcoming deadlines from PM state', () => {
      pmBuilder = makeMockPmBuilder({
        upcomingDeadlines: [
          { projectSlug: 'content', label: 'Blog Post Launch', dueAt: '2099-06-01T00:00:00.000Z' },
        ],
      });
      builder = new AvaWorldStateBuilder(pmBuilder, leProvider);
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('Blog Post Launch');
      expect(briefing).toContain('2099-06-01');
      expect(briefing).toContain('content');
    });

    it('should not show past deadlines in brand section', () => {
      pmBuilder = makeMockPmBuilder({
        upcomingDeadlines: [
          { projectSlug: 'old', label: 'Past Launch', dueAt: '2020-01-01T00:00:00.000Z' },
        ],
      });
      builder = new AvaWorldStateBuilder(pmBuilder, leProvider);
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('_No brand/content deadlines on the horizon_');
    });

    it('should limit brand deadlines to 3 entries', () => {
      const deadlines = Array.from({ length: 5 }, (_, i) => ({
        projectSlug: 'proj',
        label: `Deadline ${i + 1}`,
        dueAt: `2099-0${i + 1}-01T00:00:00.000Z`,
      }));
      pmBuilder = makeMockPmBuilder({ upcomingDeadlines: deadlines });
      builder = new AvaWorldStateBuilder(pmBuilder, leProvider);
      const briefing = builder.getFullBriefing();
      const matches = briefing.match(/^- 2099-\d{2}-\d{2}/gm) ?? [];
      expect(matches.length).toBeLessThanOrEqual(3);
    });
  });

  // ── Strategic context ────────────────────────────────────────────────

  describe('strategic context', () => {
    it('should not include Strategic Directives section when not configured', () => {
      const briefing = builder.getFullBriefing();
      expect(briefing).not.toContain('### Strategic Directives');
    });

    it('should include Strategic Directives when configured', () => {
      builder = new AvaWorldStateBuilder(pmBuilder, leProvider, {
        strategicContext: 'Focus on revenue-generating features this sprint.',
      });
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('### Strategic Directives');
      expect(briefing).toContain('Focus on revenue-generating features');
    });
  });

  // ── Error resilience ─────────────────────────────────────────────────

  describe('error resilience', () => {
    it('should show PM unavailable message when getDistilledSummary throws', () => {
      vi.mocked(pmBuilder.getDistilledSummary).mockImplementation(() => {
        throw new Error('PM disk failure');
      });
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('_PM summary unavailable_');
    });

    it('should show LE unavailable message when getWorldStateSummary throws', () => {
      vi.mocked(leProvider.getWorldStateSummary).mockImplementation(() => {
        throw new Error('LE service unavailable');
      });
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('_Engineering summary unavailable_');
    });

    it('should still produce a complete briefing despite PM failure', () => {
      vi.mocked(pmBuilder.getDistilledSummary).mockImplementation(() => {
        throw new Error('oops');
      });
      const briefing = builder.getFullBriefing();
      expect(briefing).toContain('## Strategic Context');
      expect(briefing).toContain('### Team Health');
    });
  });

  // ── buildState() ─────────────────────────────────────────────────────

  describe('buildState()', () => {
    it('should return AvaWorldState with domain = Strategic', () => {
      const state = builder.buildState();
      expect(state.domain).toBe(WorldStateDomain.Strategic);
    });

    it('should include an updatedAt timestamp', () => {
      const state = builder.buildState();
      expect(state.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should include teamHealth', () => {
      const state = builder.buildState();
      expect(state.teamHealth).toBeDefined();
      expect(typeof state.teamHealth.activeAgents).toBe('number');
      expect(typeof state.teamHealth.escalations).toBe('number');
      expect(typeof state.teamHealth.errorBudgetExhausted).toBe('boolean');
    });

    it('should include projectRollups from PM state', () => {
      pmBuilder = makeMockPmBuilder({
        projects: {
          'my-app': {
            status: 'on-track',
            phase: 'execution',
            milestoneCount: 5,
            completedMilestones: 2,
          },
        },
      });
      builder = new AvaWorldStateBuilder(pmBuilder, leProvider);
      const state = builder.buildState();

      expect(state.projectRollups['my-app']).toMatchObject({
        status: 'on-track',
        openFeatures: 3,
        blockers: 0,
      });
    });

    it('should include strategicContext when configured', () => {
      builder = new AvaWorldStateBuilder(pmBuilder, leProvider, {
        strategicContext: 'Q2 launch preparation.',
      });
      const state = builder.buildState();
      expect(state.strategicContext).toBe('Q2 launch preparation.');
    });

    it('should not include strategicContext when not configured', () => {
      const state = builder.buildState();
      expect(state.strategicContext).toBeUndefined();
    });

    it('should clamp openFeatures to 0 when completedMilestones exceeds milestoneCount', () => {
      pmBuilder = makeMockPmBuilder({
        projects: {
          proj: { status: 'active', phase: 'dev', milestoneCount: 2, completedMilestones: 5 },
        },
      });
      builder = new AvaWorldStateBuilder(pmBuilder, leProvider);
      const state = builder.buildState();
      expect(state.projectRollups['proj'].openFeatures).toBe(0);
    });
  });
});
