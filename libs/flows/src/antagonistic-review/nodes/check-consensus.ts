/**
 * Check Consensus Node
 *
 * Compares verdicts from Ava and Jon to determine if there's consensus.
 * If both approve, consensus is true and resolution can be skipped.
 */

import type { AntagonisticReviewState } from '../state.js';

export async function checkConsensus(
  state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  const { avaReview, jonReview } = state;

  if (!avaReview || !jonReview) {
    throw new Error('Both reviews must be completed before checking consensus');
  }

  // Consensus exists when both reviewers have the same overall verdict
  const consensus = avaReview.overallVerdict === jonReview.overallVerdict;

  // If both approve, we can skip resolution
  const bothApprove =
    avaReview.overallVerdict === 'approve' && jonReview.overallVerdict === 'approve';

  return {
    consensus,
    // Set finalVerdict if both approve
    ...(bothApprove && { finalVerdict: 'approve' as const }),
  };
}
