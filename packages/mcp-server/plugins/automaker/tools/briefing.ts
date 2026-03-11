/**
 * Briefing Tool — Layered World State Briefing
 *
 * Extends the /briefing MCP endpoint with layered world state from all three layers:
 *   Layer 1 — Ava (strategic): cross-project rollups, team health, brand/content status
 *   Layer 2 — PM (project management): project status, milestone progress, upcoming deadlines
 *   Layer 3 — LE (engineering execution): active features, agent state, PR status
 *
 * Usage: build a BriefingWorldStateProvider backed by AvaWorldStateBuilder and
 * call buildLayeredBriefing() to get enriched world state alongside the event digest.
 *
 * This module is framework-agnostic — no direct imports from apps/server.
 * The caller wires in a BriefingWorldStateProvider implementation.
 */

// ────────────────────────── Interfaces ──────────────────────────

/**
 * Provider interface that wraps AvaWorldStateBuilder.
 * Implement this with a real AvaWorldStateBuilder instance in production.
 */
export interface BriefingWorldStateProvider {
  /** Get the full layered briefing markdown from AvaWorldStateBuilder */
  getFullBriefing(): Promise<string>;
}

// ────────────────────────── Result Types ──────────────────────────

/** A single named layer of the briefing (Ava, PM, or LE) */
export interface BriefingLayer {
  /** Layer identifier: 'ava' | 'pm' | 'le' */
  name: string;
  /** Markdown summary for this layer */
  summary: string;
}

/**
 * Full layered briefing result returned by buildLayeredBriefing().
 * Contains the complete aggregated markdown plus individual layer summaries.
 */
export interface LayeredBriefingResult {
  /** Full briefing markdown aggregating all three world state layers */
  markdown: string;
  /** Individual layer summaries (one per layer) */
  layers: BriefingLayer[];
  /** ISO timestamp of when this briefing was generated */
  generatedAt: string;
}

// ────────────────────────── Functions ──────────────────────────

/**
 * Build a layered world state briefing.
 *
 * Aggregates data from all three world state layers via BriefingWorldStateProvider
 * (backed by AvaWorldStateBuilder in production, or a stub in tests).
 *
 * @param provider - Backed by AvaWorldStateBuilder; provides getFullBriefing()
 * @returns LayeredBriefingResult with markdown and layer breakdown
 */
export async function buildLayeredBriefing(
  provider: BriefingWorldStateProvider
): Promise<LayeredBriefingResult> {
  const generatedAt = new Date().toISOString();

  let markdown: string;
  try {
    markdown = await provider.getFullBriefing();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    markdown = `# Briefing\n\n_World state unavailable: ${msg}_`;
  }

  // Expose the aggregated markdown as the Ava layer (AvaWorldStateBuilder covers all 3)
  const layers: BriefingLayer[] = [{ name: 'ava', summary: markdown }];

  return { markdown, layers, generatedAt };
}

// ────────────────────────── MCP Tool Definition ──────────────────────────

/**
 * MCP tool definition for the world-state-enriched briefing.
 *
 * Supplements the existing get_briefing (event digest) with layered world state
 * from AvaWorldStateBuilder. Register alongside get_briefing in the MCP server.
 */
export const BRIEFING_WORLD_STATE_TOOL = {
  name: 'get_briefing_world_state',
  description:
    'Get a comprehensive world state briefing from all three layers: ' +
    'Ava (strategic), PM (project management), and LE (engineering execution). ' +
    'Returns layered markdown with project rollups, milestone progress, ' +
    'engineering execution state, team health, and strategic context. ' +
    'Use this at session start for a full situational picture beyond the event digest.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectPath: {
        type: 'string',
        description: 'Absolute path to the project directory',
      },
    },
    required: ['projectPath'],
  },
} as const;
