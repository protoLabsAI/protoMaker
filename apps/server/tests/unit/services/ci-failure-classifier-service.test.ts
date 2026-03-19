import { describe, it, expect } from 'vitest';

import {
  CIFailureClassifierService,
  ciFailureClassifier,
} from '../../../src/services/ci-failure-classifier-service.js';
import type { FailedCheck } from '../../../src/services/pr-status-checker.js';

const makeCheck = (name: string, output = ''): FailedCheck => ({
  name,
  conclusion: 'failure',
  output,
});

describe('CIFailureClassifierService', () => {
  let classifier: CIFailureClassifierService;

  beforeEach(() => {
    classifier = new CIFailureClassifierService();
  });

  // ── Singleton export ──────────────────────────────────────────────────────

  it('exports a singleton ciFailureClassifier', () => {
    expect(ciFailureClassifier).toBeInstanceOf(CIFailureClassifierService);
  });

  // ── Infrastructure failures ───────────────────────────────────────────────

  describe('infra classification', () => {
    it('classifies runner-lost output as infra', () => {
      const result = classifier.classify(makeCheck('CI / build', 'The runner lost connection'));
      expect(result.failureClass).toBe('infra');
      expect(result.isAgentFixable).toBe(false);
    });

    it('classifies OOM output as infra', () => {
      const result = classifier.classify(makeCheck('test', 'Process killed: out of memory'));
      expect(result.failureClass).toBe('infra');
      expect(result.isAgentFixable).toBe(false);
    });

    it('classifies ENOTFOUND network error as infra', () => {
      const result = classifier.classify(
        makeCheck('install', 'Error: getaddrinfo ENOTFOUND registry.npmjs.org')
      );
      expect(result.failureClass).toBe('infra');
      expect(result.isAgentFixable).toBe(false);
    });

    it('classifies docker image pull failure as infra', () => {
      const result = classifier.classify(makeCheck('build', 'Error pulling image: timeout'));
      expect(result.failureClass).toBe('infra');
      expect(result.isAgentFixable).toBe(false);
    });
  });

  // ── Timeout failures ──────────────────────────────────────────────────────

  describe('timeout classification', () => {
    it('classifies output containing "timed out" as timeout', () => {
      const result = classifier.classify(makeCheck('e2e', 'Job timed out after 60 minutes'));
      expect(result.failureClass).toBe('timeout');
      expect(result.isAgentFixable).toBe(false);
    });

    it('classifies check named "timeout" as timeout', () => {
      const result = classifier.classify(makeCheck('timeout-check', ''));
      expect(result.failureClass).toBe('timeout');
      expect(result.isAgentFixable).toBe(false);
    });
  });

  // ── Flaky failures ────────────────────────────────────────────────────────

  describe('flaky classification', () => {
    it('classifies output containing "flaky" as flaky', () => {
      const result = classifier.classify(makeCheck('test', 'This is a known flaky test'));
      expect(result.failureClass).toBe('flaky');
      expect(result.isAgentFixable).toBe(false);
    });

    it('classifies "intermittent" output as flaky', () => {
      const result = classifier.classify(makeCheck('test', 'intermittent failure detected'));
      expect(result.failureClass).toBe('flaky');
      expect(result.isAgentFixable).toBe(false);
    });
  });

  // ── Code errors ───────────────────────────────────────────────────────────

  describe('code_error classification', () => {
    it('classifies TypeScript error output as code_error', () => {
      const result = classifier.classify(
        makeCheck('build', 'error TS2345: Type string is not assignable')
      );
      expect(result.failureClass).toBe('code_error');
      expect(result.isAgentFixable).toBe(true);
    });

    it('classifies eslint output as code_error', () => {
      const result = classifier.classify(makeCheck('lint', 'ESLint found 3 errors'));
      expect(result.failureClass).toBe('code_error');
      expect(result.isAgentFixable).toBe(true);
    });

    it('classifies check named "typecheck" as code_error', () => {
      const result = classifier.classify(makeCheck('typecheck', ''));
      expect(result.failureClass).toBe('code_error');
      expect(result.isAgentFixable).toBe(true);
    });

    it('classifies check named "lint" as code_error', () => {
      const result = classifier.classify(makeCheck('lint / check', ''));
      expect(result.failureClass).toBe('code_error');
      expect(result.isAgentFixable).toBe(true);
    });

    it('classifies check named "format" as code_error', () => {
      const result = classifier.classify(makeCheck('format', ''));
      expect(result.failureClass).toBe('code_error');
      expect(result.isAgentFixable).toBe(true);
    });
  });

  // ── Test failures ─────────────────────────────────────────────────────────

  describe('test_failure classification', () => {
    it('classifies vitest assertion output as test_failure', () => {
      const result = classifier.classify(
        makeCheck('test / unit', 'AssertionError: expect(received).toBe(expected)\nvitest')
      );
      expect(result.failureClass).toBe('test_failure');
      expect(result.isAgentFixable).toBe(true);
    });

    it('classifies check named "test" as test_failure', () => {
      const result = classifier.classify(makeCheck('test / unit', ''));
      expect(result.failureClass).toBe('test_failure');
      expect(result.isAgentFixable).toBe(true);
    });

    it('classifies check named "e2e" as test_failure', () => {
      const result = classifier.classify(makeCheck('e2e', ''));
      expect(result.failureClass).toBe('test_failure');
      expect(result.isAgentFixable).toBe(true);
    });
  });

  // ── Build failures ────────────────────────────────────────────────────────

  describe('build_failure classification', () => {
    it('classifies "build failed" output as build_failure', () => {
      const result = classifier.classify(makeCheck('CI', 'Build failed: cannot find module'));
      expect(result.failureClass).toBe('build_failure');
      expect(result.isAgentFixable).toBe(true);
    });

    it('classifies check named "build" as build_failure', () => {
      const result = classifier.classify(makeCheck('build', ''));
      expect(result.failureClass).toBe('build_failure');
      expect(result.isAgentFixable).toBe(true);
    });

    it('classifies webpack error output as build_failure', () => {
      const result = classifier.classify(makeCheck('compile', 'webpack error: module not found'));
      expect(result.failureClass).toBe('build_failure');
      expect(result.isAgentFixable).toBe(true);
    });
  });

  // ── Unknown (no match) ────────────────────────────────────────────────────

  describe('unknown classification', () => {
    it('returns unknown when no rule matches', () => {
      const result = classifier.classify(makeCheck('mystery-check', 'some random output'));
      expect(result.failureClass).toBe('unknown');
      expect(result.isAgentFixable).toBe(true);
    });

    it('preserves check fields in unknown result', () => {
      const check = makeCheck('mystery', 'output text');
      const result = classifier.classify(check);
      expect(result.name).toBe(check.name);
      expect(result.conclusion).toBe(check.conclusion);
      expect(result.output).toBe(check.output);
    });
  });

  // ── classifyAll ───────────────────────────────────────────────────────────

  describe('classifyAll', () => {
    it('classifies a batch of checks', () => {
      const checks: FailedCheck[] = [
        makeCheck('test / unit', 'vitest assertion failed'),
        makeCheck('build', 'build failed'),
        makeCheck('runner-lost', 'runner lost connection'),
      ];
      const results = classifier.classifyAll(checks);
      expect(results).toHaveLength(3);
      expect(results[0].failureClass).toBe('test_failure');
      expect(results[1].failureClass).toBe('build_failure');
      expect(results[2].failureClass).toBe('infra');
    });

    it('returns empty array for empty input', () => {
      expect(classifier.classifyAll([])).toEqual([]);
    });
  });

  // ── Per-project custom rules ──────────────────────────────────────────────

  describe('custom project rules (ciClassification config)', () => {
    it('project rules take priority over default rules', () => {
      // Without config, "test/unit" would be test_failure.
      // With project rule, it overrides to infra.
      const result = classifier.classify(makeCheck('test / unit', ''), {
        rules: [
          {
            namePattern: 'test',
            class: 'infra',
            reason: 'Project marks all test checks as infra for this project',
          },
        ],
      });
      expect(result.failureClass).toBe('infra');
      expect(result.classificationReason).toBe(
        'Project marks all test checks as infra for this project'
      );
    });

    it('falls through to default rules when custom rule does not match', () => {
      const result = classifier.classify(makeCheck('test / unit', 'vitest assertion failed'), {
        rules: [
          {
            namePattern: 'does-not-match',
            class: 'infra',
            reason: 'Should not match',
          },
        ],
      });
      // Falls through to default: test_failure
      expect(result.failureClass).toBe('test_failure');
    });

    it('disableDefaultRules uses only project rules', () => {
      const result = classifier.classify(makeCheck('test / unit', 'vitest assertion failed'), {
        disableDefaultRules: true,
        rules: [
          {
            outputPattern: 'vitest',
            class: 'flaky',
            reason: 'Custom: vitest = flaky in this project',
          },
        ],
      });
      expect(result.failureClass).toBe('flaky');
    });

    it('disableDefaultRules with no matching rule returns unknown', () => {
      const result = classifier.classify(makeCheck('build', 'build failed'), {
        disableDefaultRules: true,
        rules: [], // no rules at all
      });
      expect(result.failureClass).toBe('unknown');
    });

    it('rule with both namePattern and outputPattern requires both to match', () => {
      // Name matches but output does not
      const noMatch = classifier.classify(makeCheck('test', 'no matching output'), {
        rules: [
          {
            namePattern: 'test',
            outputPattern: 'specific-error',
            class: 'infra',
            reason: 'Both patterns must match',
          },
        ],
      });
      // Should fall through to default rules (test name → test_failure)
      expect(noMatch.failureClass).toBe('test_failure');

      // Both match
      const match = classifier.classify(makeCheck('test', 'specific-error in test'), {
        rules: [
          {
            namePattern: 'test',
            outputPattern: 'specific-error',
            class: 'infra',
            reason: 'Both patterns matched',
          },
        ],
      });
      expect(match.failureClass).toBe('infra');
    });
  });

  // ── ClassifiedCIFailure shape ─────────────────────────────────────────────

  describe('ClassifiedCIFailure interface fields', () => {
    it('includes all required fields', () => {
      const check = makeCheck('test', 'output');
      const result = classifier.classify(check);
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('conclusion');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('failureClass');
      expect(result).toHaveProperty('isAgentFixable');
      expect(result).toHaveProperty('classificationReason');
      expect(typeof result.classificationReason).toBe('string');
      expect(result.classificationReason.length).toBeGreaterThan(0);
    });
  });
});
