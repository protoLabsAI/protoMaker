/**
 * CI Failure Classification — taxonomy, types, and configuration for CI failure triage.
 *
 * CIFailureClass provides a structured taxonomy of CI failure types. Each class maps to
 * an agentFixable flag that determines whether the PR remediation pipeline should dispatch
 * an agent to fix the failure, or skip remediation (for infra/flaky failures).
 */

// ============================================================================
// CIFailureClass Taxonomy
// ============================================================================

/**
 * CIFailureClass — classified type of a CI check failure.
 *
 * Agent-fixable classes (agent can remediate):
 *   - test_failure    : Unit/integration tests failed — fix code or tests
 *   - build_failure   : Compilation or bundler error — fix build errors
 *   - lint_failure    : Linting / formatting violations — fix style issues
 *   - type_error      : TypeScript type-checking errors — fix type errors
 *
 * Non-agent-fixable classes (skip remediation):
 *   - flaky           : Known flaky test — transient, skip and retry externally
 *   - infra           : CI infrastructure issue (runner crash, OOM, network) — not code-related
 *   - timeout         : CI job timed out — likely infra, not agent-fixable
 *   - unknown         : Could not be classified — conservative default: skip remediation
 */
export type CIFailureClass =
  | 'test_failure'
  | 'build_failure'
  | 'lint_failure'
  | 'type_error'
  | 'flaky'
  | 'infra'
  | 'timeout'
  | 'unknown';

// ============================================================================
// ClassifiedCIFailure
// ============================================================================

/**
 * ClassifiedCIFailure — a CI check failure enriched with classification metadata.
 *
 * Replaces bare FailedCheck[] in the PR remediation pipeline.
 * Consumers should check agentFixable before dispatching an agent.
 */
export interface ClassifiedCIFailure {
  /** Name of the CI check (e.g. "build", "test (ubuntu-latest)") */
  name: string;
  /** GitHub conclusion for the check run (always "failure" for failed checks) */
  conclusion: string;
  /** Truncated output from the check run (title + summary + text, max 1000 chars) */
  output: string;
  /** Classified failure type */
  failureClass: CIFailureClass;
  /** Whether an agent can remediate this failure. False for infra/flaky/timeout/unknown. */
  agentFixable: boolean;
  /** Classifier confidence score (0–1). Lower values indicate ambiguous classification. */
  confidence: number;
}

// ============================================================================
// CI Classification Configuration
// ============================================================================

/**
 * CIClassificationRule — a single pattern-matching rule for CI failure classification.
 *
 * Rules are evaluated against the check name and/or output text.
 * The first matching rule wins (ordered evaluation).
 */
export interface CIClassificationRule {
  /**
   * String pattern matched as a case-insensitive substring against the check name
   * and output text. Alternatively, pass a regex string (without delimiters) for
   * more precise matching.
   */
  pattern: string;
  /** Which field(s) to match the pattern against. Defaults to both. */
  matchOn?: 'name' | 'output' | 'both';
  /** The failure class to assign when this rule matches. */
  failureClass: CIFailureClass;
  /** Classifier confidence for this rule (0–1). @default 0.8 */
  confidence?: number;
}

/**
 * CIClassificationConfig — per-project CI classification configuration.
 *
 * Set in workflowSettings.ciClassification.
 * Custom rules are evaluated BEFORE the built-in defaults, allowing projects to
 * override classification for known check names (e.g. mark a check as flaky).
 */
export interface CIClassificationConfig {
  /**
   * Custom classification rules prepended to the built-in rule set.
   * Each rule is evaluated in order; the first match wins.
   */
  rules?: CIClassificationRule[];
}
