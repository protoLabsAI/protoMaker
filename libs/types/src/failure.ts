/**
 * Failure classification and recovery strategy types
 *
 * Enhanced failure taxonomy with recovery strategies for the self-healing system.
 * Extends the basic ErrorType classification with more specific categories and
 * associated recovery actions.
 */

/**
 * Detailed failure categories for enhanced error classification
 */
export type FailureCategory =
  | 'transient' // Network, timeout - retry immediately
  | 'rate_limit' // API throttle - exponential backoff
  | 'quota' // Usage limit - pause and notify
  | 'validation' // Bad input - needs human review
  | 'tool_error' // Tool failed - try alternative approach
  | 'test_failure' // Tests failed - retry with fixes
  | 'merge_conflict' // Git conflict - needs resolution
  | 'dependency' // Missing dep - attempt auto-install
  | 'authentication' // Auth error - needs credential fix
  | 'retry_exhausted' // Agent exhausted retries - escalate to human
  | 'unknown'; // Unclassified - escalate

/**
 * Recovery strategy types with their specific configurations
 */
export type RecoveryStrategy =
  | { type: 'retry'; delay: number }
  | { type: 'retry_with_context'; context: string; delay: number }
  | { type: 'alternative_approach'; suggestion: string }
  | { type: 'rollback_and_retry' }
  | { type: 'escalate_to_user'; reason: string }
  | { type: 'pause_and_wait'; duration: number; reason: string };

/**
 * Analysis of a failure with recovery recommendations
 */
export interface FailureAnalysis {
  /** The classified failure category */
  category: FailureCategory;
  /** Whether automatic retry is possible */
  isRetryable: boolean;
  /** Suggested delay in milliseconds before retry */
  suggestedDelay: number;
  /** Maximum number of retries allowed for this failure type */
  maxRetries: number;
  /** The recommended recovery strategy */
  recoveryStrategy: RecoveryStrategy;
  /** Context to preserve for retry attempts */
  contextToPreserve: string[];
  /** Human-readable explanation of the failure */
  explanation: string;
  /** Original error information */
  originalError: string;
  /** Current retry count */
  currentRetryCount: number;
}

/**
 * Result of a recovery attempt
 */
export interface RecoveryResult {
  /** Whether recovery was successful */
  success: boolean;
  /** Whether the feature should be retried after this recovery */
  shouldRetry: boolean;
  /** Additional context for the retry attempt */
  retryContext?: string;
  /** Reason if recovery failed */
  failureReason?: string;
  /** Action that was taken */
  actionTaken: string;
}

/**
 * Execution context for failure analysis
 */
export interface ExecutionContext {
  /** The feature ID being executed */
  featureId: string;
  /** The project path */
  projectPath: string;
  /** Worktree path if applicable */
  worktreePath?: string;
  /** Current retry count */
  retryCount: number;
  /** Previous error messages for context */
  previousErrors: string[];
  /** Agent output collected so far */
  agentOutput?: string;
  /** Time feature has been running in ms */
  runningTime: number;
}

/**
 * Configuration for recovery behavior
 */
export interface RecoveryConfig {
  /** Enable automatic recovery attempts */
  enabled: boolean;
  /** Maximum retries for transient errors */
  maxTransientRetries: number;
  /** Maximum retries for test failures */
  maxTestFailureRetries: number;
  /** Base delay for exponential backoff (ms) */
  baseDelayMs: number;
  /** Maximum delay for exponential backoff (ms) */
  maxDelayMs: number;
  /** Enable context accumulation for retries */
  preserveContext: boolean;
}

/**
 * Default recovery configuration
 */
export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  enabled: true,
  maxTransientRetries: 3,
  maxTestFailureRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  preserveContext: true,
};
