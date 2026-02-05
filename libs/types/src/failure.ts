/**
 * Failure analysis types for self-healing agent system
 */

/**
 * Categories of failures that can occur during agent execution.
 * Used to classify failures and determine appropriate recovery strategies.
 */
export type FailureCategory =
  | 'transient' // Temporary failures (network issues, timeouts)
  | 'rate_limit' // API rate limiting
  | 'quota' // API quota/usage limits exhausted
  | 'validation' // Input/output validation failures
  | 'tool_error' // Tool execution failures
  | 'test_failure' // Test suite failures
  | 'merge_conflict' // Git merge conflicts
  | 'dependency' // Missing or incompatible dependencies
  | 'unknown'; // Unclassified failures

/**
 * Analysis of a failure that occurred during agent execution.
 * Provides structured information for determining recovery actions.
 */
export interface FailureAnalysis {
  /** The classified category of the failure */
  category: FailureCategory;
  /** Human-readable description of what failed */
  message: string;
  /** Whether this failure is potentially recoverable */
  recoverable: boolean;
  /** Suggested delay before retry (in milliseconds), if applicable */
  retryDelayMs?: number;
  /** Maximum number of retry attempts recommended */
  maxRetries?: number;
  /** The original error that caused this failure */
  originalError?: unknown;
  /** Additional context about the failure */
  context?: Record<string, unknown>;
  /** Timestamp when the failure occurred */
  timestamp: string;
}

/**
 * A strategy for recovering from a specific type of failure.
 */
export interface RecoveryStrategy {
  /** The failure category this strategy handles */
  category: FailureCategory;
  /** Human-readable name of the recovery strategy */
  name: string;
  /** Description of what this strategy does */
  description: string;
  /** Whether this strategy requires human intervention */
  requiresHumanIntervention: boolean;
  /** Suggested actions to take for recovery */
  actions: string[];
}
