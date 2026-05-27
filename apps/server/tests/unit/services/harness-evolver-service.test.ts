import { describe, it, expect } from 'vitest';
import { proposeHarnessImprovement } from '@/services/harness-evolver-service.js';
import type { FailureTaxonomy } from '@/services/failure-taxonomy-service.js';

function taxonomy(byCategory: FailureTaxonomy['byCategory'], failed?: number): FailureTaxonomy {
  return {
    generatedAt: '2026-05-27T00:00:00Z',
    scanned: 10,
    failed: failed ?? byCategory.reduce((n, c) => n + c.count, 0),
    byCategory,
  };
}

describe('proposeHarnessImprovement', () => {
  it('proposes a fix for the top category with the mapped hypothesis + target', () => {
    const p = proposeHarnessImprovement(
      taxonomy([
        {
          category: 'merge_conflict',
          count: 4,
          pct: 66.7,
          examples: [{ featureId: 'a', reason: 'conflict' }],
        },
        { category: 'quota', count: 2, pct: 33.3, examples: [] },
      ])
    );
    expect(p).not.toBeNull();
    expect(p!.category).toBe('merge_conflict');
    expect(p!.count).toBe(4);
    expect(p!.pct).toBe(66.7);
    expect(p!.suggestedTarget).toMatch(/pre-flight|rebase/i);
    expect(p!.rationale).toContain('top failure mode');
    expect(p!.examples).toHaveLength(1);
  });

  it('returns null when the top category is below the noise threshold', () => {
    const p = proposeHarnessImprovement(
      taxonomy([{ category: 'tool_error', count: 1, pct: 100, examples: [] }])
    );
    expect(p).toBeNull();
  });

  it('respects a custom minCount', () => {
    const t = taxonomy([{ category: 'tool_error', count: 1, pct: 100, examples: [] }]);
    expect(proposeHarnessImprovement(t, { minCount: 1 })).not.toBeNull();
  });

  it('returns null on an empty taxonomy', () => {
    expect(proposeHarnessImprovement(taxonomy([], 0))).toBeNull();
  });

  it('falls back to the unknown remediation for an unmapped category', () => {
    const p = proposeHarnessImprovement(
      taxonomy([{ category: 'something_new', count: 3, pct: 100, examples: [] }])
    );
    expect(p).not.toBeNull();
    expect(p!.suggestedTarget).toMatch(/failure-classifier/i);
  });

  it('maps test_failure to the verifier gate (zg4) target', () => {
    const p = proposeHarnessImprovement(
      taxonomy([{ category: 'test_failure', count: 5, pct: 100, examples: [] }])
    );
    expect(p!.suggestedTarget).toMatch(/requireVerificationEvidence|verifier/i);
  });
});
