/**
 * Unit tests for pair review subgraph
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPairReviewSubgraph,
  createPairReviewNode,
  runPairReview,
  type PairReviewState,
  type PairConfig,
} from '../../src/antagonistic-review/nodes/pair-review.js';
import {
  FRANK_CHRIS_PAIR,
  MATT_CINDI_PAIR,
  SAM_JAKE_PAIR,
} from '../../src/antagonistic-review/pairs.js';
import { type SPARCPrd } from '@automaker/types';

describe('Pair Review Subgraph', () => {
  let mockPRD: SPARCPrd;

  beforeEach(() => {
    mockPRD = {
      situation: 'Test situation',
      problem: 'Test problem',
      approach: 'Test approach',
      results: 'Test results',
      constraints: ['Constraint 1'],
      generatedAt: new Date().toISOString(),
    };
  });

  describe('createPairReviewSubgraph', () => {
    it('should create a compiled subgraph', () => {
      const subgraph = createPairReviewSubgraph();
      expect(subgraph).toBeDefined();
      expect(typeof subgraph.invoke).toBe('function');
    });

    it('should execute the full A→B→consolidate flow', async () => {
      const subgraph = createPairReviewSubgraph();

      const initialState: PairReviewState = {
        prd: mockPRD,
        pairConfig: FRANK_CHRIS_PAIR,
      };

      const result = await subgraph.invoke(initialState);

      // Verify all three nodes executed
      expect(result.reviewerAOutput).toBeDefined();
      expect(result.reviewerBOutput).toBeDefined();
      expect(result.result).toBeDefined();
    });

    it('should produce structured PairReviewResult output', async () => {
      const subgraph = createPairReviewSubgraph();

      const initialState: PairReviewState = {
        prd: mockPRD,
        pairConfig: FRANK_CHRIS_PAIR,
      };

      const result = await subgraph.invoke(initialState);

      // Verify PairReviewResult structure
      expect(result.result).toMatchObject({
        section: expect.any(String),
        consensus: expect.any(Boolean),
        consolidatedComments: expect.any(String),
        completedAt: expect.any(String),
      });

      // Verify section matches config
      expect(result.result!.section).toBe(FRANK_CHRIS_PAIR.section);

      // Verify verdict is present when consensus is true
      if (result.result!.consensus) {
        expect(result.result!.agreedVerdict).toBeDefined();
      }
    });
  });

  describe('runPairReview helper', () => {
    it('should execute pair review and return result', async () => {
      const result = await runPairReview(mockPRD, FRANK_CHRIS_PAIR);

      expect(result).toBeDefined();
      expect(result.section).toBe('security-compliance');
      expect(result.consensus).toBeDefined();
      expect(result.consolidatedComments).toBeDefined();
      expect(result.completedAt).toBeDefined();
    });

    it('should include reviewer names in consolidated comments', async () => {
      const result = await runPairReview(mockPRD, FRANK_CHRIS_PAIR);

      expect(result.consolidatedComments).toContain('Frank');
      expect(result.consolidatedComments).toContain('Chris');
    });
  });

  describe('All three pairs', () => {
    it('should execute Frank↔Chris pair (security-compliance)', async () => {
      const result = await runPairReview(mockPRD, FRANK_CHRIS_PAIR);

      expect(result.section).toBe('security-compliance');
      expect(result.consolidatedComments).toContain('Frank');
      expect(result.consolidatedComments).toContain('Chris');
      expect(result.consolidatedComments).toContain('Security Expert');
      expect(result.consolidatedComments).toContain('Compliance Analyst');
    });

    it('should execute Matt↔Cindi pair (performance-scalability)', async () => {
      const result = await runPairReview(mockPRD, MATT_CINDI_PAIR);

      expect(result.section).toBe('performance-scalability');
      expect(result.consolidatedComments).toContain('Matt');
      expect(result.consolidatedComments).toContain('Cindi');
      expect(result.consolidatedComments).toContain('Performance Engineer');
      expect(result.consolidatedComments).toContain('Scalability Architect');
    });

    it('should execute Sam↔Jake pair (integration-dependencies)', async () => {
      const result = await runPairReview(mockPRD, SAM_JAKE_PAIR);

      expect(result.section).toBe('integration-dependencies');
      expect(result.consolidatedComments).toContain('Sam');
      expect(result.consolidatedComments).toContain('Jake');
      expect(result.consolidatedComments).toContain('Integration Specialist');
      expect(result.consolidatedComments).toContain('Dependencies Analyst');
    });
  });

  describe('State isolation with wrapSubgraph', () => {
    it('should isolate subgraph state from parent state', async () => {
      // Create a mock parent state
      interface ParentState {
        prd: SPARCPrd;
        parentField?: string;
        pairReviews?: any[];
      }

      const wrappedNode = createPairReviewNode<ParentState>(FRANK_CHRIS_PAIR);

      const parentState: ParentState = {
        prd: mockPRD,
        parentField: 'parent-only-data',
      };

      const result = await wrappedNode(parentState);

      // Verify wrapper returns only pairReviews update
      expect(result).toHaveProperty('pairReviews');
      expect(result.pairReviews).toHaveLength(1);

      // Verify parent-specific field is not leaked to output
      expect(result).not.toHaveProperty('parentField');
      expect(result).not.toHaveProperty('reviewerAOutput');
      expect(result).not.toHaveProperty('reviewerBOutput');

      // Verify the result structure
      const pairResult = result.pairReviews![0];
      expect(pairResult).toMatchObject({
        section: 'security-compliance',
        consensus: expect.any(Boolean),
        consolidatedComments: expect.any(String),
        completedAt: expect.any(String),
      });
    });

    it('should work with different pair configs', async () => {
      interface ParentState {
        prd: SPARCPrd;
        pairReviews?: any[];
      }

      const configs = [FRANK_CHRIS_PAIR, MATT_CINDI_PAIR, SAM_JAKE_PAIR];

      for (const config of configs) {
        const wrappedNode = createPairReviewNode<ParentState>(config);
        const result = await wrappedNode({ prd: mockPRD });

        expect(result.pairReviews).toHaveLength(1);
        expect(result.pairReviews![0].section).toBe(config.section);
      }
    });

    it('should maintain isolation across multiple invocations', async () => {
      interface ParentState {
        prd: SPARCPrd;
        pairReviews?: any[];
      }

      const wrappedNode = createPairReviewNode<ParentState>(FRANK_CHRIS_PAIR);

      // First invocation
      const result1 = await wrappedNode({ prd: mockPRD });
      const timestamp1 = result1.pairReviews![0].completedAt;

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second invocation
      const result2 = await wrappedNode({ prd: mockPRD });
      const timestamp2 = result2.pairReviews![0].completedAt;

      // Each invocation should be independent
      expect(timestamp1).not.toBe(timestamp2);
      expect(result1.pairReviews).toHaveLength(1);
      expect(result2.pairReviews).toHaveLength(1);
    });
  });

  describe('Reviewer output validation', () => {
    it('should include reviewer A output before reviewer B', async () => {
      const subgraph = createPairReviewSubgraph();

      const initialState: PairReviewState = {
        prd: mockPRD,
        pairConfig: FRANK_CHRIS_PAIR,
      };

      const result = await subgraph.invoke(initialState);

      expect(result.reviewerAOutput).toContain('Frank');
      expect(result.reviewerAOutput).toContain('Security Expert');
      expect(result.reviewerBOutput).toContain('Chris');
      expect(result.reviewerBOutput).toContain('Compliance Analyst');

      // Reviewer B should reference reviewer A
      expect(result.reviewerBOutput).toContain('Frank');
    });

    it('should use domain-specific prompts in output', async () => {
      const result = await runPairReview(mockPRD, FRANK_CHRIS_PAIR);

      // Check that the section-specific focus is reflected
      expect(result.section).toBe('security-compliance');
      expect(result.consolidatedComments.toLowerCase()).toMatch(/security|compliance|frank|chris/);
    });
  });

  describe('Error handling', () => {
    it('should throw error if pairConfig is missing', async () => {
      const subgraph = createPairReviewSubgraph();

      const invalidState = {
        prd: mockPRD,
        // @ts-expect-error - intentionally missing pairConfig
        pairConfig: undefined,
      };

      await expect(subgraph.invoke(invalidState)).rejects.toThrow();
    });
  });

  describe('Timestamp validation', () => {
    it('should produce valid ISO 8601 timestamps', async () => {
      const result = await runPairReview(mockPRD, FRANK_CHRIS_PAIR);

      const timestamp = new Date(result.completedAt);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    it('should have recent timestamp', async () => {
      const beforeTime = Date.now();
      const result = await runPairReview(mockPRD, FRANK_CHRIS_PAIR);
      const afterTime = Date.now();

      const resultTime = new Date(result.completedAt).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(beforeTime);
      expect(resultTime).toBeLessThanOrEqual(afterTime);
    });
  });
});
