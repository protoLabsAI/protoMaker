import { describe, it, expect } from 'vitest';
import { buildFailureTaxonomy } from '@/services/failure-taxonomy-service.js';
import { createFailureClassifierService } from '@/services/failure-classifier-service.js';
import type { Feature } from '@protolabsai/types';

function feat(id: string, status: string, statusChangeReason?: string): Feature {
  return {
    id,
    category: 'feature',
    description: '',
    status,
    statusChangeReason,
  } as unknown as Feature;
}

// Deterministic stub so the test asserts aggregation, not classifier regexes.
const stub = {
  classify: (reason: string) => ({
    category: reason.includes('conflict')
      ? 'merge_conflict'
      : reason.includes('quota')
        ? 'quota'
        : 'tool_error',
    confidence: 1,
  }),
} as any;

describe('buildFailureTaxonomy', () => {
  it('only counts blocked/escalated features', () => {
    const features = [
      feat('a', 'done', 'merged'),
      feat('b', 'in_progress'),
      feat('c', 'backlog'),
      feat('d', 'blocked', 'merge conflict'),
      feat('e', 'escalated', 'quota exceeded'),
    ];
    const t = buildFailureTaxonomy(features, stub);
    expect(t.scanned).toBe(5);
    expect(t.failed).toBe(2);
  });

  it('aggregates counts + pct by category, sorted desc', () => {
    const features = [
      feat('1', 'blocked', 'merge conflict A'),
      feat('2', 'blocked', 'merge conflict B'),
      feat('3', 'blocked', 'merge conflict C'),
      feat('4', 'escalated', 'quota exceeded'),
    ];
    const t = buildFailureTaxonomy(features, stub);
    expect(t.failed).toBe(4);
    expect(t.byCategory[0]).toMatchObject({ category: 'merge_conflict', count: 3, pct: 75 });
    expect(t.byCategory[1]).toMatchObject({ category: 'quota', count: 1, pct: 25 });
  });

  it('classifies missing reason as "unknown"', () => {
    const t = buildFailureTaxonomy([feat('x', 'blocked')], stub);
    expect(t.byCategory[0]).toMatchObject({ category: 'unknown', count: 1 });
  });

  it('caps examples per category', () => {
    const features = Array.from({ length: 5 }, (_, i) => feat(`f${i}`, 'blocked', `conflict ${i}`));
    const t = buildFailureTaxonomy(features, stub, { maxExamples: 2 });
    expect(t.byCategory[0].count).toBe(5);
    expect(t.byCategory[0].examples).toHaveLength(2);
  });

  it('returns an empty taxonomy when nothing failed', () => {
    const t = buildFailureTaxonomy([feat('a', 'done')], stub);
    expect(t.failed).toBe(0);
    expect(t.byCategory).toEqual([]);
  });

  it('integrates with the real classifier (sanity)', () => {
    const t = buildFailureTaxonomy(
      [feat('a', 'blocked', 'Max agent retries exceeded: usage limit / quota reached')],
      createFailureClassifierService()
    );
    expect(t.failed).toBe(1);
    expect(t.byCategory[0].category).toBeTruthy();
    expect(t.byCategory[0].count).toBe(1);
  });
});
