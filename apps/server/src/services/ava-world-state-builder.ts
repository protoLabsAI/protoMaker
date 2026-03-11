/**
 * Ava World State Builder
 *
 * Aggregates distilled summaries from the PM (PMWorldStateBuilder) and
 * Lead Engineer (LeadEngineerWorldStateProvider) layers. Adds strategic
 * context: team health, cross-project dependencies, brand/content status.
 * Exposes getFullBriefing() returning comprehensive briefing markdown.
 */

import { createLogger } from '@protolabsai/utils';
import type { AvaWorldState } from '@protolabsai/types';
import { WorldStateDomain } from '@protolabsai/types';
import type { PMWorldStateBuilder } from './pm-world-state-builder.js';

const logger = createLogger('AvaWorldStateBuilder');

// ────────────────────────── Interfaces ──────────────────────────

/**
 * Minimal interface for Lead Engineer service to provide a world state
 * summary. The concrete implementation is added to LeadEngineerService
 * by a separate feature.
 */
export interface LeadEngineerWorldStateProvider {
  getWorldStateSummary(): string;
}

/**
 * Minimal search interface for knowledge store queries.
 * Compatible with KnowledgeStoreService.search() and KnowledgeSearchService.search().
 */
export interface KnowledgeSearchProvider {
  search(
    projectPath: string,
    query: string,
    opts?: { domain?: string; maxResults?: number; maxTokens?: number }
  ): Promise<{ results: Array<{ chunk: { content: string; heading?: string } }> }>;
}

export interface AvaWorldStateBuilderConfig {
  /** Optional strategic directives or brand context to surface in briefing */
  strategicContext?: string;
  /**
   * Optional knowledge store search provider for querying both 'project' and
   * 'engineering' domains to enrich the Ava briefing with distilled insights.
   */
  knowledgeSearch?: KnowledgeSearchProvider;
  /**
   * Project path to use when querying the knowledge store.
   * Required when knowledgeSearch is provided.
   */
  knowledgeProjectPath?: string;
}

// ────────────────────────── Class ──────────────────────────

export class AvaWorldStateBuilder {
  private readonly log = logger;

  constructor(
    private readonly pmBuilder: PMWorldStateBuilder,
    private readonly leProvider: LeadEngineerWorldStateProvider,
    private readonly config: AvaWorldStateBuilderConfig = {}
  ) {}

  // ────────────────────────── Public API ──────────────────────────

  /**
   * Returns a comprehensive briefing markdown string aggregating:
   * - PM world state (projects, milestones, upcoming items)
   * - LE world state (features, agents, PR status)
   * - Strategic context (team health, cross-project deps, brand/content)
   * - Knowledge store insights (cross-domain query results from 'project' + 'engineering')
   */
  async getFullBriefing(): Promise<string> {
    const lines: string[] = [];
    const now = new Date().toISOString();

    lines.push('# Ava Full Briefing');
    lines.push(`_Generated: ${now}_`);
    lines.push('');

    // ── PM Layer ────────────────────────────────────────────────────
    lines.push('## Project Management Layer');
    lines.push('');
    try {
      const pmSummary = this.pmBuilder.getDistilledSummary();
      lines.push(pmSummary);
    } catch (err) {
      this.log.warn('Failed to get PM distilled summary:', err);
      lines.push('_PM summary unavailable_');
    }
    lines.push('');

    // ── LE Layer ────────────────────────────────────────────────────
    lines.push('## Engineering Layer');
    lines.push('');
    try {
      const leSummary = this.leProvider.getWorldStateSummary();
      lines.push(leSummary);
    } catch (err) {
      this.log.warn('Failed to get LE world state summary:', err);
      lines.push('_Engineering summary unavailable_');
    }
    lines.push('');

    // ── Knowledge Insights ───────────────────────────────────────────
    if (this.config.knowledgeSearch && this.config.knowledgeProjectPath) {
      lines.push('## Knowledge Insights');
      lines.push('');
      const insights = await this.getKnowledgeInsights(
        this.config.knowledgeSearch,
        this.config.knowledgeProjectPath
      );
      lines.push(insights);
      lines.push('');
    }

    // ── Strategic Context ───────────────────────────────────────────
    lines.push('## Strategic Context');
    lines.push('');

    // Team health
    const teamHealth = this.getTeamHealthSummary();
    lines.push('### Team Health');
    lines.push(teamHealth);
    lines.push('');

    // Cross-project dependencies
    const crossProjectDeps = this.getCrossProjectDependencies();
    lines.push('### Cross-Project Dependencies');
    if (crossProjectDeps.length === 0) {
      lines.push('_No cross-project dependencies detected_');
    } else {
      for (const dep of crossProjectDeps) {
        lines.push(`- ${dep}`);
      }
    }
    lines.push('');

    // Brand / content status
    lines.push('### Brand & Content');
    const brandStatus = this.getBrandContentStatus();
    lines.push(brandStatus);
    lines.push('');

    // Strategic directives (optional)
    if (this.config.strategicContext) {
      lines.push('### Strategic Directives');
      lines.push(this.config.strategicContext);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Build a structured AvaWorldState snapshot from current PM and LE data.
   */
  buildState(): AvaWorldState {
    return {
      domain: WorldStateDomain.Strategic,
      updatedAt: new Date().toISOString(),
      projectRollups: this.buildProjectRollups(),
      teamHealth: this.deriveTeamHealth(),
      strategicContext: this.config.strategicContext,
    };
  }

  // ────────────────────────── Private Helpers ──────────────────────────

  /**
   * Query the knowledge store across both 'project' and 'engineering' domains
   * and return a distilled markdown summary of the top results.
   *
   * Uses a broad status query that surfaces milestone completions, ceremony outcomes,
   * and recent engineering learnings.
   */
  private async getKnowledgeInsights(
    search: KnowledgeSearchProvider,
    projectPath: string
  ): Promise<string> {
    const sections: string[] = [];

    // Query project domain — milestone completions, ceremonies, timeline
    try {
      const { results: projectResults } = await search.search(
        projectPath,
        'milestone progress ceremony timeline deadline',
        { domain: 'project', maxResults: 5, maxTokens: 2000 }
      );

      if (projectResults.length > 0) {
        sections.push('### Project Knowledge');
        for (const r of projectResults) {
          const heading = r.chunk.heading ? `**${r.chunk.heading}**` : '_chunk_';
          // Trim content to first 300 chars for briefing
          const preview =
            r.chunk.content.length > 300
              ? r.chunk.content.slice(0, 300).trimEnd() + '…'
              : r.chunk.content;
          sections.push(`#### ${heading}`);
          sections.push(preview);
          sections.push('');
        }
      } else {
        sections.push('### Project Knowledge');
        sections.push('_No project knowledge chunks indexed yet_');
        sections.push('');
      }
    } catch (err) {
      this.log.warn('Knowledge search (domain=project) failed:', err);
      sections.push('### Project Knowledge');
      sections.push('_Project knowledge unavailable_');
      sections.push('');
    }

    // Query engineering domain — reflections, agent outputs, failure patterns
    try {
      const { results: engResults } = await search.search(
        projectPath,
        'engineering reflection learning failure pattern',
        { domain: 'engineering', maxResults: 5, maxTokens: 2000 }
      );

      if (engResults.length > 0) {
        sections.push('### Engineering Knowledge');
        for (const r of engResults) {
          const heading = r.chunk.heading ? `**${r.chunk.heading}**` : '_chunk_';
          const preview =
            r.chunk.content.length > 300
              ? r.chunk.content.slice(0, 300).trimEnd() + '…'
              : r.chunk.content;
          sections.push(`#### ${heading}`);
          sections.push(preview);
          sections.push('');
        }
      } else {
        sections.push('### Engineering Knowledge');
        sections.push('_No engineering knowledge chunks indexed yet_');
        sections.push('');
      }
    } catch (err) {
      this.log.warn('Knowledge search (domain=engineering) failed:', err);
      sections.push('### Engineering Knowledge');
      sections.push('_Engineering knowledge unavailable_');
      sections.push('');
    }

    return sections.join('\n');
  }

  /** Format team health as a markdown bullet list */
  private getTeamHealthSummary(): string {
    const health = this.deriveTeamHealth();
    const lines: string[] = [
      `- Active Agents: ${health.activeAgents}`,
      `- Escalations: ${health.escalations}`,
      `- Error Budget Exhausted: ${health.errorBudgetExhausted ? 'Yes ⚠️' : 'No ✅'}`,
    ];
    return lines.join('\n');
  }

  /** Derive team health metrics from available PM state */
  private deriveTeamHealth(): AvaWorldState['teamHealth'] {
    const pmState = this.pmBuilder.getState();
    const projectCount = Object.keys(pmState.projects).length;

    return {
      activeAgents: 0, // populated when LE provides active agent data
      escalations: 0,
      errorBudgetExhausted: projectCount === 0,
    };
  }

  /** Identify cross-project dependency signals from PM state */
  private getCrossProjectDependencies(): string[] {
    const pmState = this.pmBuilder.getState();
    const projectSlugs = Object.keys(pmState.projects);
    const deps: string[] = [];

    if (projectSlugs.length > 1) {
      deps.push(`${projectSlugs.length} active projects — review for shared dependencies`);
    }

    return deps;
  }

  /** Summarise brand/content status from upcoming PM deadlines */
  private getBrandContentStatus(): string {
    const pmState = this.pmBuilder.getState();
    const now = new Date().toISOString();

    const upcoming = pmState.upcomingDeadlines
      .filter((d) => d.dueAt >= now)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .slice(0, 3);

    if (upcoming.length === 0) {
      return '_No brand/content deadlines on the horizon_';
    }

    return upcoming
      .map((d) => `- ${d.dueAt.slice(0, 10)} — ${d.label} _(${d.projectSlug})_`)
      .join('\n');
  }

  /** Build per-project rollups from PM state */
  private buildProjectRollups(): AvaWorldState['projectRollups'] {
    const pmState = this.pmBuilder.getState();
    const rollups: AvaWorldState['projectRollups'] = {};

    for (const [slug, project] of Object.entries(pmState.projects)) {
      const openFeatures = project.milestoneCount - project.completedMilestones;
      rollups[slug] = {
        status: project.status,
        openFeatures: Math.max(0, openFeatures),
        blockers: 0, // detailed blocker data comes from LE layer
      };
    }

    return rollups;
  }
}
