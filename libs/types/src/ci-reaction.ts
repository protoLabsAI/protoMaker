/**
 * CI Failure Classification types
 *
 * Provides a taxonomy of CI check failure types to enable the self-healing system
 * to route failures to the appropriate recovery strategy. Agent-fixable failures
 * (lint, build, test) can be retried automatically; infra and flaky failures require
 * human attention or retry-without-fix.
 */

/**
 * The category of a CI check failure, used to decide recovery strategy.
 *
 * - 'lint'    — Style/format violations (eslint, prettier, stylelint, etc.)
 * - 'build'   — Compilation or type-check errors (tsc, esbuild, webpack, etc.)
 * - 'test'    — Unit/integration/e2e test failures
 * - 'infra'   — Infrastructure/deployment issues (deploy, release, docker, etc.)
 * - 'flaky'   — Known-flaky or intermittent checks that should be retried without a fix
 * - 'unknown' — Could not be classified; fall back to human review
 */
export type CIFailureClass = 'lint' | 'build' | 'test' | 'infra' | 'flaky' | 'unknown';

/**
 * A CI check failure that has been classified by CIFailureClassifierService.
 */
export interface ClassifiedCIFailure {
  /** The name of the GitHub check run that failed (e.g. "eslint", "jest", "deploy-staging") */
  checkName: string;
  /** The classified failure category */
  failureClass: CIFailureClass;
  /**
   * Whether an agent can autonomously attempt to fix this failure.
   * False for 'infra' and 'flaky' failures where a code change would not help.
   */
  isAgentFixable: boolean;
  /**
   * Optional human-readable reason for the classification decision.
   * Useful for debugging classifier decisions.
   */
  reason?: string;
}

/**
 * Project-level CI classification overrides.
 *
 * Stored under `workflowSettings.ciClassification` in the project settings.
 * Allows projects to teach the classifier about custom check names that don't
 * match the default patterns.
 */
export interface CIClassificationSettings {
  /**
   * Additional patterns that should be classified as lint failures.
   * Each entry is matched as a case-insensitive substring of the check name.
   */
  lintPatterns?: string[];
  /**
   * Additional patterns that should be classified as build failures.
   * Each entry is matched as a case-insensitive substring of the check name.
   */
  buildPatterns?: string[];
  /**
   * Additional patterns that should be classified as test failures.
   * Each entry is matched as a case-insensitive substring of the check name.
   */
  testPatterns?: string[];
  /**
   * Additional patterns that should be classified as infra failures.
   * Each entry is matched as a case-insensitive substring of the check name.
   */
  infraPatterns?: string[];
  /**
   * Check names that are known-flaky and should be classified as 'flaky'
   * regardless of their name patterns.
   * Each entry is matched as a case-insensitive substring of the check name.
   */
  flakyPatterns?: string[];
}
