/**
 * Ava Tools — PM Project Query Service
 *
 * Provides the PM-backed project status query capability for Ava's chat context.
 *
 * Flow:
 *   user asks Ava
 *     → Ava invokes PMProjectQueryService (PM subagent role)
 *       → PM assembles world state from PMWorldStateBuilder
 *       → PM queries LE execution state via service call
 *             (NOT a subagent — Claude Agent SDK single-level limit)
 *     → distilled answer returned to Ava for relay to user
 *
 * The PM subagent queries LE via direct service call to work within the
 * SDK's single-level subagent constraint.
 */

import { createLogger } from '@protolabsai/utils';
import type { PMWorldStateBuilder } from './pm-world-state-builder.js';
import type { LeadEngineerWorldStateProvider } from './ava-world-state-builder.js';

const logger = createLogger('AvaTools');

// ────────────────────────── Result Types ──────────────────────────

/**
 * Distilled project status result produced by the PM subagent.
 * Aggregates PM world state + LE execution state for Ava to relay.
 */
export interface AvaProjectStatusResult {
  /** Distilled summary of current project status (markdown) */
  summary: string;
  /** PM layer distilled summary (projects, milestones, upcoming deadlines) */
  pmSummary: string;
  /** LE layer world state summary (execution status, active features) */
  leSummary: string;
  /** ISO timestamp of when this status was generated */
  generatedAt: string;
}

// ────────────────────────── Service ──────────────────────────

/**
 * PM Project Query Service
 *
 * Implements the Ava → PM → LE query chain for project status queries.
 *
 * When Ava receives a project-status question, she delegates to this service
 * which plays the "PM subagent" role: it assembles PM world state and queries
 * the LE layer via service call (not a nested subagent).
 *
 * Example usage:
 * ```typescript
 * const pmQueryService = new PMProjectQueryService(pmBuilder, leProvider);
 * const result = await pmQueryService.queryProjectStatus();
 * // relay result.summary back to user via Ava
 * ```
 */
export class PMProjectQueryService {
  private readonly log = logger;

  constructor(
    private readonly pmBuilder: PMWorldStateBuilder,
    private readonly leProvider: LeadEngineerWorldStateProvider
  ) {}

  /**
   * Query current project status by aggregating PM world state and LE execution state.
   *
   * PM layer provides: project status, milestone progress, upcoming deadlines.
   * LE layer provides: active feature execution state, flow status.
   *
   * LE is queried via service call — NOT a subagent (SDK single-level limit).
   *
   * @returns AvaProjectStatusResult with distilled summary for Ava to relay
   */
  async queryProjectStatus(): Promise<AvaProjectStatusResult> {
    const generatedAt = new Date().toISOString();

    // ── PM Layer ─────────────────────────────────────────────────────────────
    let pmSummary: string;
    try {
      pmSummary = this.pmBuilder.getDistilledSummary();
    } catch (err) {
      this.log.warn('PMProjectQueryService: failed to get PM distilled summary', err);
      pmSummary = '_PM summary unavailable_';
    }

    // ── LE Layer (service call, not subagent) ────────────────────────────────
    let leSummary: string;
    try {
      leSummary = this.leProvider.getWorldStateSummary();
    } catch (err) {
      this.log.warn('PMProjectQueryService: failed to get LE world state summary', err);
      leSummary = '_Engineering status unavailable_';
    }

    const summary = this.buildDistilledAnswer(pmSummary, leSummary);

    return { summary, pmSummary, leSummary, generatedAt };
  }

  /**
   * Build a distilled markdown answer from PM + LE summaries.
   * Formats both layers into a unified project status report.
   */
  private buildDistilledAnswer(pmSummary: string, leSummary: string): string {
    const lines: string[] = [
      '## Project Status',
      '',
      '### PM Layer (Project Management)',
      '',
      pmSummary,
      '',
      '### LE Layer (Engineering Execution)',
      '',
      leSummary,
    ];
    return lines.join('\n');
  }
}
