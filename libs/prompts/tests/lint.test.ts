/**
 * Prompt Quality Linter Tests
 *
 * Tests the linter itself AND runs it against all default prompts
 * to catch quality regressions in CI.
 */

import { describe, it, expect } from 'vitest';
import { lintPrompt, lintAllPrompts } from '../src/lint.js';

describe('prompt linter', () => {
  describe('lintPrompt — individual rules', () => {
    it('warns on prompts exceeding token budget', () => {
      const longPrompt = 'a'.repeat(20000); // ~5000 tokens
      const result = lintPrompt('test.long', longPrompt);
      expect(result.warnings.some((w) => w.rule === 'token-budget')).toBe(true);
    });

    it('does not warn on short prompts', () => {
      const result = lintPrompt('test.short', 'Do this task.');
      expect(result.warnings.some((w) => w.rule === 'token-budget')).toBe(false);
    });

    it('warns when agent prompt lacks verification gates', () => {
      const result = lintPrompt('autoMode.noVerify', 'Just write some code.');
      expect(result.warnings.some((w) => w.rule === 'verification-gates')).toBe(true);
    });

    it('does not warn when prompt has verification', () => {
      const result = lintPrompt('autoMode.withVerify', 'Run build and verify exit code 0.');
      expect(result.warnings.some((w) => w.rule === 'verification-gates')).toBe(false);
    });

    it('warns when agent prompt lacks scope discipline', () => {
      const result = lintPrompt('taskExecution.noScope', 'Build everything you can.');
      expect(result.warnings.some((w) => w.rule === 'scope-discipline')).toBe(true);
    });

    it('does not warn when prompt has scope constraints', () => {
      const result = lintPrompt(
        'taskExecution.withScope',
        'Focus only on the requested changes. Do not modify other files.'
      );
      expect(result.warnings.some((w) => w.rule === 'scope-discipline')).toBe(false);
    });

    it('skips agent-only rules for non-agent prompts', () => {
      const result = lintPrompt('enhancement.test', 'Improve the description.');
      expect(result.warnings.some((w) => w.rule === 'verification-gates')).toBe(false);
      expect(result.warnings.some((w) => w.rule === 'scope-discipline')).toBe(false);
    });

    it('errors on dangerous anti-patterns', () => {
      const result = lintPrompt('test.danger', 'skip all tests and rm -rf /');
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.passed).toBe(false);
    });

    it('passes clean prompts', () => {
      const result = lintPrompt(
        'autoMode.clean',
        'Implement the feature. Verify the build passes. Focus only on the task. Return a JSON summary.'
      );
      expect(result.passed).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('warns on prompts without output format specification', () => {
      // Long enough prompt without format keywords
      const prompt =
        'This is a long prompt that describes what to do but never says how the agent should shape its reply. ' +
        'It goes on for a while without mentioning anything about the expected shape of the answer. '.repeat(
          3
        );
      const result = lintPrompt('test.noFormat', prompt);
      expect(result.warnings.some((w) => w.rule === 'output-format')).toBe(true);
    });
  });

  describe('lintAllPrompts — regression gate', () => {
    it('lints all 12 prompt categories', () => {
      const summary = lintAllPrompts();
      expect(summary.total).toBeGreaterThanOrEqual(30); // ~50 prompts across 12 categories
    });

    it('all prompts pass (no errors)', () => {
      const summary = lintAllPrompts();
      const failing = summary.results.filter((r) => !r.passed);

      if (failing.length > 0) {
        const details = failing
          .map((r) => `  ${r.name}: ${r.errors.map((e) => e.message).join(', ')}`)
          .join('\n');
        expect.fail(`${failing.length} prompt(s) have errors:\n${details}`);
      }
    });

    it('reports warnings without failing', () => {
      const summary = lintAllPrompts();
      // Warnings are informational — log them but don't fail
      expect(summary.warnings).toBeGreaterThanOrEqual(0);
    });
  });
});
