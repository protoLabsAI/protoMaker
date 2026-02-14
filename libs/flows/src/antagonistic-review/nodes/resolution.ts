/**
 * Resolution Node
 *
 * Resolves disagreements between reviewers when consensus is not reached
 */

import type { AntagonisticReviewState } from '../state.js';

export async function resolution(
  state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  const { avaReview, jonReview } = state;

  if (!avaReview || !jonReview) {
    throw new Error('Both reviews must be completed before resolution');
  }

  // Simple resolution logic: if either reviewer blocks, final verdict is block
  // Otherwise, use the more conservative verdict
  let finalVerdict: 'approve' | 'concern' | 'block';

  if (avaReview.overallVerdict === 'block' || jonReview.overallVerdict === 'block') {
    finalVerdict = 'block';
  } else if (avaReview.overallVerdict === 'concern' || jonReview.overallVerdict === 'concern') {
    finalVerdict = 'concern';
  } else {
    finalVerdict = 'approve';
  }

  return {
    finalVerdict,
  };
}
