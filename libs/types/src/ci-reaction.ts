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
