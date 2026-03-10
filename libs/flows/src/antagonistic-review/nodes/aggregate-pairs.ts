/**
 * Aggregate Pairs Node
 *
 * Collects pair review results from parallel execution.
 * The pairReviews array is automatically populated via appendReducer
 * as each pair review subgraph completes.
 *
 * This node simply validates that results were collected and
 * passes control to the next phase (consolidation).
 */

import { createLogger } from '@protolabsai/utils';
import type { AntagonisticReviewState } from '../state.js';

const logger = createLogger('aggregate-pairs');

/**
 * Aggregate node that validates pair review collection
 *
 * Since pairReviews uses appendReducer, results are automatically
 * collected from parallel Send() executions. This node validates
 * the results and logs summary information.
 *
 * @param state - Current antagonistic review state with collected pairReviews
 * @returns Empty state update (pairReviews already aggregated by reducer)
 */
export async function aggregatePairs(
  state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  const { pairReviews } = state;

  logger.info(`[AggregatePairs] Collected ${pairReviews.length} pair review(s)`);

  // Log summary of collected reviews
  for (const review of pairReviews) {
    logger.info(
      `[AggregatePairs] - ${review.section}: consensus=${review.consensus}, verdict=${review.agreedVerdict}`
    );
  }

  // Validation: ensure all collected reviews have required fields
  for (const review of pairReviews) {
    if (!review.section || !review.consolidatedComments) {
      logger.warn(`[AggregatePairs] Warning: Incomplete review for section ${review.section}`);
    }
  }

  // No state updates needed - pairReviews already populated via appendReducer
  return {};
}
