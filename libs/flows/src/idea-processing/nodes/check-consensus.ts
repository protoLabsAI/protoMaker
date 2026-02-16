/**
 * Check Consensus Node
 *
 * Reuses antagonistic review logic to determine if reviewers reached consensus.
 * Analyzes reviews to see if there's agreement on the verdict.
 */

import type { ReviewOutput } from './cross-review.js';

/**
 * State interface for check-consensus node
 */
export interface CheckConsensusState {
  reviews: ReviewOutput[];
  consensus?: boolean;
  consensusSummary?: string;
}

/**
 * Check Consensus Node - Determine if reviewers agree
 *
 * Reuses the antagonistic review logic:
 * - If all reviewers approve with no blockers, consensus = true
 * - If any reviewer blocks, consensus = false
 * - If mixed verdicts but no blockers, check confidence levels
 *
 * @param state - Node state containing review outputs
 * @returns Partial state with consensus result
 */
export async function checkConsensusNode(
  state: CheckConsensusState
): Promise<Partial<CheckConsensusState>> {
  const { reviews } = state;
  const nodeName = 'CheckConsensusNode';

  console.log(`[${nodeName}] Checking consensus across ${reviews.length} reviews`);

  if (!reviews || reviews.length === 0) {
    throw new Error(`[${nodeName}] No reviews available to check consensus`);
  }

  try {
    // Count verdicts
    const approvedCount = reviews.filter((r) => r.verdict === 'approved').length;
    const blockedCount = reviews.filter((r) => r.verdict === 'blocked').length;
    const concernsCount = reviews.filter((r) => r.verdict === 'concerns').length;

    // Count total blockers across all reviews
    const totalBlockers = reviews.reduce((sum, r) => sum + r.blockers.length, 0);

    // Calculate average confidence
    const avgConfidence = reviews.reduce((sum, r) => sum + r.confidence, 0) / reviews.length;

    // Determine consensus based on antagonistic review logic
    let consensus = false;
    let summary = '';

    if (blockedCount > 0 || totalBlockers > 0) {
      // Any blocks = no consensus
      consensus = false;
      summary = `Consensus not reached: ${blockedCount} blocked verdict(s), ${totalBlockers} blocker(s) identified`;
    } else if (approvedCount === reviews.length) {
      // All approved = consensus
      consensus = true;
      summary = `Consensus reached: All ${reviews.length} reviewers approved`;
    } else if (concernsCount > 0 && avgConfidence >= 0.7) {
      // Some concerns but high confidence = consensus
      consensus = true;
      summary = `Consensus reached: ${approvedCount} approved, ${concernsCount} with concerns but average confidence is high (${avgConfidence.toFixed(2)})`;
    } else {
      // Mixed verdicts with low confidence = no consensus
      consensus = false;
      summary = `Consensus not reached: Mixed verdicts (${approvedCount} approved, ${concernsCount} concerns) with moderate confidence (${avgConfidence.toFixed(2)})`;
    }

    console.log(`[${nodeName}] ${summary}`);

    return {
      consensus,
      consensusSummary: summary,
    };
  } catch (error) {
    console.error(`[${nodeName}] Failed:`, error);
    throw error;
  }
}
