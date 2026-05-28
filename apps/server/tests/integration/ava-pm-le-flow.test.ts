/**
 * Ava → PM → LE Integration Flow Test
 *
 * Verifies the full wiring: user asks Ava → PM subagent assembles project status
 * → PM queries LE execution state via service call → distilled answer returned.
 *
 * Uses inline mocks for PM and LE services — no disk I/O, no LLM calls.
 *
 * Scenarios covered:
 *   1. AvaWorldStateBuilder.getFullBriefing() aggregates PM + LE layers
 *   2. buildLayeredBriefing() wraps AvaWorldStateBuilder result
 */

import { describe, it, expect } from 'vitest';
import { AvaWorldStateBuilder } from '@/services/ava-world-state-builder.js';
import { buildLayeredBriefing } from '../../../../packages/mcp-server/plugins/automaker/tools/briefing.js';
import type { PMWorldStateBuilder } from '@/services/pm-world-state-builder.js';
import type { LeadEngineerWorldStateProvider } from '@/services/ava-world-state-builder.js';
import type { BriefingWorldStateProvider } from '../../../../packages/mcp-server/plugins/automaker/tools/briefing.js';
import type { PMWorldState } from '@protolabsai/types';
import { WorldStateDomain } from '@protolabsai/types';

// ─── Shared test fixtures ─────────────────────────────────────────────────────

const PM_SUMMARY =
  '_Last refreshed: 2026-01-01T00:00:00.000Z_\n\n## Project Status\n- **automaker**: active / production (3/5 milestones)\n\n## Milestone Progress\n- **Integration Wiring** `integration-wiring`: 2/4 phases (50%)\n\n## Upcoming Items\n- 2026-03-15 — Demo _(automaker)_';

const LE_SUMMARY =
  '**Engineering Execution**\n- Active projects: 1\n- Active features: 2\n- automaker: production / features in progress';

function makePMBuilder(override?: Partial<PMWorldStateBuilder>): PMWorldStateBuilder {
  const pmState: PMWorldState = {
    domain: WorldStateDomain.ProjectManagement,
    updatedAt: '2026-01-01T00:00:00.000Z',
    projects: {
      automaker: {
        slug: 'automaker',
        title: 'Automaker',
        status: 'active',
        phase: 'production',
        milestoneCount: 5,
        completedMilestones: 3,
      },
    },
    milestones: {
      'integration-wiring': {
        slug: 'integration-wiring',
        title: 'Integration Wiring',
        projectSlug: 'automaker',
        totalPhases: 4,
        completedPhases: 2,
      },
    },
    upcomingDeadlines: [
      { dueAt: '2026-03-15T00:00:00.000Z', label: 'Demo', projectSlug: 'automaker' },
    ],
    ceremonies: {},
  };

  return {
    getDistilledSummary: () => PM_SUMMARY,
    getState: () => pmState,
    ...override,
  } as unknown as PMWorldStateBuilder;
}

function makeLEProvider(
  override?: Partial<LeadEngineerWorldStateProvider>
): LeadEngineerWorldStateProvider {
  return {
    getWorldStateSummary: () => LE_SUMMARY,
    ...override,
  };
}

// ─── 1. AvaWorldStateBuilder ──────────────────────────────────────────────────

describe('AvaWorldStateBuilder.getFullBriefing() (three-layer aggregation)', () => {
  it('aggregates PM and LE summaries into a full briefing', async () => {
    const pm = makePMBuilder();
    const le = makeLEProvider();
    const builder = new AvaWorldStateBuilder(pm, le);

    const briefing = await builder.getFullBriefing();

    expect(briefing).toContain('# Ava Full Briefing');
    expect(briefing).toContain('## Project Management Layer');
    expect(briefing).toContain(PM_SUMMARY);
    expect(briefing).toContain('## Engineering Layer');
    expect(briefing).toContain(LE_SUMMARY);
    expect(briefing).toContain('## Strategic Context');
  });

  it('handles PM failure gracefully in full briefing', async () => {
    const pm = makePMBuilder({
      getDistilledSummary: () => {
        throw new Error('PM down');
      },
    });
    const le = makeLEProvider();
    const builder = new AvaWorldStateBuilder(pm, le);

    const briefing = await builder.getFullBriefing();

    expect(briefing).toContain('PM summary unavailable');
    expect(briefing).toContain(LE_SUMMARY);
  });

  it('handles LE failure gracefully in full briefing', async () => {
    const pm = makePMBuilder();
    const le = makeLEProvider({
      getWorldStateSummary: () => {
        throw new Error('LE down');
      },
    });
    const builder = new AvaWorldStateBuilder(pm, le);

    const briefing = await builder.getFullBriefing();

    expect(briefing).toContain(PM_SUMMARY);
    expect(briefing).toContain('Engineering summary unavailable');
  });
});

// ─── 2. buildLayeredBriefing (MCP briefing tool integration) ─────────────────

describe('buildLayeredBriefing() (/briefing returns layered world state)', () => {
  it('returns layered briefing markdown from world state provider', async () => {
    const pm = makePMBuilder();
    const le = makeLEProvider();
    const avaBuilder = new AvaWorldStateBuilder(pm, le);

    const provider: BriefingWorldStateProvider = {
      getFullBriefing: () => avaBuilder.getFullBriefing(),
    };

    const result = await buildLayeredBriefing(provider);

    expect(result.markdown).toContain('# Ava Full Briefing');
    expect(result.markdown).toContain(PM_SUMMARY);
    expect(result.markdown).toContain(LE_SUMMARY);
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].name).toBe('ava');
    expect(result.generatedAt).toBeTruthy();
  });

  it('returns fallback markdown when world state provider throws', async () => {
    const provider: BriefingWorldStateProvider = {
      getFullBriefing: async () => {
        throw new Error('provider failed');
      },
    };

    const result = await buildLayeredBriefing(provider);

    expect(result.markdown).toContain('World state unavailable');
    expect(result.layers).toHaveLength(1);
  });
});

// ─── 3. Full end-to-end chain ─────────────────────────────────────────────────

describe('Full chain: PM + LE status → distilled briefing', () => {
  it('verifies complete data flow from LE service call through to briefing output', async () => {
    // Step 1: Set up PM and LE service stubs
    const pm = makePMBuilder();
    const le = makeLEProvider();

    // Step 2: Answer distills back through AvaWorldStateBuilder
    const avaBuilder = new AvaWorldStateBuilder(pm, le);
    const fullBriefing = await avaBuilder.getFullBriefing();
    expect(fullBriefing).toContain(PM_SUMMARY);
    expect(fullBriefing).toContain(LE_SUMMARY);

    // Step 3: /briefing MCP tool returns layered world state
    const provider: BriefingWorldStateProvider = {
      getFullBriefing: () => avaBuilder.getFullBriefing(),
    };
    const layeredBriefing = await buildLayeredBriefing(provider);
    expect(layeredBriefing.markdown).toContain(PM_SUMMARY);
    expect(layeredBriefing.markdown).toContain(LE_SUMMARY);
    expect(layeredBriefing.layers[0].name).toBe('ava');
  });
});
