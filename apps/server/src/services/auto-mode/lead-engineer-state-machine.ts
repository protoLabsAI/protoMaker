/**
 * Lead Engineer State Machine
 *
 * Defines valid state transitions for the feature lifecycle managed by the
 * Lead Engineer service.
 *
 * Flow:
 * INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → VERIFY → DONE
 *
 * Short-circuits:
 * - Any state can → ESCALATE (on critical errors or max retries)
 * - VERIFY → ESCALATE (on verification failure)
 */

import { FeatureState } from '@protolabsai/types';

/**
 * Valid transitions map: fromState → Set of allowed toStates
 */
export const STATE_TRANSITIONS: ReadonlyMap<FeatureState, ReadonlySet<FeatureState>> = new Map([
  [FeatureState.INTAKE, new Set([FeatureState.PLAN, FeatureState.ESCALATE])],
  [FeatureState.PLAN, new Set([FeatureState.EXECUTE, FeatureState.ESCALATE])],
  [FeatureState.EXECUTE, new Set([FeatureState.REVIEW, FeatureState.ESCALATE])],
  [FeatureState.REVIEW, new Set([FeatureState.MERGE, FeatureState.EXECUTE, FeatureState.ESCALATE])],
  [FeatureState.MERGE, new Set([FeatureState.DEPLOY, FeatureState.ESCALATE])],
  [FeatureState.DEPLOY, new Set([FeatureState.VERIFY, FeatureState.ESCALATE])],
  [FeatureState.VERIFY, new Set([FeatureState.DONE, FeatureState.ESCALATE])],
  [FeatureState.DONE, new Set()],
  [
    FeatureState.ESCALATE,
    new Set([
      FeatureState.INTAKE,
      FeatureState.PLAN,
      FeatureState.EXECUTE,
      FeatureState.REVIEW,
      FeatureState.MERGE,
      FeatureState.DEPLOY,
      FeatureState.VERIFY,
    ]),
  ],
]);

/**
 * Check whether a transition from one state to another is valid.
 */
export function isValidTransition(from: FeatureState, to: FeatureState): boolean {
  const allowed = STATE_TRANSITIONS.get(from);
  return allowed !== undefined && allowed.has(to);
}

/**
 * Get all valid next states from a given state.
 */
export function getAllowedTransitions(from: FeatureState): FeatureState[] {
  const allowed = STATE_TRANSITIONS.get(from);
  return allowed ? Array.from(allowed) : [];
}
