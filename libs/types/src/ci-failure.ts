/**
 * CI Failure Classification types
 *
 * Taxonomy for classifying CI check failures by root cause category,
 * enabling the system to distinguish agent-fixable failures (code bugs,
 * test failures) from non-fixable ones (infra outages, flaky tests).
 */

// ============================================================================
// CIFailureClass — Root cause taxonomy
// ============================================================================

/**
 * CIFailureClass — Root cause category of a CI check failure.
 *
 * Determines whether the failure is agent-fixable and what remediation
 * strategy (if any) should be applied.
 *
 * - code_error: Compilation failure, type error, linting violation — agent-fixable
 * - test_failure: Unit/integration test assertion failed — agent-fixable
 * - build_failure: Build step failed (bundling, packaging) — agent-fixable
 * - infra: Runner outage, OOM kill, container crash, network timeout — skip remediation
 * - flaky: Known-intermittent failure; not caused by PR changes — skip remediation
 * - timeout: Step exceeded its time limit — skip remediation (infra concern)
 * - unknown: Classification could not be determined — attempt remediation
 */
export type CIFailureClass =
  | 'code_error'
  | 'test_failure'
  | 'build_failure'
  | 'infra'
  | 'flaky'
  | 'timeout'
  | 'unknown';

/**
 * Whether the given class is agent-fixable.
 * Infra, flaky, and timeout failures should skip remediation.
 */
export const CI_FAILURE_CLASS_FIXABLE: Record<CIFailureClass, boolean> = {
  code_error: true,
  test_failure: true,
  build_failure: true,
  infra: false,
  flaky: false,
  timeout: false,
  unknown: true, // Attempt remediation for unknown — fail safe
};

// ============================================================================
// ClassifiedCIFailure — FailedCheck enriched with classification
// ============================================================================

/**
 * A CI check failure enriched with classification metadata.
 * Replaces the plain `FailedCheck` type in PRStatusChecker output.
 */
export interface ClassifiedCIFailure {
  /** Check name as reported by GitHub (e.g. "test / unit") */
  name: string;
  /** GitHub check conclusion (typically "failure") */
  conclusion: string;
  /** Raw log output from the check run or GHA job logs */
  output: string;
  /** Root cause category */
  failureClass: CIFailureClass;
  /** Whether an agent can be expected to fix this failure */
  isAgentFixable: boolean;
  /** Human-readable rationale for the classification */
  classificationReason: string;
}

// ============================================================================
// CIClassificationConfig — Per-project classification rule overrides
// ============================================================================

/**
 * A pattern-matching rule that maps check name / output patterns to a class.
 * Rules are evaluated in order; first match wins.
 */
export interface CIClassificationRule {
  /**
   * Regex pattern matched against the check name (case-insensitive).
   * When absent, the name is not tested.
   */
  namePattern?: string;
  /**
   * Regex pattern matched against the check output (case-insensitive).
   * When absent, the output is not tested.
   */
  outputPattern?: string;
  /** The class to assign when this rule matches */
  class: CIFailureClass;
  /** Human-readable label surfaced in classificationReason */
  reason: string;
}

/**
 * Per-project CI classification configuration.
 * Stored under workflowSettings.ciClassification in .automaker/settings.json.
 */
export interface CIClassificationConfig {
  /**
   * Additional project-specific rules prepended before the built-in defaults.
   * Earlier entries take priority (first-match wins).
   */
  rules?: CIClassificationRule[];
  /**
   * When true, built-in default rules are disabled and only rules are used.
   * @default false
   */
  disableDefaultRules?: boolean;
}
