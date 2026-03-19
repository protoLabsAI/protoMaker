/**
 * CIFailureClassifierService - Pattern-based classification of CI check failures
 *
 * Classifies FailedCheck instances into CIFailureClass categories using
 * configurable pattern-matching rules. Built-in defaults cover common infra,
 * flaky, timeout, code_error, test_failure, and build_failure patterns.
 * Per-project rules configured via workflowSettings.ciClassification are
 * evaluated before the built-in defaults (project rules take priority).
 *
 * Agent-fixable classes: code_error, test_failure, build_failure, unknown
 * Non-agent-fixable classes: infra, flaky, timeout
 */

import { createLogger } from '@protolabsai/utils';
import type {
  CIClassificationConfig,
  CIClassificationRule,
  ClassifiedCIFailure,
} from '@protolabsai/types';
import { CI_FAILURE_CLASS_FIXABLE } from '@protolabsai/types';
import type { FailedCheck } from './pr-status-checker.js';

const logger = createLogger('CIFailureClassifier');

// ============================================================================
// Built-in default classification rules (ordered — first match wins)
// A rule matches when ALL specified patterns match (name AND output when both given).
// When only one pattern is specified, only that field is tested.
// ============================================================================

const DEFAULT_RULES: CIClassificationRule[] = [
  // ── Infrastructure failures (non-agent-fixable) ───────────────────────────
  {
    outputPattern:
      'runner lost|runner disconnected|the runner has received a shutdown signal|lost communication',
    class: 'infra',
    reason: 'Runner was lost or disconnected (infra outage)',
  },
  {
    outputPattern: 'out of memory|oom killer|killed.*memory|memory limit exceeded',
    class: 'infra',
    reason: 'Process killed due to OOM (infra constraint)',
  },
  {
    outputPattern:
      'docker.*pull.*error|error pulling image|failed to pull.*image|no space left on device',
    class: 'infra',
    reason: 'Container/image infrastructure failure',
  },
  {
    outputPattern: 'network.*unreachable|connection refused.*npm|enotfound|econnreset|econnrefused',
    class: 'infra',
    reason: 'Network connectivity failure during CI (infra)',
  },
  {
    outputPattern: 'github api.*rate limit|rate limit exceeded|secondary rate limit',
    class: 'infra',
    reason: 'GitHub API rate-limit hit during CI (infra)',
  },

  // ── Timeout failures (non-agent-fixable) ─────────────────────────────────
  {
    outputPattern: 'timed out|timeout exceeded|job.*cancelled.*timeout|step.*exceeded.*minutes',
    class: 'timeout',
    reason: 'Step or job exceeded its time limit',
  },
  {
    namePattern: 'timeout',
    class: 'timeout',
    reason: 'Check name indicates a timeout step',
  },

  // ── Flaky test patterns (non-agent-fixable) ───────────────────────────────
  {
    outputPattern: 'flaky|intermittent|non-deterministic|known.*flaky|marked.*flaky',
    class: 'flaky',
    reason: 'Failure output mentions known flaky test',
  },

  // ── Code errors — type-check / lint (agent-fixable) ──────────────────────
  {
    outputPattern:
      'typescript error|type error|ts\\(\\d+\\)|error ts\\d+|compilation failed|tsc.*error',
    class: 'code_error',
    reason: 'TypeScript / compilation error',
  },
  {
    outputPattern: 'eslint|prettier|lint.*error|linting.*failed',
    class: 'code_error',
    reason: 'Linting or formatting failure',
  },
  {
    namePattern: '(typecheck|type.check|lint|format)',
    class: 'code_error',
    reason: 'Check name indicates type-check or lint step',
  },

  // ── Test failures (agent-fixable) ─────────────────────────────────────────
  {
    outputPattern:
      'test.*failed|assertion.*failed|expect.*received|\u25CF.*fail|vitest|jest.*fail|mocha.*fail',
    class: 'test_failure',
    reason: 'Test assertion or test runner failure',
  },
  {
    namePattern: '(test|spec|unit|integration|e2e|cypress|playwright)',
    class: 'test_failure',
    reason: 'Check name indicates a test step',
  },

  // ── Build failures (agent-fixable) ────────────────────────────────────────
  {
    outputPattern: 'build.*failed|webpack.*error|rollup.*error|vite.*error|esbuild.*error',
    class: 'build_failure',
    reason: 'Build/bundler failure',
  },
  {
    namePattern: '(build|compile|bundle)',
    class: 'build_failure',
    reason: 'Check name indicates a build step',
  },
];

// ============================================================================
// CIFailureClassifierService
// ============================================================================

export class CIFailureClassifierService {
  /**
   * Classify a single failed CI check.
   *
   * Rules are evaluated in order; the first matching rule wins.
   * A rule matches when ALL specified patterns match (AND logic).
   * When only one pattern is specified, only that field is tested.
   *
   * @param check  - Raw FailedCheck from PRStatusChecker
   * @param config - Optional per-project ciClassification config
   * @returns ClassifiedCIFailure with failureClass, isAgentFixable, classificationReason
   */
  classify(check: FailedCheck, config?: CIClassificationConfig): ClassifiedCIFailure {
    const projectRules = config?.rules ?? [];
    const useDefaults = config?.disableDefaultRules !== true;
    const rules: CIClassificationRule[] = useDefaults
      ? [...projectRules, ...DEFAULT_RULES]
      : projectRules;

    for (const rule of rules) {
      const nameMatches =
        rule.namePattern == null || new RegExp(rule.namePattern, 'i').test(check.name);
      const outputMatches =
        rule.outputPattern == null || new RegExp(rule.outputPattern, 'i').test(check.output ?? '');

      if (nameMatches && outputMatches) {
        const failureClass = rule.class;
        logger.debug(`Classified "${check.name}" as "${failureClass}": ${rule.reason}`);
        return {
          ...check,
          failureClass,
          isAgentFixable: CI_FAILURE_CLASS_FIXABLE[failureClass],
          classificationReason: rule.reason,
        };
      }
    }

    // No rule matched — default to unknown (agent-fixable by fail-safe)
    logger.debug(`No rule matched "${check.name}", classifying as unknown`);
    return {
      ...check,
      failureClass: 'unknown',
      isAgentFixable: CI_FAILURE_CLASS_FIXABLE['unknown'],
      classificationReason: 'No classification rule matched; treating as agent-fixable',
    };
  }

  /**
   * Classify a batch of failed checks.
   */
  classifyAll(checks: FailedCheck[], config?: CIClassificationConfig): ClassifiedCIFailure[] {
    return checks.map((check) => this.classify(check, config));
  }
}

export const ciFailureClassifier = new CIFailureClassifierService();
