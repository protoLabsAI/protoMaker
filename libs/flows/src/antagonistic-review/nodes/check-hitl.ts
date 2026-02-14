/**
 * Check HITL Node
 *
 * Determines whether human-in-the-loop intervention is required
 */

import type { AntagonisticReviewState } from '../state.js';

export async function checkHitl(
  state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  // This node just returns the current state
  // The routing logic will handle the interrupt
  return {};
}
