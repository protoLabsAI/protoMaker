/**
 * CIFailureClassifierService — TDD Red Phase
 *
 * These tests define the expected behaviour of CIFailureClassifierService.
 * They are intentionally written before the implementation exists and will
 * fail until the service is implemented in a subsequent feature.
 */

import { describe, it, expect } from 'vitest';
import type { CIClassificationSettings } from '@protolabsai/types';
import { CIFailureClassifierService } from '../../src/services/ci-failure-classifier-service.js';

// ---------------------------------------------------------------------------
// Lint / format checks
// ---------------------------------------------------------------------------
describe('CIFailureClassifierService — lint class', () => {
  const service = new CIFailureClassifierService();

  const lintCheckNames = [
    'eslint',
    'ESLint',
    'lint',
    'lint-check',
    'format',
    'format-check',
    'prettier',
    'Prettier / check',
    'stylelint',
    'markdownlint',
  ];

  it.each(lintCheckNames)('classifies "%s" as lint', (checkName) => {
    const result = service.classify(checkName);
    expect(result.failureClass).toBe('lint');
    expect(result.checkName).toBe(checkName);
  });

  it('marks lint failures as agent-fixable', () => {
    const result = service.classify('eslint');
    expect(result.isAgentFixable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Build / compile / typecheck checks
// ---------------------------------------------------------------------------
describe('CIFailureClassifierService — build class', () => {
  const service = new CIFailureClassifierService();

  const buildCheckNames = [
    'build',
    'build-packages',
    'Build (ubuntu-latest)',
    'compile',
    'typecheck',
    'type-check',
    'tsc',
    'TSC / typecheck',
    'webpack',
    'vite-build',
    'turbo-build',
  ];

  it.each(buildCheckNames)('classifies "%s" as build', (checkName) => {
    const result = service.classify(checkName);
    expect(result.failureClass).toBe('build');
    expect(result.checkName).toBe(checkName);
  });

  it('marks build failures as agent-fixable', () => {
    const result = service.classify('typecheck');
    expect(result.isAgentFixable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test / spec / e2e checks
// ---------------------------------------------------------------------------
describe('CIFailureClassifierService — test class', () => {
  const service = new CIFailureClassifierService();

  const testCheckNames = [
    'test',
    'unit-tests',
    'jest',
    'vitest',
    'mocha',
    'spec',
    'e2e',
    'e2e-tests',
    'playwright',
    'cypress',
    'integration-tests',
    'Test Suite (node 20)',
  ];

  it.each(testCheckNames)('classifies "%s" as test', (checkName) => {
    const result = service.classify(checkName);
    expect(result.failureClass).toBe('test');
    expect(result.checkName).toBe(checkName);
  });

  it('marks test failures as agent-fixable', () => {
    const result = service.classify('jest');
    expect(result.isAgentFixable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Infra / deploy / release checks
// ---------------------------------------------------------------------------
describe('CIFailureClassifierService — infra class', () => {
  const service = new CIFailureClassifierService();

  const infraCheckNames = [
    'deploy',
    'deploy-staging',
    'Deploy to production',
    'release',
    'publish',
    'docker',
    'docker-build',
    'infrastructure',
    'terraform',
    'provision',
  ];

  it.each(infraCheckNames)('classifies "%s" as infra', (checkName) => {
    const result = service.classify(checkName);
    expect(result.failureClass).toBe('infra');
    expect(result.checkName).toBe(checkName);
  });

  it('marks infra failures as NOT agent-fixable', () => {
    const result = service.classify('deploy');
    expect(result.isAgentFixable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unknown fallback
// ---------------------------------------------------------------------------
describe('CIFailureClassifierService — unknown fallback', () => {
  const service = new CIFailureClassifierService();

  it('falls back to unknown for unrecognised check names', () => {
    const result = service.classify('some-random-check-xyz');
    expect(result.failureClass).toBe('unknown');
    expect(result.checkName).toBe('some-random-check-xyz');
  });

  it('marks unknown failures as NOT agent-fixable', () => {
    const result = service.classify('unrecognised-check');
    expect(result.isAgentFixable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Flaky checks — isAgentFixable must be false
// ---------------------------------------------------------------------------
describe('CIFailureClassifierService — flaky class', () => {
  const service = new CIFailureClassifierService();

  it('classifies checks that are labelled as flaky', () => {
    const result = service.classify('flaky-e2e-suite');
    expect(result.failureClass).toBe('flaky');
  });

  it('marks flaky failures as NOT agent-fixable', () => {
    const result = service.classify('flaky-integration-check');
    expect(result.isAgentFixable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Project-level pattern overrides via workflowSettings.ciClassification
// ---------------------------------------------------------------------------
describe('CIFailureClassifierService — project-level pattern overrides', () => {
  const customSettings: CIClassificationSettings = {
    lintPatterns: ['custom-linter', 'proto-style'],
    buildPatterns: ['custom-compile'],
    testPatterns: ['karma-run'],
    infraPatterns: ['k8s-rollout'],
    flakyPatterns: ['network-smoke'],
  };

  const service = new CIFailureClassifierService(customSettings);

  it('applies custom lint patterns from project settings', () => {
    const result = service.classify('custom-linter');
    expect(result.failureClass).toBe('lint');
    expect(result.isAgentFixable).toBe(true);
  });

  it('applies second custom lint pattern from project settings', () => {
    const result = service.classify('proto-style');
    expect(result.failureClass).toBe('lint');
  });

  it('applies custom build patterns from project settings', () => {
    const result = service.classify('custom-compile');
    expect(result.failureClass).toBe('build');
    expect(result.isAgentFixable).toBe(true);
  });

  it('applies custom test patterns from project settings', () => {
    const result = service.classify('karma-run');
    expect(result.failureClass).toBe('test');
    expect(result.isAgentFixable).toBe(true);
  });

  it('applies custom infra patterns from project settings', () => {
    const result = service.classify('k8s-rollout');
    expect(result.failureClass).toBe('infra');
    expect(result.isAgentFixable).toBe(false);
  });

  it('applies custom flaky patterns from project settings', () => {
    const result = service.classify('network-smoke');
    expect(result.failureClass).toBe('flaky');
    expect(result.isAgentFixable).toBe(false);
  });

  it('still classifies standard checks even with project overrides', () => {
    const result = service.classify('eslint');
    expect(result.failureClass).toBe('lint');
  });

  it('custom patterns are matched case-insensitively', () => {
    const result = service.classify('CUSTOM-LINTER');
    expect(result.failureClass).toBe('lint');
  });
});

// ---------------------------------------------------------------------------
// isAgentFixable logic — comprehensive
// ---------------------------------------------------------------------------
describe('CIFailureClassifierService — isAgentFixable logic', () => {
  const service = new CIFailureClassifierService();

  it.each([
    ['lint', 'eslint', true],
    ['build', 'typecheck', true],
    ['test', 'jest', true],
    ['infra', 'deploy-staging', false],
    ['flaky', 'flaky-check', false],
    ['unknown', 'unrecognised-xyz', false],
  ] as const)(
    'class "%s" (check: "%s") → isAgentFixable=%s',
    (_label, checkName, expected) => {
      const result = service.classify(checkName);
      expect(result.isAgentFixable).toBe(expected);
    }
  );
});

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------
describe('CIFailureClassifierService — return shape', () => {
  const service = new CIFailureClassifierService();

  it('always returns a ClassifiedCIFailure with checkName, failureClass, isAgentFixable', () => {
    const result = service.classify('jest');
    expect(result).toMatchObject({
      checkName: 'jest',
      failureClass: expect.any(String),
      isAgentFixable: expect.any(Boolean),
    });
  });
});
