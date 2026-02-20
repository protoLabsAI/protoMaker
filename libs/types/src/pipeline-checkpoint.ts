/**
 * Pipeline Checkpoint types
 *
 * Checkpoint/resume support for the feature state machine.
 * Enables crash recovery by persisting state after each successful transition.
 */

import type { FeatureState } from './lead-engineer.js';

/**
 * Result of evaluating a goal gate before/after a state transition.
 */
export interface GoalGateResult {
  /** Unique gate identifier (e.g., "execute-exit", "review-entry") */
  gateId: string;
  /** State being gated */
  state: string;
  /** Whether the gate passed */
  passed: boolean;
  /** Human-readable reason for the result */
  reason: string;
  /** State to retry from on failure (optional — defaults to ESCALATE) */
  retryTarget?: string;
}

/**
 * Serializable checkpoint of a feature's pipeline state.
 * Saved after each successful state transition for crash recovery.
 */
export interface PipelineCheckpoint {
  /** Feature being processed */
  featureId: string;
  /** Project path */
  projectPath: string;
  /** Current state machine state */
  currentState: FeatureState;
  /** Serialized StateContext (retryCount, planOutput, prNumber, etc.) */
  stateContext: Record<string, unknown>;
  /** States that have been completed */
  completedStates: string[];
  /** Goal gate evaluation history */
  goalGateResults: GoalGateResult[];
  /** ISO 8601 timestamp of last checkpoint */
  timestamp: string;
  /** Schema version for forward compatibility */
  version: 1;
}
