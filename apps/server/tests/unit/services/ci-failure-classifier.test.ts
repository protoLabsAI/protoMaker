/**
 * Unit tests for CIFailureClassifierService
 */

import { describe, it, expect } from 'vitest';
import {
  CIFailureClassifierService,
  createCIFailureClassifierService,
} from '@/services/ci-failure-classifier.js';
import type { CIClassificationConfig } from '@/services/ci-failure-classifier.js';

describe('CIFailureClassifierService', () => {
  const classifier = new CIFailureClassifierService();

  describe('classify()', () => {
    it('returns an array of ClassifiedCIFailure in the same order as input', () => {
      const results = classifier.classify(['build', 'lint', 'test']);
      expect(results).toHaveLength(3);
      expect(results[0].checkName).toBe('build');
      expect(results[1].checkName).toBe('lint');
      expect(results[2].checkName).toBe('test');
    });

    it('returns empty array for empty input', () => {
      const results = classifier.classify([]);
      expect(results).toHaveLength(0);
    });

    it('classifies each result with required fields', () => {
      const results = classifier.classify(['build']);
      expect(results[0]).toMatchObject({
        checkName: 'build',
        failureClass: expect.any(String),
        confidence: expect.any(Number),
      });
      expect('matchedPattern' in results[0]).toBe(true);
    });
  });

  describe('Default pattern matching', () => {
    it('classifies lint checks', () => {
      const cases = ['lint', 'eslint', 'biome', 'stylelint', 'run-lint', 'check-lint'];
      for (const name of cases) {
        const result = classifier.classifySingle(name);
        expect(result.failureClass).toBe('lint');
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.matchedPattern).not.toBeNull();
      }
    });

    it('classifies format checks', () => {
      const cases = ['format', 'prettier', 'dprint', 'check-format', 'format-check'];
      for (const name of cases) {
        const result = classifier.classifySingle(name);
        expect(result.failureClass).toBe('format');
      }
    });

    it('classifies typecheck checks', () => {
      const cases = ['typecheck', 'type-check', 'tsc', 'typescript-check'];
      for (const name of cases) {
        const result = classifier.classifySingle(name);
        expect(result.failureClass).toBe('typecheck');
      }
    });

    it('classifies test checks', () => {
      const cases = [
        'test',
        'tests',
        'jest',
        'vitest',
        'playwright',
        'cypress',
        'e2e',
        'unit',
        'coverage',
      ];
      for (const name of cases) {
        const result = classifier.classifySingle(name);
        expect(result.failureClass).toBe('test');
      }
    });

    it('classifies build checks', () => {
      const cases = ['build', 'compile', 'bundle', 'webpack', 'vite', 'esbuild', 'rollup'];
      for (const name of cases) {
        const result = classifier.classifySingle(name);
        expect(result.failureClass).toBe('build');
      }
    });

    it('classifies audit checks', () => {
      const cases = ['audit', 'security-scan', 'snyk', 'npm-audit', 'license-check'];
      for (const name of cases) {
        const result = classifier.classifySingle(name);
        expect(result.failureClass).toBe('audit');
      }
    });

    it('classifies deploy checks', () => {
      const cases = ['deploy', 'release', 'publish', 'vercel', 'netlify', 'staging'];
      for (const name of cases) {
        const result = classifier.classifySingle(name);
        expect(result.failureClass).toBe('deploy');
      }
    });

    it('classifies coderabbit checks', () => {
      const cases = ['coderabbit', 'CodeRabbit', 'code-rabbit'];
      for (const name of cases) {
        const result = classifier.classifySingle(name);
        expect(result.failureClass).toBe('coderabbit');
        expect(result.confidence).toBe(1.0);
      }
    });

    it('classifies unknown checks as unknown with confidence 0.5', () => {
      const result = classifier.classifySingle('my-totally-unrecognized-step-xyz');
      expect(result.failureClass).toBe('unknown');
      expect(result.confidence).toBe(0.5);
      expect(result.matchedPattern).toBeNull();
    });

    it('handles empty string input gracefully', () => {
      const result = classifier.classifySingle('');
      expect(result.failureClass).toBe('unknown');
      expect(result.confidence).toBe(0);
      expect(result.matchedPattern).toBeNull();
    });
  });

  describe('Project-level overrides', () => {
    it('project overrides take precedence over default patterns', () => {
      const overrides: CIClassificationConfig = {
        test: ['^my-custom-test-check$'],
      };
      const result = classifier.classifySingle(
        'my-custom-test-check',
        classifier['buildMergedPatterns'](overrides)
      );
      expect(result.failureClass).toBe('test');
      expect(result.confidence).toBe(1.0);
    });

    it('project overrides get full confidence (1.0)', () => {
      const overrides: CIClassificationConfig = {
        build: ['^vite-build-step$'],
      };
      const results = classifier.classify(['vite-build-step'], overrides);
      expect(results[0].failureClass).toBe('build');
      expect(results[0].confidence).toBe(1.0);
    });

    it('default patterns still apply for unmatched checks when overrides exist', () => {
      const overrides: CIClassificationConfig = {
        test: ['^my-custom-test$'],
      };
      const results = classifier.classify(['lint', 'my-custom-test'], overrides);
      expect(results[0].failureClass).toBe('lint');
      expect(results[1].failureClass).toBe('test');
      expect(results[1].confidence).toBe(1.0);
    });

    it('silently skips invalid regex patterns in overrides', () => {
      const overrides: CIClassificationConfig = {
        test: ['[invalid-regex((('],
      };
      // Should not throw; falls back to defaults
      expect(() => classifier.classify(['test'], overrides)).not.toThrow();
      const results = classifier.classify(['test'], overrides);
      expect(results[0].failureClass).toBe('test');
    });

    it('handles empty overrides object like no overrides', () => {
      const results1 = classifier.classify(['build']);
      const results2 = classifier.classify(['build'], {});
      expect(results1[0].failureClass).toBe(results2[0].failureClass);
    });
  });

  describe('createCIFailureClassifierService()', () => {
    it('returns a CIFailureClassifierService instance', () => {
      const svc = createCIFailureClassifierService();
      expect(svc).toBeInstanceOf(CIFailureClassifierService);
    });
  });

  describe('Pure service guarantees', () => {
    it('is deterministic — same input produces same output', () => {
      const a = classifier.classify(['build', 'lint', 'test']);
      const b = classifier.classify(['build', 'lint', 'test']);
      expect(a).toEqual(b);
    });

    it('does not mutate the input array', () => {
      const input = ['build', 'lint'];
      const copy = [...input];
      classifier.classify(input);
      expect(input).toEqual(copy);
    });
  });
});
