/**
 * Antagonistic Review Node
 *
 * Quality gate for milestone summaries with max 2 revision iterations.
 * Currently uses deterministic heuristic — will be LLM-powered
 * when integrated into the server runtime.
 *
 * The LLM node will:
 * - Check for compelling narrative
 * - Verify lesson integration
 * - Assess actionability
 * - Ensure clarity and engagement
 */

import type { MilestoneSummaryState } from '../types.js';

const MAX_REVISIONS = 2;

/**
 * Deterministic review (mock)
 *
 * In production, this will be replaced with an LLM call using
 * antagonistic review patterns (similar to content-creation-flow).
 */
export async function antagonisticReview(
  state: MilestoneSummaryState
): Promise<Partial<MilestoneSummaryState>> {
  try {
    const { draftSummary, revisionCount } = state;

    if (!draftSummary) {
      return {
        reviewVerdict: 'revise',
        reviewFeedback: 'No draft summary found',
        revisionCount: revisionCount + 1,
      };
    }

    // Mock heuristic checks
    const hasOverview = draftSummary.includes('## Overview');
    const hasAchievements = draftSummary.includes('## Key Achievements');
    const hasLessons = draftSummary.includes('## Lessons Learned');
    const hasNextSteps = draftSummary.includes('## Next Steps');
    const hasMinimumLength = draftSummary.length > 200;

    const issues: string[] = [];
    if (!hasOverview) issues.push('Missing overview section');
    if (!hasAchievements) issues.push('Missing achievements section');
    if (!hasLessons) issues.push('Missing lessons learned section');
    if (!hasNextSteps) issues.push('Missing next steps section');
    if (!hasMinimumLength) issues.push('Summary too brief');

    // If we've hit max revisions, approve anyway
    if (revisionCount >= MAX_REVISIONS) {
      return {
        reviewVerdict: 'approve',
        reviewFeedback: 'Max revisions reached, proceeding with current draft',
      };
    }

    // If there are issues, request revision
    if (issues.length > 0) {
      return {
        reviewVerdict: 'revise',
        reviewFeedback: issues.join('; '),
        revisionCount: revisionCount + 1,
      };
    }

    // All checks passed
    return {
      reviewVerdict: 'approve',
      reviewFeedback: 'Summary meets quality standards',
    };
  } catch (err) {
    return {
      error: `Failed to review summary: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Routing function for conditional edge after review
 */
export function routeAfterReview(state: MilestoneSummaryState): string {
  return state.reviewVerdict === 'approve' ? 'format' : 'draft_summary';
}
