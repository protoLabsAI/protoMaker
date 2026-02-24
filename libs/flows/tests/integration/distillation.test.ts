/**
 * Distillation Depth Integration Tests
 *
 * Tests the graph composition with distillation depth routing:
 * - depth=0 (surface): Skips pair reviews entirely
 * - depth=1 (standard): Activates most relevant pair (Matt+Cindi)
 * - depth=2 (deep): Activates all 3 pairs in parallel
 *
 * Uses TestChatModel for deterministic LLM behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createAntagonisticReviewGraph } from '../../src/antagonistic-review/graph.js';
import { DistillationDepth, type SPARCPrd } from '@protolabs-ai/types';
import type { AntagonisticReviewState } from '../../src/antagonistic-review/state.js';

/**
 * Sample PRD for testing
 */
function createTestPrd(): SPARCPrd {
  return {
    situation: 'We need to implement a new feature for performance optimization.',
    problem: 'Current system has scalability issues under high load.',
    approach: 'Build a caching layer with distributed storage.',
    results: 'Improved response times and reduced database load.',
    constraints: 'Must maintain backward compatibility and data consistency.',
    generatedAt: new Date().toISOString(),
  };
}

describe('Distillation Depth Routing', () => {
  let graph: ReturnType<typeof createAntagonisticReviewGraph>;

  beforeEach(() => {
    // Create graph without checkpointing for testing
    graph = createAntagonisticReviewGraph(false);
  });

  it('should skip pair reviews when depth=0 (surface)', async () => {
    const initialState: Partial<AntagonisticReviewState> = {
      prd: createTestPrd(),
      distillationDepth: DistillationDepth.Surface,
    };

    const result = await graph.invoke(initialState);

    // Verify: pairReviews should be empty (skipped)
    expect(result.pairReviews).toBeDefined();
    expect(result.pairReviews).toHaveLength(0);

    // Verify: Ava and Jon reviews should still run
    expect(result.avaReview).toBeDefined();
    expect(result.jonReview).toBeDefined();

    // Verify: consolidation should happen
    expect(result.consolidatedPrd).toBeDefined();
  });

  it('should activate one pair when depth=1 (standard)', async () => {
    const initialState: Partial<AntagonisticReviewState> = {
      prd: createTestPrd(),
      distillationDepth: DistillationDepth.Standard,
    };

    const result = await graph.invoke(initialState);

    // Verify: pairReviews should have exactly 1 entry (Matt+Cindi for performance)
    expect(result.pairReviews).toBeDefined();
    expect(result.pairReviews).toHaveLength(1);
    expect(result.pairReviews[0].section).toBe('performance-scalability');

    // Verify: Ava and Jon reviews should still run
    expect(result.avaReview).toBeDefined();
    expect(result.jonReview).toBeDefined();

    // Verify: consolidation should happen
    expect(result.consolidatedPrd).toBeDefined();
  });

  it('should activate all pairs when depth=2 (deep)', async () => {
    const initialState: Partial<AntagonisticReviewState> = {
      prd: createTestPrd(),
      distillationDepth: DistillationDepth.Deep,
    };

    const result = await graph.invoke(initialState);

    // Verify: pairReviews should have all 3 pairs
    expect(result.pairReviews).toBeDefined();
    expect(result.pairReviews).toHaveLength(3);

    // Verify all expected sections are present
    const sections = result.pairReviews.map((r: any) => r.section).sort();
    expect(sections).toEqual([
      'integration-dependencies',
      'performance-scalability',
      'security-compliance',
    ]);

    // Verify: Ava and Jon reviews should still run
    expect(result.avaReview).toBeDefined();
    expect(result.jonReview).toBeDefined();

    // Verify: consolidation should happen
    expect(result.consolidatedPrd).toBeDefined();
  });

  it('should collect pair results in pairReviews array', async () => {
    const initialState: Partial<AntagonisticReviewState> = {
      prd: createTestPrd(),
      distillationDepth: DistillationDepth.Deep,
    };

    const result = await graph.invoke(initialState);

    // Verify: each pair review has required fields
    for (const pairReview of result.pairReviews) {
      expect(pairReview.section).toBeDefined();
      expect(pairReview.consensus).toBeDefined();
      expect(pairReview.consolidatedComments).toBeDefined();
      expect(pairReview.completedAt).toBeDefined();
    }
  });

  it('should incorporate pair reviews in consolidation', async () => {
    const initialState: Partial<AntagonisticReviewState> = {
      prd: createTestPrd(),
      distillationDepth: DistillationDepth.Standard,
    };

    const result = await graph.invoke(initialState);

    // Verify: consolidation happens after pair reviews
    expect(result.consolidatedPrd).toBeDefined();
    expect(result.pairReviews).toHaveLength(1);

    // Verify: final state includes both individual and pair reviews
    expect(result.avaReview).toBeDefined();
    expect(result.jonReview).toBeDefined();
    expect(result.pairReviews[0]).toBeDefined();
  });

  it('should default to surface depth when not specified', async () => {
    const initialState: Partial<AntagonisticReviewState> = {
      prd: createTestPrd(),
      // No distillationDepth specified - should default to Surface
    };

    const result = await graph.invoke(initialState);

    // Verify: pairReviews should be empty (defaults to surface)
    expect(result.pairReviews).toBeDefined();
    expect(result.pairReviews).toHaveLength(0);
  });
});

describe('Parallel Execution with Send()', () => {
  let graph: ReturnType<typeof createAntagonisticReviewGraph>;

  beforeEach(() => {
    graph = createAntagonisticReviewGraph(false);
  });

  it('should execute all pairs in parallel for depth=2', async () => {
    const initialState: Partial<AntagonisticReviewState> = {
      prd: createTestPrd(),
      distillationDepth: DistillationDepth.Deep,
    };

    const startTime = Date.now();
    const result = await graph.invoke(initialState);
    const endTime = Date.now();

    // Verify: all 3 pairs completed
    expect(result.pairReviews).toHaveLength(3);

    // Verify: execution time is reasonable (parallel should be faster than sequential)
    // This is a smoke test - in real execution, parallel should be notably faster
    const executionTime = endTime - startTime;
    console.log(`Parallel execution time: ${executionTime}ms`);
    expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds
  });
});
