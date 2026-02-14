/**
 * Review Quality Node
 *
 * Applies quality checks to the generated report.
 * Currently uses heuristic validation — will be enhanced with
 * antagonistic review subgraph for LLM-powered quality assessment.
 *
 * Quality checks:
 * 1. Report completeness (all sections present)
 * 2. Metrics consistency (numbers add up)
 * 3. Recommendation quality (actionable, specific)
 * 4. Risk coverage (no obvious gaps)
 */

import type { ProjectStatusState } from '../types.js';

/** Maximum revision iterations before force-approving */
const MAX_REVISIONS = 2;

/**
 * Review quality node — deterministic quality gate
 */
export async function reviewQuality(
  state: ProjectStatusState
): Promise<Partial<ProjectStatusState>> {
  if (state.error || !state.statusReport) {
    // Auto-approve on error to avoid infinite revision loop
    return { reviewVerdict: 'approve' };
  }

  const report = state.statusReport;
  const issues: string[] = [];

  // Check 1: Report completeness
  if (!report.summary || report.summary.length < 20) {
    issues.push('Summary is too short — needs more context');
  }

  if (report.recommendations.length === 0) {
    issues.push('No recommendations — every report should have actionable next steps');
  }

  // Check 2: Metrics consistency
  const board = report.metrics.board;
  const statusTotal = Object.values(board.byStatus).reduce((sum, count) => sum + count, 0);
  if (statusTotal > 0 && Math.abs(statusTotal - board.totalFeatures) > board.totalFeatures * 0.1) {
    issues.push(
      `Status counts (${statusTotal}) don't match total features (${board.totalFeatures})`
    );
  }

  // Check 3: Risk coverage
  if (report.risks.length === 0 && report.analysis.health !== 'on-track') {
    issues.push(
      'No risks identified despite non-healthy status — risk assessment may be incomplete'
    );
  }

  // Check 4: Health consistency
  if (report.analysis.health === 'on-track' && report.analysis.bottlenecks.length > 2) {
    issues.push(
      'Health is on-track but 3+ bottlenecks identified — health assessment may be too optimistic'
    );
  }

  // Decide: approve or revise
  if (issues.length === 0 || state.revisionCount >= MAX_REVISIONS) {
    return {
      reviewVerdict: 'approve',
      reviewFeedback:
        issues.length > 0
          ? `Approved after ${MAX_REVISIONS} revisions. Remaining issues: ${issues.join('; ')}`
          : 'Report passes all quality checks.',
    };
  }

  return {
    reviewVerdict: 'revise',
    reviewFeedback: `Quality issues found: ${issues.join('; ')}`,
    revisionCount: state.revisionCount + 1,
  };
}

/**
 * Route after quality review
 */
export function routeAfterReview(state: ProjectStatusState): string {
  if (state.reviewVerdict === 'approve') {
    return 'format_output';
  }
  return 'generate_report';
}
