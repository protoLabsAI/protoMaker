/**
 * CI Failure Classifier Service
 *
 * Pure function pattern-based classification for CI check failures.
 * No LLM calls — classification runs synchronously via ordered regex rules.
 *
 * Priority: custom project rules (from workflowSettings.ciClassification) are
 * evaluated BEFORE built-in defaults, allowing per-project overrides.
 *
 * Agent-fixable classes: test_failure, build_failure, lint_failure, type_error
 * Non-agent-fixable classes: infra, flaky, timeout, unknown (skip remediation)
 */

import type { CIClassificationConfig, CIFailureClass, ClassifiedCIFailure } from '@protolabsai/types';
import type { FailedCheck } from './pr-status-checker.js';

// ============================================================================
// Agent-fixable set — classes where agent dispatch makes sense
// ============================================================================

const AGENT_FIXABLE_CLASSES = new Set<CIFailureClass>([
  'test_failure',
  'build_failure',
  'lint_failure',
  'type_error',
]);

// ============================================================================
// Built-in default classification rules (ordered — first match wins)
// ============================================================================

interface InternalRule {
  namePattern?: RegExp;
  outputPattern?: RegExp;
  failureClass: CIFailureClass;
  confidence: number;
}

const DEFAULT_RULES: InternalRule[] = [
  // ── Infrastructure failures (non-agent-fixable) ───────────────────────────
  {
    namePattern: /runner|infrastructure|setup|provisioning|machine/i,
    failureClass: 'infra',
    confidence: 0.85,
  },
  {
    outputPattern:
      /runner.*lost|lost.*runner|infrastructure.*fail|oom.*kill|out of memory|disk.*space|no space left|process exited with code 137/i,
    failureClass: 'infra',
    confidence: 0.9,
  },

  // ── Timeout failures (non-agent-fixable) ────────────────────────────────
  {
    namePattern: /timeout/i,
    failureClass: 'timeout',
    confidence: 0.9,
  },
  {
    outputPattern: /job timed out|exceeded.*timeout|cancelled.*timeout|timed out after/i,
    failureClass: 'timeout',
    confidence: 0.9,
  },

  // ── Flaky test patterns (non-agent-fixable) ────────────────────────────
  {
    namePattern: /flaky/i,
    failureClass: 'flaky',
    confidence: 0.95,
  },
  {
    outputPattern: /flaky test|intermittent fail|non-deterministic|retry attempt \d+ of \d+.*fail/i,
    failureClass: 'flaky',
    confidence: 0.8,
  },

  // ── Lint / formatting failures (agent-fixable) ───────────────────────────
  {
    namePattern: /lint|format|prettier|eslint|stylelint|biome/i,
    failureClass: 'lint_failure',
    confidence: 0.9,
  },
  {
    outputPattern:
      /eslint.*error|prettier.*error|lint.*fail|format.*fail|biome.*error|formatting.*error/i,
    failureClass: 'lint_failure',
    confidence: 0.85,
  },

  // ── TypeScript / type errors (agent-fixable) ─────────────────────────────
  {
    namePattern: /typecheck|type.?check|tsc|typescript/i,
    failureClass: 'type_error',
    confidence: 0.9,
  },
  {
    outputPattern: /TS\d{4}:|type.*error|typescript.*error|cannot find.*type|property.*does not exist|type.*not assignable/i,
    failureClass: 'type_error',
    confidence: 0.85,
  },

  // ── Build / compile failures (agent-fixable) ─────────────────────────────
  {
    namePattern: /build|compile|bundle|webpack|vite|esbuild|tsc.*build/i,
    failureClass: 'build_failure',
    confidence: 0.85,
  },
  {
    outputPattern:
      /build.*fail|compile.*error|bundl.*error|module not found|cannot find module|syntax.*error|unexpected token/i,
    failureClass: 'build_failure',
    confidence: 0.85,
  },

  // ── Test failures (agent-fixable) ─────────────────────────────────────────
  {
    namePattern: /test|jest|vitest|mocha|playwright|cypress|e2e|unit|integration/i,
    failureClass: 'test_failure',
    confidence: 0.85,
  },
  {
    outputPattern:
      /test.*fail|fail.*test|assertion.*fail|expect.*received|FAIL.*\.test\.|● |✗ |✕ |FAILED/,
    failureClass: 'test_failure',
    confidence: 0.8,
  },
];

// ============================================================================
// CIFailureClassifierService
// ============================================================================

export class CIFailureClassifierService {
  /**
   * Classify a single failed CI check.
   *
   * @param check  - Raw FailedCheck from PRStatusChecker
   * @param config - Optional per-project classification config (custom rules prepended)
   * @returns ClassifiedCIFailure with failureClass, agentFixable, and confidence
   */
  classify(check: FailedCheck, config?: CIClassificationConfig): ClassifiedCIFailure {
    const rules = this.buildRuleSet(config);

    for (const rule of rules) {
      const nameMatch = rule.namePattern ? rule.namePattern.test(check.name) : false;
      const outputMatch = rule.outputPattern ? rule.outputPattern.test(check.output) : false;

      if (nameMatch || outputMatch) {
        const failureClass = rule.failureClass;
        return {
          ...check,
          failureClass,
          agentFixable: AGENT_FIXABLE_CLASSES.has(failureClass),
          confidence: rule.confidence,
        };
      }
    }

    // No rule matched — unknown, skip remediation conservatively
    return {
      ...check,
      failureClass: 'unknown',
      agentFixable: false,
      confidence: 0.5,
    };
  }

  /**
   * Classify a batch of failed checks.
   */
  classifyBatch(checks: FailedCheck[], config?: CIClassificationConfig): ClassifiedCIFailure[] {
    return checks.map((check) => this.classify(check, config));
  }

  /**
   * Build the effective rule set: custom project rules first, then built-in defaults.
   */
  private buildRuleSet(config?: CIClassificationConfig): InternalRule[] {
    if (!config?.rules?.length) {
      return DEFAULT_RULES;
    }

    const customRules: InternalRule[] = config.rules.map((r) => {
      const matchOn = r.matchOn ?? 'both';
      const regex = new RegExp(r.pattern, 'i');

      return {
        namePattern: matchOn === 'output' ? undefined : regex,
        outputPattern: matchOn === 'name' ? undefined : regex,
        failureClass: r.failureClass,
        confidence: r.confidence ?? 0.8,
      };
    });

    return [...customRules, ...DEFAULT_RULES];
  }
}

export const ciFailureClassifier = new CIFailureClassifierService();
