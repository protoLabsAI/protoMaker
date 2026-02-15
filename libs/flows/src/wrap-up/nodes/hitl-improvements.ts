/**
 * HITL Improvements Checkpoint
 *
 * Processes the HITL response for proposed improvements.
 * Trust boundary auto-pass skips the checkpoint when configured.
 */

import type { WrapUpState } from '../types.js';

/**
 * Router: determines next node based on HITL response or trust boundary.
 */
export function improvementsHitlRouter(state: WrapUpState): string {
  // Trust boundary auto-pass
  if (state.trustBoundaryResult === 'autoApprove') {
    return 'route_improvements';
  }

  const response = state.hitlResponse;

  if (!response) {
    // No response — default to approve
    return 'route_improvements';
  }

  if (response.decision === 'cancel') {
    return 'done';
  }

  if (response.decision === 'revise') {
    return 'propose_improvements';
  }

  // approve
  return 'route_improvements';
}

/**
 * Processor: updates stage after HITL checkpoint.
 */
export async function hitlImprovementsProcessor(state: WrapUpState): Promise<Partial<WrapUpState>> {
  return {
    stage: 'improvement_review',
  };
}
