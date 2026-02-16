/**
 * HITL Gate Node
 *
 * Determines if human-in-the-loop intervention is required based on:
 * - PreApproved threshold: both approved + zero blockers + confidence >= 0.8
 * - Emits proper events for flow interruption
 */

import type { ReviewOutput } from './cross-review.js';

/**
 * HITL decision result
 */
export interface HITLDecision {
  required: boolean;
  reason: string;
  preApproved?: boolean;
  confidence?: number;
}

/**
 * State interface for hitl-gate node
 */
export interface HITLGateState {
  reviews: ReviewOutput[];
  consensus?: boolean;
  hitlDecision?: HITLDecision;
  hitlFeedback?: string; // Set when resuming after human approval
}

/**
 * HITL Gate Node - Determine if human approval is needed
 *
 * PreApproved threshold (automatic approval, no HITL needed):
 * - All reviewers approved (no "concerns" or "blocked")
 * - Zero blockers across all reviews
 * - Average confidence >= 0.8
 *
 * If not pre-approved, HITL is required.
 *
 * @param state - Node state containing reviews and consensus
 * @returns Partial state with HITL decision
 */
export async function hitlGateNode(state: HITLGateState): Promise<Partial<HITLGateState>> {
  const { reviews, consensus } = state;
  const nodeName = 'HITLGateNode';

  console.log(`[${nodeName}] Evaluating HITL requirement`);

  if (!reviews || reviews.length === 0) {
    throw new Error(`[${nodeName}] No reviews available to evaluate`);
  }

  try {
    // Check pre-approval criteria
    const allApproved = reviews.every((r) => r.verdict === 'approved');
    const totalBlockers = reviews.reduce((sum, r) => sum + r.blockers.length, 0);
    const avgConfidence = reviews.reduce((sum, r) => sum + r.confidence, 0) / reviews.length;

    const meetsPreApprovalThreshold = allApproved && totalBlockers === 0 && avgConfidence >= 0.8;

    let decision: HITLDecision;

    if (meetsPreApprovalThreshold) {
      // Pre-approved: no HITL needed
      decision = {
        required: false,
        reason: `Pre-approved: All ${reviews.length} reviewers approved with ${avgConfidence.toFixed(2)} avg confidence and zero blockers`,
        preApproved: true,
        confidence: avgConfidence,
      };

      console.log(`[${nodeName}] ✓ Pre-approved, skipping HITL`);
    } else {
      // HITL required
      const reasons: string[] = [];
      if (!allApproved) {
        const approvedCount = reviews.filter((r) => r.verdict === 'approved').length;
        reasons.push(`Not all approved (${approvedCount}/${reviews.length} approved)`);
      }
      if (totalBlockers > 0) {
        reasons.push(`${totalBlockers} blocker(s) identified`);
      }
      if (avgConfidence < 0.8) {
        reasons.push(`Confidence below threshold (${avgConfidence.toFixed(2)} < 0.8)`);
      }

      decision = {
        required: true,
        reason: `HITL required: ${reasons.join('; ')}`,
        preApproved: false,
        confidence: avgConfidence,
      };

      console.log(`[${nodeName}] ⚠ HITL required: ${decision.reason}`);
    }

    // Emit event for flow monitoring
    console.log(`[${nodeName}] HITL decision:`, {
      required: decision.required,
      preApproved: decision.preApproved,
      confidence: decision.confidence,
      reason: decision.reason,
    });

    return { hitlDecision: decision };
  } catch (error) {
    console.error(`[${nodeName}] Failed:`, error);
    throw error;
  }
}

/**
 * Check if the gate should interrupt the flow
 *
 * This is used by the graph routing logic to determine if an interrupt is needed.
 *
 * @param state - Current state
 * @returns True if HITL is required and should interrupt
 */
export function shouldInterruptForHITL(state: HITLGateState): boolean {
  return state.hitlDecision?.required === true;
}
