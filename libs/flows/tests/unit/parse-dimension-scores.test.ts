/**
 * Tests for parseDimensionScores — content pipeline antagonistic reviewer parser.
 *
 * Validates that the parser correctly extracts dimension scores from various
 * LLM output formats. This is critical because the LLM may format bold markers
 * and colons in different positions, and parser failure defaults to 5/10 per
 * dimension, causing cascade failures in the content pipeline.
 */

import { describe, it, expect } from 'vitest';
import {
  parseDimensionScores,
  type DimensionScore,
} from '../../src/content/subgraphs/antagonistic-reviewer.js';

const RESEARCH_DIMENSIONS = ['Completeness', 'Source Quality', 'Relevance', 'Depth'];

describe('parseDimensionScores', () => {
  describe('colon-inside-bold format (LLM default)', () => {
    it('should parse **Dim:** X/10 format', () => {
      const output = `## Research Review

**Completeness:** 8/10
Evidence: Covers most key areas.
Suggestion: Add more edge cases.

**Source Quality:** 7/10
Evidence: Good primary sources.

**Relevance:** 9/10
Evidence: Directly on topic.

**Depth:** 6/10
Evidence: Could go deeper on implementation details.
Suggestion: Add code examples.`;

      const scores = parseDimensionScores(output, RESEARCH_DIMENSIONS);

      expect(scores).toHaveLength(4);
      expect(scores[0].dimension).toBe('Completeness');
      expect(scores[0].score).toBe(8);
      expect(scores[1].dimension).toBe('Source Quality');
      expect(scores[1].score).toBe(7);
      expect(scores[2].dimension).toBe('Relevance');
      expect(scores[2].score).toBe(9);
      expect(scores[3].dimension).toBe('Depth');
      expect(scores[3].score).toBe(6);
    });

    it('should compute average >= 75% for passing scores', () => {
      const output = `**Completeness:** 8/10
**Source Quality:** 8/10
**Relevance:** 9/10
**Depth:** 7/10`;

      const scores = parseDimensionScores(output, RESEARCH_DIMENSIONS);
      const avg = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
      const percentage = Math.round((avg / 10) * 100);

      expect(percentage).toBe(80);
      expect(percentage).toBeGreaterThanOrEqual(75);
    });
  });

  describe('colon-outside-bold format', () => {
    it('should parse **Dim**: X/10 format', () => {
      const output = `**Completeness**: 8/10
**Source Quality**: 7/10
**Relevance**: 9/10
**Depth**: 6/10`;

      const scores = parseDimensionScores(output, RESEARCH_DIMENSIONS);

      expect(scores[0].score).toBe(8);
      expect(scores[1].score).toBe(7);
      expect(scores[2].score).toBe(9);
      expect(scores[3].score).toBe(6);
    });
  });

  describe('no-bold format', () => {
    it('should parse Dim: X/10 without markdown', () => {
      const output = `Completeness: 8/10
Source Quality: 7/10
Relevance: 9/10
Depth: 6/10`;

      const scores = parseDimensionScores(output, RESEARCH_DIMENSIONS);

      expect(scores[0].score).toBe(8);
      expect(scores[1].score).toBe(7);
      expect(scores[2].score).toBe(9);
      expect(scores[3].score).toBe(6);
    });
  });

  describe('"out of 10" format', () => {
    it('should parse X out of 10 format', () => {
      const output = `**Completeness:** 8 out of 10
**Source Quality:** 7 out of 10
**Relevance:** 9 out of 10
**Depth:** 6 out of 10`;

      const scores = parseDimensionScores(output, RESEARCH_DIMENSIONS);

      expect(scores[0].score).toBe(8);
      expect(scores[1].score).toBe(7);
      expect(scores[2].score).toBe(9);
      expect(scores[3].score).toBe(6);
    });
  });

  describe('mixed formats in same output', () => {
    it('should handle dimensions formatted differently', () => {
      const output = `**Completeness:** 8/10
Evidence: Good coverage.

**Source Quality**: 7/10
Evidence: Decent sources.

Relevance: 9/10

**Depth:** 6 out of 10`;

      const scores = parseDimensionScores(output, RESEARCH_DIMENSIONS);

      expect(scores[0].score).toBe(8);
      expect(scores[1].score).toBe(7);
      expect(scores[2].score).toBe(9);
      expect(scores[3].score).toBe(6);
    });
  });

  describe('edge cases', () => {
    it('should default to 5/10 when dimension not found', () => {
      const output = 'This review has no structured scores at all.';

      const scores = parseDimensionScores(output, RESEARCH_DIMENSIONS);

      expect(scores).toHaveLength(4);
      scores.forEach((s) => {
        expect(s.score).toBe(5);
        expect(s.evidence).toBe('No evidence provided');
      });
    });

    it('should reject scores outside 1-10 range', () => {
      const output = `**Completeness:** 0/10
**Source Quality:** 11/10
**Relevance:** 9/10
**Depth:** 6/10`;

      const scores = parseDimensionScores(output, RESEARCH_DIMENSIONS);

      // 0 and 11 are out of range — should fall through to next pattern or default to 5
      expect(scores[0].score).toBe(5); // 0 rejected
      expect(scores[1].score).toBe(5); // 11 rejected
      expect(scores[2].score).toBe(9);
      expect(scores[3].score).toBe(6);
    });

    it('should handle spaces around slash', () => {
      const output = `**Completeness:** 8 / 10
**Source Quality:** 7/ 10
**Relevance:** 9 /10
**Depth:** 6/10`;

      const scores = parseDimensionScores(output, RESEARCH_DIMENSIONS);

      expect(scores[0].score).toBe(8);
      expect(scores[1].score).toBe(7);
      expect(scores[2].score).toBe(9);
      expect(scores[3].score).toBe(6);
    });

    it('should be case-insensitive', () => {
      const output = `**completeness:** 8/10
**SOURCE QUALITY:** 7/10
**Relevance:** 9/10
**DEPTH:** 6/10`;

      const scores = parseDimensionScores(output, RESEARCH_DIMENSIONS);

      expect(scores[0].score).toBe(8);
      expect(scores[1].score).toBe(7);
      expect(scores[2].score).toBe(9);
      expect(scores[3].score).toBe(6);
    });

    it('should extract evidence and suggestions', () => {
      const output = `**Completeness:** 8/10
Evidence: Covers all major topics with good breadth.
Suggestion: Could add section on error handling.

**Source Quality:** 7/10
Evidence: References official documentation.

**Relevance:** 9/10
Evidence: Directly addresses the target audience.

**Depth:** 6/10
Evidence: Surface-level treatment of core concepts.
Suggestion: Expand implementation examples.`;

      const scores = parseDimensionScores(output, RESEARCH_DIMENSIONS);

      expect(scores[0].evidence).toContain('Covers all major topics');
      expect(scores[0].suggestion).toContain('error handling');
      expect(scores[1].evidence).toContain('official documentation');
      expect(scores[1].suggestion).toBeUndefined();
    });

    it('should handle empty dimensions array', () => {
      const scores = parseDimensionScores('some output', []);
      expect(scores).toEqual([]);
    });

    it('should handle full 8-dimension content review', () => {
      const contentDimensions = [
        'Technical Accuracy',
        'Completeness',
        'Clarity',
        'Structure',
        'Code Quality',
        'Actionability',
        'Engagement',
        'SEO Readiness',
      ];

      const output = `**Technical Accuracy:** 9/10
Evidence: All code examples are correct.

**Completeness:** 8/10
Evidence: Covers all topics.

**Clarity:** 7/10
Evidence: Mostly clear.

**Structure:** 8/10
Evidence: Good flow.

**Code Quality:** 9/10
Evidence: Clean examples.

**Actionability:** 7/10
Evidence: Clear next steps.

**Engagement:** 6/10
Evidence: Could be more engaging.

**SEO Readiness:** 8/10
Evidence: Good keyword usage.`;

      const scores = parseDimensionScores(output, contentDimensions);

      expect(scores).toHaveLength(8);
      const avg = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
      expect(avg).toBe(7.75);
    });
  });

  describe('regression: original bug - all scores defaulting to 5', () => {
    it('should NOT default to 5 for standard LLM output with colon inside bold', () => {
      // This is the exact format the LLM produces, which the old regex failed on
      const output = `## Research Quality Review

**Completeness:** 7/10
Evidence: The research covers the main topics but misses some edge cases.
Suggestion: Add coverage for error scenarios.

**Source Quality:** 8/10
Evidence: Uses official documentation and reputable sources.

**Relevance:** 9/10
Evidence: All research directly relates to the topic.

**Depth:** 6/10
Evidence: Some areas need deeper technical exploration.
Suggestion: Include performance benchmarks.`;

      const scores = parseDimensionScores(output, RESEARCH_DIMENSIONS);

      // The OLD parser would return [5, 5, 5, 5] here (40% = 10% after threshold math)
      // The NEW parser should correctly extract [7, 8, 9, 6] (75% = PASS)
      expect(scores[0].score).toBe(7);
      expect(scores[1].score).toBe(8);
      expect(scores[2].score).toBe(9);
      expect(scores[3].score).toBe(6);

      const avg = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
      const percentage = Math.round((avg / 10) * 100);
      expect(percentage).toBe(75); // Exactly at threshold
    });
  });
});
