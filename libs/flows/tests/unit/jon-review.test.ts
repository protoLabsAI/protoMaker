/**
 * Tests for jon-review node
 *
 * Covers:
 * - Normal case: valid review with all verdict types
 * - Jon sees Ava's review context in the prompt
 * - Malformed LLM output handling
 * - Model fallback trigger
 * - Multiple sections with concerns and recommendations
 */

import { describe, it, expect } from 'vitest';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage } from '@langchain/core/messages';
import {
  jonReviewNode,
  type JonReviewState,
} from '../../src/antagonistic-review/nodes/jon-review.js';
import { type ReviewerPerspective } from '../../src/antagonistic-review/nodes/ava-review.js';

/**
 * TestChatModel - Mock LLM that returns predefined responses
 */
class TestChatModel extends BaseChatModel {
  private responses: string[];
  private currentIndex = 0;

  constructor(responses: string[]) {
    super({});
    this.responses = responses;
  }

  _llmType(): string {
    return 'test';
  }

  async _generate(messages: BaseMessage[]): Promise<any> {
    if (this.currentIndex >= this.responses.length) {
      throw new Error('TestChatModel: No more responses available');
    }

    const response = this.responses[this.currentIndex];
    this.currentIndex++;

    return {
      generations: [
        {
          text: response,
          message: new AIMessage(response),
        },
      ],
    };
  }
}

describe('jon-review node', () => {
  describe('normal case', () => {
    it('should return approve verdict for high-value PRD', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Jon',
          verdict: 'approve',
          sections: [
            {
              area: 'Customer Impact',
              assessment: 'Solves major user pain point, high satisfaction expected',
              concerns: [],
            },
            {
              area: 'ROI',
              assessment: 'Strong ROI, 200% expected return within 6 months',
              concerns: [],
            },
            {
              area: 'Market Positioning',
              assessment: 'Differentiates us from competitors',
              concerns: [],
            },
            {
              area: 'Priority',
              assessment: 'Aligns perfectly with Q1 strategic goals',
              concerns: [],
            },
          ],
          comments: 'Strong business case. Proceed with implementation.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: JonReviewState = {
        prd: 'Add loading spinner to submit button',
        smartModel,
      };

      const result = await jonReviewNode(state);

      expect(result.jonReview).toBeDefined();
      expect(result.jonReview?.reviewer).toBe('Jon');
      expect(result.jonReview?.verdict).toBe('approve');
      expect(result.jonReview?.sections).toHaveLength(4);
      expect(result.jonReview?.comments).toBeTruthy();
      expect(result.jonReview?.timestamp).toBeTruthy();
    });

    it('should return approve-with-concerns verdict with recommendations', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Jon',
          verdict: 'approve-with-concerns',
          sections: [
            {
              area: 'Customer Impact',
              assessment: 'Good customer value but scope may be too broad',
              concerns: ['Feature creep risk', 'May confuse non-technical users'],
              recommendations: ['Start with MVP, gather feedback'],
            },
            {
              area: 'ROI',
              assessment: 'Positive ROI but uncertain timeline',
              concerns: ['Development cost may exceed budget', 'Revenue impact depends on adoption rate'],
              recommendations: ['Set clear success metrics', 'Plan phased rollout'],
            },
            {
              area: 'Market Positioning',
              assessment: 'Maintains competitive parity',
              concerns: ['Not a differentiator, just keeps us competitive'],
            },
            {
              area: 'Priority',
              assessment: 'Important but not urgent',
              concerns: ['Other features may provide more immediate value'],
              recommendations: ['Consider prioritizing security features first'],
            },
          ],
          comments: 'Good business case but monitor scope and ROI closely.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: JonReviewState = {
        prd: 'Integrate third-party payment gateway',
        smartModel,
      };

      const result = await jonReviewNode(state);

      expect(result.jonReview).toBeDefined();
      expect(result.jonReview?.verdict).toBe('approve-with-concerns');
      expect(result.jonReview?.sections).toHaveLength(4);

      // Check concerns are present
      const roiSection = result.jonReview?.sections.find((s) => s.area === 'ROI');
      expect(roiSection?.concerns).toHaveLength(2);
      expect(roiSection?.recommendations).toHaveLength(2);
    });

    it('should return revise verdict for unclear business case', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Jon',
          verdict: 'revise',
          sections: [
            {
              area: 'Customer Impact',
              assessment: 'Unclear target audience and value proposition',
              concerns: ['No user research cited', 'Vague problem definition', 'No success criteria'],
              recommendations: ['Conduct user interviews', 'Define specific use cases', 'Set measurable goals'],
            },
            {
              area: 'ROI',
              assessment: 'Cannot assess ROI without clear metrics',
              concerns: ['No cost analysis', 'No revenue projections', 'No comparison to alternatives'],
              recommendations: ['Create detailed cost/benefit analysis', 'Project revenue impact'],
            },
            {
              area: 'Market Positioning',
              assessment: 'Positioning strategy unclear',
              concerns: ['How does this differentiate us?', 'Competitive analysis missing'],
              recommendations: ['Research competitor offerings', 'Define unique value proposition'],
            },
            {
              area: 'Priority',
              assessment: 'Cannot prioritize without business case',
              concerns: ['No urgency explained', 'Opportunity cost not considered'],
              recommendations: ['Justify timing', 'Compare to other initiatives'],
            },
          ],
          comments: 'PRD needs significant revision. Clarify business value, target audience, and success metrics before proceeding.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: JonReviewState = {
        prd: 'Build new feature X',
        smartModel,
      };

      const result = await jonReviewNode(state);

      expect(result.jonReview).toBeDefined();
      expect(result.jonReview?.verdict).toBe('revise');
      expect(result.jonReview?.sections.every((s) => s.concerns.length > 0)).toBe(true);
    });

    it('should return reject verdict for poor business case', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Jon',
          verdict: 'reject',
          sections: [
            {
              area: 'Customer Impact',
              assessment: 'Minimal customer value',
              concerns: ['Solves edge case for <1% of users', 'Customer feedback indicates low interest'],
            },
            {
              area: 'ROI',
              assessment: 'Negative ROI',
              concerns: ['High development cost', 'No revenue opportunity', 'Ongoing maintenance burden'],
            },
            {
              area: 'Market Positioning',
              assessment: 'No competitive advantage',
              concerns: ['Feature already commoditized', 'Would not influence buying decisions'],
            },
            {
              area: 'Priority',
              assessment: 'Wrong priority for business goals',
              concerns: ['Misaligned with company strategy', 'Opportunity cost too high', 'Better alternatives exist'],
            },
          ],
          comments: 'Cannot recommend this PRD. Poor business case, minimal customer value, and wrong strategic priority.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: JonReviewState = {
        prd: 'Build internal tool for rarely-used workflow',
        smartModel,
      };

      const result = await jonReviewNode(state);

      expect(result.jonReview).toBeDefined();
      expect(result.jonReview?.verdict).toBe('reject');
    });

    it('should handle JSON in markdown code blocks', async () => {
      const smartModel = new TestChatModel([
        '```json\n' +
          JSON.stringify({
            reviewer: 'Jon',
            verdict: 'approve',
            sections: [
              {
                area: 'Customer Impact',
                assessment: 'Good customer value',
                concerns: [],
              },
            ],
            comments: 'Looks good from business perspective',
            timestamp: '2024-01-01T00:00:00.000Z',
          }) +
          '\n```',
      ]);

      const state: JonReviewState = {
        prd: 'Minor update',
        smartModel,
      };

      const result = await jonReviewNode(state);

      expect(result.jonReview).toBeDefined();
      expect(result.jonReview?.verdict).toBe('approve');
    });
  });

  describe('with Ava review context', () => {
    it('should incorporate Ava review context into business assessment', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve-with-concerns',
        sections: [
          {
            area: 'Capacity',
            assessment: 'Tight timeline',
            concerns: ['May require overtime'],
            recommendations: ['Add 1 week buffer'],
          },
          {
            area: 'Risk',
            assessment: 'Moderate technical risk',
            concerns: ['Third-party API dependency'],
          },
        ],
        comments: 'Can proceed but monitor concerns closely',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Jon',
          verdict: 'approve-with-concerns',
          sections: [
            {
              area: 'Customer Impact',
              assessment: 'High customer value',
              concerns: [],
            },
            {
              area: 'ROI',
              assessment: 'Good ROI if execution risks are managed',
              concerns: ['Ava flagged timeline and technical risks that could impact cost'],
              recommendations: ['Factor in Ava\'s recommended buffer when calculating ROI'],
            },
            {
              area: 'Market Positioning',
              assessment: 'Strong competitive advantage',
              concerns: [],
            },
            {
              area: 'Priority',
              assessment: 'High priority with execution caveats',
              concerns: ['Success depends on managing Ava\'s identified risks'],
            },
          ],
          comments: 'Strong business case. Proceed but budget for Ava\'s recommended timeline buffer.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: JonReviewState = {
        prd: 'Launch premium tier subscription',
        avaReview,
        smartModel,
      };

      const result = await jonReviewNode(state);

      expect(result.jonReview).toBeDefined();
      expect(result.jonReview?.verdict).toBe('approve-with-concerns');
      
      // Jon should reference Ava's concerns in his ROI assessment
      const roiSection = result.jonReview?.sections.find((s) => s.area === 'ROI');
      expect(roiSection?.concerns.some((c) => c.toLowerCase().includes('ava'))).toBe(true);
    });

    it('should work without Ava review context', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Jon',
          verdict: 'approve',
          sections: [
            {
              area: 'Customer Impact',
              assessment: 'Clear customer value',
              concerns: [],
            },
          ],
          comments: 'Good business case',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: JonReviewState = {
        prd: 'Simple feature',
        smartModel,
        // No avaReview provided
      };

      const result = await jonReviewNode(state);

      expect(result.jonReview).toBeDefined();
      expect(result.jonReview?.verdict).toBe('approve');
    });
  });

  describe('malformed LLM output', () => {
    it('should throw error on invalid JSON', async () => {
      const smartModel = new TestChatModel(['This is not valid JSON']);

      const state: JonReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(jonReviewNode(state)).rejects.toThrow('Failed to parse JSON');
    });

    it('should throw error on missing required fields', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Jon',
          verdict: 'approve',
          // missing sections and comments
        }),
      ]);

      const state: JonReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(jonReviewNode(state)).rejects.toThrow('Invalid review format');
    });

    it('should throw error on invalid verdict value', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Jon',
          verdict: 'maybe', // invalid value
          sections: [],
          comments: 'Test',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: JonReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(jonReviewNode(state)).rejects.toThrow('Invalid review format');
    });

    it('should throw error on invalid section structure', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Jon',
          verdict: 'approve',
          sections: [
            {
              // missing area and assessment
              concerns: [],
            },
          ],
          comments: 'Test',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: JonReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(jonReviewNode(state)).rejects.toThrow('Invalid review format');
    });
  });

  describe('fallback trigger', () => {
    it('should fall back to fast model when smart model fails', async () => {
      // Smart model throws error
      const smartModel = new TestChatModel([]);

      // Fast model provides valid response
      const fastModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Jon',
          verdict: 'approve-with-concerns',
          sections: [
            {
              area: 'Customer Impact',
              assessment: 'From fast model - good customer value',
              concerns: ['Minor concern'],
            },
          ],
          comments: 'Fallback review from fast model',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: JonReviewState = {
        prd: 'Add search filter',
        smartModel,
        fastModel,
      };

      const result = await jonReviewNode(state);

      // Should succeed with fast model's response
      expect(result.jonReview).toBeDefined();
      expect(result.jonReview?.verdict).toBe('approve-with-concerns');
      expect(result.jonReview?.comments).toContain('fast model');
    });

    it('should throw error when all models fail', async () => {
      const smartModel = new TestChatModel([]);
      const fastModel = new TestChatModel([]);

      const state: JonReviewState = {
        prd: 'Some PRD',
        smartModel,
        fastModel,
      };

      await expect(jonReviewNode(state)).rejects.toThrow('No more responses available');
    });

    it('should work with only smart model provided', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Jon',
          verdict: 'approve',
          sections: [
            {
              area: 'Customer Impact',
              assessment: 'Looks good',
              concerns: [],
            },
          ],
          comments: 'All good',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: JonReviewState = {
        prd: 'Simple update',
        smartModel,
        // No fastModel provided
      };

      const result = await jonReviewNode(state);

      expect(result.jonReview).toBeDefined();
      expect(result.jonReview?.verdict).toBe('approve');
    });
  });
});
