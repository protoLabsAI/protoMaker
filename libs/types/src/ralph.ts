/**
 * Ralph Mode Types - Persistent retry loops with external verification
 *
 * Ralph Mode is a "never give up" execution mode where the agent keeps retrying
 * until the feature is externally verified as complete. Named after the tenacious
 * pursuit of continuous improvement.
 */

/**
 * Types of completion criteria that can be checked
 */
export type CompletionCriteriaType =
  | 'tests_pass' // Run test suite and verify all pass
  | 'build_succeeds' // Run build command and verify success
  | 'lint_passes' // Run linter and verify no errors
  | 'typecheck_passes' // Run type checker and verify no errors
  | 'file_exists' // Check that a specific file exists
  | 'file_contains' // Check that a file contains specific content
  | 'command_succeeds' // Run arbitrary command and verify exit code 0
  | 'http_endpoint' // Check that an HTTP endpoint returns expected response
  | 'all_criteria'; // Meta-type: all configured criteria must pass

/**
 * A single completion criterion to verify
 */
export interface CompletionCriterion {
  type: CompletionCriteriaType;
  /** Human-readable name for this criterion */
  name: string;
  /** Whether this criterion is required for completion (default: true) */
  required?: boolean;
  /** Type-specific configuration */
  config?: {
    /** For file_exists/file_contains: path to check */
    filePath?: string;
    /** For file_contains: content to search for (string or regex pattern) */
    searchPattern?: string;
    /** For command_succeeds: command to run */
    command?: string;
    /** For command_succeeds: working directory (default: worktree path) */
    cwd?: string;
    /** For command_succeeds: timeout in ms (default: 120000) */
    timeout?: number;
    /** For http_endpoint: URL to check */
    url?: string;
    /** For http_endpoint: expected status code (default: 200) */
    expectedStatus?: number;
    /** For http_endpoint: expected response body contains */
    expectedBodyContains?: string;
  };
}

/**
 * Result of checking a single criterion
 */
export interface CriterionCheckResult {
  criterion: CompletionCriterion;
  passed: boolean;
  /** Details about the check (output, error message, etc.) */
  details: string;
  /** Duration of the check in milliseconds */
  durationMs: number;
}

/**
 * Result of a full verification check
 */
export interface VerificationResult {
  /** Whether all required criteria passed */
  allPassed: boolean;
  /** Individual criterion results */
  results: CriterionCheckResult[];
  /** Total duration of verification in milliseconds */
  totalDurationMs: number;
  /** Timestamp when verification completed */
  verifiedAt: string;
}

/**
 * Categories of failures to help the agent understand what went wrong (Ralph-specific)
 */
export type RalphFailureCategory =
  | 'test_failure' // Tests failed
  | 'build_error' // Build failed
  | 'lint_error' // Linting issues
  | 'type_error' // TypeScript errors
  | 'runtime_error' // Code crashed at runtime
  | 'missing_file' // Expected file not found
  | 'content_mismatch' // File doesn't contain expected content
  | 'timeout' // Operation timed out
  | 'network_error' // Network/HTTP issues
  | 'unknown'; // Unclassified error

/**
 * Analysis of a failure to help the agent improve (Ralph-specific)
 */
export interface RalphFailureAnalysis {
  category: RalphFailureCategory;
  /** Brief summary of what failed */
  summary: string;
  /** Detailed error output/message */
  details: string;
  /** Suggested recovery actions for the agent */
  suggestedActions: string[];
  /** Files that might be relevant to the failure */
  relevantFiles?: string[];
}

/**
 * Record of a single iteration in the Ralph loop
 */
export interface RalphIteration {
  /** Iteration number (1-indexed) */
  iterationNumber: number;
  /** When this iteration started */
  startedAt: string;
  /** When this iteration ended (agent completed + verification) */
  endedAt?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Verification result for this iteration */
  verification?: VerificationResult;
  /** Failure analysis if verification failed */
  failureAnalysis?: RalphFailureAnalysis;
  /** Agent's summary of what was done this iteration */
  agentSummary?: string;
  /** Token usage for this iteration */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Status of a Ralph loop
 */
export type RalphLoopStatus =
  | 'idle' // Not started
  | 'running' // Currently executing
  | 'verifying' // Agent done, running verification
  | 'verified' // All criteria passed - SUCCESS
  | 'paused' // Temporarily paused (manual or due to errors)
  | 'stopped' // Manually stopped
  | 'max_iterations_reached' // Hit iteration limit without success
  | 'error'; // Unrecoverable error

/**
 * Configuration for a Ralph loop
 */
export interface RalphLoopConfig {
  /** Maximum number of iterations before giving up (default: 10) */
  maxIterations?: number;
  /** Delay between iterations in milliseconds (default: 5000) */
  iterationDelayMs?: number;
  /** Completion criteria to verify after each iteration */
  completionCriteria: CompletionCriterion[];
  /** Whether to include failure analysis in the agent's context (default: true) */
  includeFailureAnalysisInContext?: boolean;
  /** Whether to include previous iteration summaries in context (default: true) */
  includePreviousIterationsInContext?: boolean;
  /** Maximum number of previous iterations to include in context (default: 3) */
  maxPreviousIterationsInContext?: number;
  /** Custom prompt additions for Ralph mode */
  customPromptAdditions?: string;
}

/**
 * Full state of a Ralph loop for a feature
 */
export interface RalphLoopState {
  /** Feature ID this loop is for */
  featureId: string;
  /** Project path */
  projectPath: string;
  /** Current status */
  status: RalphLoopStatus;
  /** Configuration for this loop */
  config: RalphLoopConfig;
  /** All iterations so far */
  iterations: RalphIteration[];
  /** Current iteration number (0 if not started) */
  currentIteration: number;
  /** When the loop started */
  startedAt?: string;
  /** When the loop ended (success, stopped, or max iterations) */
  endedAt?: string;
  /** Total duration in milliseconds */
  totalDurationMs?: number;
  /** Last error if status is 'error' */
  lastError?: string;
  /** Abort controller ID for cancellation */
  abortControllerId?: string;
}

/**
 * Ralph mode configuration stored on a Feature
 */
export interface FeatureRalphConfig {
  /** Whether Ralph mode is enabled for this feature */
  enabled: boolean;
  /** Ralph loop configuration */
  config?: RalphLoopConfig;
  /** Current Ralph loop state (if running or completed) */
  loopState?: RalphLoopState;
}

/**
 * Default completion criteria for common scenarios
 */
export const DEFAULT_COMPLETION_CRITERIA: CompletionCriterion[] = [
  { type: 'lint_passes', name: 'Lint Check', required: true },
  { type: 'typecheck_passes', name: 'Type Check', required: true },
  { type: 'tests_pass', name: 'Test Suite', required: true },
  { type: 'build_succeeds', name: 'Build', required: true },
];

/**
 * Default Ralph loop configuration
 */
export const DEFAULT_RALPH_CONFIG: RalphLoopConfig = {
  maxIterations: 10,
  iterationDelayMs: 5000,
  completionCriteria: DEFAULT_COMPLETION_CRITERIA,
  includeFailureAnalysisInContext: true,
  includePreviousIterationsInContext: true,
  maxPreviousIterationsInContext: 3,
};

/**
 * Event types for Ralph mode
 */
export type RalphEventType =
  | 'ralph:started' // Loop started
  | 'ralph:iteration_started' // New iteration beginning
  | 'ralph:iteration_completed' // Iteration finished (agent done)
  | 'ralph:verification_started' // Verification checks starting
  | 'ralph:verification_completed' // Verification finished
  | 'ralph:verified' // All criteria passed - SUCCESS
  | 'ralph:paused' // Loop paused
  | 'ralph:resumed' // Loop resumed
  | 'ralph:stopped' // Loop stopped manually
  | 'ralph:max_iterations' // Max iterations reached
  | 'ralph:error' // Error occurred
  | 'ralph:progress'; // General progress update

/**
 * Payload for Ralph events
 */
export interface RalphEventPayload {
  featureId: string;
  projectPath: string;
  eventType: RalphEventType;
  loopState: RalphLoopState;
  /** Additional message for the event */
  message?: string;
  /** Current iteration details (for iteration events) */
  currentIteration?: RalphIteration;
  /** Verification result (for verification events) */
  verificationResult?: VerificationResult;
  /** Failure analysis (for failed verifications) */
  failureAnalysis?: RalphFailureAnalysis;
}
