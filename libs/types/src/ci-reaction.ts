/**
 * CI Reaction Engine types
 *
 * Types for CI failure detection, remediation budget enforcement,
 * and per-class retry configuration.
 */

/**
 * Settings for CI reaction behavior and split remediation budgets.
 * Controls how many times each remediation class (CI vs review) can run,
 * and enforces a hard cap on total combined cycles.
 */
export interface CIReactionSettings {
  /**
   * Maximum number of CI failure remediation cycles allowed.
   * When ciRemediationCount reaches this limit, further CI remediations are
   * blocked and the feature receives a CI-specific exhaustion message.
   * Default: 2
   */
  maxCiRemediationCycles: number;

  /**
   * Maximum number of PR review feedback remediation cycles allowed.
   * When reviewRemediationCount reaches this limit, further review remediations
   * are blocked and the feature receives a review-specific exhaustion message.
   * Default: 2
   */
  maxReviewRemediationCycles: number;

  /**
   * Hard cap on total remediation cycles (CI + review combined).
   * Enforced regardless of per-class counts — if total cycles (ciRemediationCount
   * + reviewRemediationCount) reaches this cap, all further remediation is blocked.
   * Default: 4 (matches legacy MAX_TOTAL_REMEDIATION_CYCLES)
   */
  maxTotalRemediationCycles: number;
}

/**
 * Result of a remediation budget check.
 * Returned by RemediationBudgetEnforcer to indicate whether a remediation
 * can proceed and, if not, the reason it was blocked.
 */
export interface RemediationBudgetCheckResult {
  /** Whether the remediation is allowed to proceed */
  allowed: boolean;
  /** Human-readable message explaining the result (especially on block) */
  message: string;
  /**
   * Which budget was exhausted (if blocked).
   * - 'ci': CI per-class limit reached
   * - 'review': review per-class limit reached
   * - 'total': hard total cap reached
   * - undefined: not blocked
   */
  exhaustedBudget?: 'ci' | 'review' | 'total';
}

/**
 * Input for a remediation budget check.
 */
export interface RemediationBudgetInput {
  /** Type of remediation being attempted */
  type: 'ci' | 'review';
  /** Current CI remediation count (from feature.ciRemediationCount) */
  ciRemediationCount: number;
  /** Current review remediation count (from feature.reviewRemediationCount) */
  reviewRemediationCount: number;
  /**
   * Legacy total remediation cycle count.
   * Used for backward compatibility when split counts are not available.
   */
  remediationCycleCount?: number;
  /** Settings that define the budget limits */
  settings: CIReactionSettings;
}

// ============================================================================
// CI Failure Evidence — structured test failure details for agent prompts
// ============================================================================

/**
 * Structured evidence extracted from a failed CI check run.
 * Populated by ci-failure-evidence-collector using GitHub check run annotations
 * and log output parsing.
 */
export interface CIFailureEvidence {
  /** Check name as reported by GitHub (e.g. "CI / test") */
  checkName: string;
  /** URL to the check run on GitHub */
  checkUrl?: string;
  /** File where the failure occurred (e.g. "src/services/foo.test.ts") */
  testFile?: string;
  /** Human-readable test name or description */
  testName?: string;
  /** Assertion that failed (e.g. "expect(escalations).toHaveLength(1)") */
  assertion?: string;
  /** Expected value from the assertion */
  expectedValue?: string;
  /** Received/actual value from the assertion */
  receivedValue?: string;
  /** File:line location of the failure */
  location?: string;
  /** Relevant log excerpt (truncated, filtered for failure patterns) */
  logExcerpt?: string;
  /** Raw annotation objects from the GitHub check run */
  annotations?: Array<{
    path?: string;
    start_line?: number;
    end_line?: number;
    annotation_level?: 'notice' | 'warning' | 'failure';
    message?: string;
    title?: string;
    raw_details?: string;
  }>;
}

/**
 * Per-cycle remediation history entry for progress-aware budget extension.
 * Tracks the number of CI failures at each cycle so the budget enforcer can
 * detect when the agent is making measurable progress (fewer failures).
 */
export interface RemediationCycleSnapshot {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Number of failing checks at this cycle */
  ciFailureCount: number;
  /** Names of the failing checks */
  failingCheckNames?: string[];
}
