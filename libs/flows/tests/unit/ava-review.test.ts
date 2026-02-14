/**
 * Tests for ava-review node
 *
 * Covers:
 * - Normal case: valid review with all verdict types
 * - Malformed LLM output handling
 * - Model fallback trigger
 * - Multiple sections with concerns and recommendations
 */

import { describe, it, expect } from 'vitest';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage } from '@langchain/core/messages';
import {
  avaReviewNode,
  type AvaReviewState,
  type ReviewerPerspective,
} from '../../src/antagonistic-review/nodes/ava-review.js';

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

  async _generate(_messages: BaseMessage[]): Promise<any> {
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

describe('ava-review node', () => {
  describe('normal case', () => {
    it('should return approve verdict for low-risk PRD', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Ava',
          verdict: 'approve',
          sections: [
            {
              area: 'Capacity',
              assessment: 'Team has sufficient bandwidth',
              concerns: [],
            },
            {
              area: 'Risk',
              assessment: 'Low risk, well-understood domain',
              concerns: [],
            },
            {
              area: 'Tech Debt',
              assessment: 'Neutral impact on tech debt',
              concerns: [],
            },
            {
              area: 'Feasibility',
              assessment: 'Straightforward implementation',
              concerns: [],
            },
          ],
          comments: 'Clean, low-risk change. Ready to proceed.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: AvaReviewState = {
        prd: 'Add loading spinner to submit button',
        smartModel,
      };

      const result = await avaReviewNode(state);

      expect(result.avaReview).toBeDefined();
      expect(result.avaReview?.reviewer).toBe('Ava');
      expect(result.avaReview?.verdict).toBe('approve');
      expect(result.avaReview?.sections).toHaveLength(4);
      expect(result.avaReview?.comments).toBeTruthy();
      expect(result.avaReview?.timestamp).toBeTruthy();
    });

    it('should return approve-with-concerns verdict with recommendations', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Ava',
          verdict: 'approve-with-concerns',
          sections: [
            {
              area: 'Capacity',
              assessment: 'Tight timeline but manageable',
              concerns: ['May require overtime during peak sprint'],
              recommendations: ['Add 1 week buffer to timeline'],
            },
            {
              area: 'Risk',
              assessment: 'Moderate risk with third-party API',
              concerns: ['API rate limits not documented', 'No fallback mechanism'],
              recommendations: ['Implement rate limiting', 'Add circuit breaker pattern'],
            },
            {
              area: 'Tech Debt',
              assessment: 'Will add some technical debt',
              concerns: ['Quick implementation may skip best practices'],
              recommendations: ['Schedule refactoring in next sprint'],
            },
            {
              area: 'Feasibility',
              assessment: 'Feasible with caveats',
              concerns: ['Dependency on external team deliverable'],
            },
          ],
          comments: 'Can proceed but monitor the identified concerns closely.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: AvaReviewState = {
        prd: 'Integrate third-party payment gateway',
        smartModel,
      };

      const result = await avaReviewNode(state);

      expect(result.avaReview).toBeDefined();
      expect(result.avaReview?.verdict).toBe('approve-with-concerns');
      expect(result.avaReview?.sections).toHaveLength(4);

      // Check concerns are present
      const riskSection = result.avaReview?.sections.find((s) => s.area === 'Risk');
      expect(riskSection?.concerns).toHaveLength(2);
      expect(riskSection?.recommendations).toHaveLength(2);
    });

    it('should return revise verdict for PRDs needing changes', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Ava',
          verdict: 'revise',
          sections: [
            {
              area: 'Capacity',
              assessment: 'Insufficient team capacity',
              concerns: ['Team already at 120% capacity', 'No clear resource allocation plan'],
              recommendations: ['Defer to next quarter', 'Hire additional engineer'],
            },
            {
              area: 'Risk',
              assessment: 'High risk, unclear requirements',
              concerns: ['Vague success criteria', 'No rollback plan defined'],
              recommendations: ['Define specific KPIs', 'Document rollback procedure'],
            },
            {
              area: 'Tech Debt',
              assessment: 'Will significantly increase tech debt',
              concerns: ['Proposed shortcut will make future features harder'],
            },
            {
              area: 'Feasibility',
              assessment: 'Not feasible without infrastructure upgrade',
              concerns: ['Current database cannot handle projected load'],
              recommendations: ['Upgrade to scalable database solution first'],
            },
          ],
          comments:
            'PRD needs revision before we can commit resources. Address capacity, requirements clarity, and infrastructure concerns.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: AvaReviewState = {
        prd: 'Launch real-time collaborative editing for all documents',
        smartModel,
      };

      const result = await avaReviewNode(state);

      expect(result.avaReview).toBeDefined();
      expect(result.avaReview?.verdict).toBe('revise');
      expect(result.avaReview?.sections.every((s) => s.concerns.length > 0)).toBe(true);
    });

    it('should return reject verdict for unfeasible PRDs', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Ava',
          verdict: 'reject',
          sections: [
            {
              area: 'Capacity',
              assessment: 'No available capacity',
              concerns: [
                'Would require 3 full-time engineers for 6 months',
                'No engineers available',
              ],
            },
            {
              area: 'Risk',
              assessment: 'Extreme risk',
              concerns: [
                'Would require complete system rewrite',
                'High probability of data loss',
                'Cannot guarantee backward compatibility',
              ],
            },
            {
              area: 'Tech Debt',
              assessment: 'Would create massive technical debt',
              concerns: ['Legacy approach being proposed', 'Will block future initiatives'],
            },
            {
              area: 'Feasibility',
              assessment: 'Not feasible with current technology',
              concerns: ['Required technology does not exist', 'Physics constraints'],
            },
          ],
          comments:
            'Cannot recommend proceeding with this PRD. Fundamental issues with capacity, risk, and feasibility.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: AvaReviewState = {
        prd: 'Implement real-time video AI analysis at 1000fps for all user uploads',
        smartModel,
      };

      const result = await avaReviewNode(state);

      expect(result.avaReview).toBeDefined();
      expect(result.avaReview?.verdict).toBe('reject');
    });

    it('should handle JSON in markdown code blocks', async () => {
      const smartModel = new TestChatModel([
        '```json\n' +
          JSON.stringify({
            reviewer: 'Ava',
            verdict: 'approve',
            sections: [
              {
                area: 'Capacity',
                assessment: 'Good',
                concerns: [],
              },
            ],
            comments: 'Looks good',
            timestamp: '2024-01-01T00:00:00.000Z',
          }) +
          '\n```',
      ]);

      const state: AvaReviewState = {
        prd: 'Minor update',
        smartModel,
      };

      const result = await avaReviewNode(state);

      expect(result.avaReview).toBeDefined();
      expect(result.avaReview?.verdict).toBe('approve');
    });
  });

  describe('malformed LLM output', () => {
    it('should throw error on invalid JSON', async () => {
      const smartModel = new TestChatModel(['This is not valid JSON']);

      const state: AvaReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(avaReviewNode(state)).rejects.toThrow('Failed to parse JSON');
    });

    it('should throw error on missing required fields', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Ava',
          verdict: 'approve',
          // missing sections and comments
        }),
      ]);

      const state: AvaReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(avaReviewNode(state)).rejects.toThrow('Invalid review format');
    });

    it('should throw error on invalid verdict value', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Ava',
          verdict: 'maybe', // invalid value
          sections: [],
          comments: 'Test',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: AvaReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(avaReviewNode(state)).rejects.toThrow('Invalid review format');
    });

    it('should throw error on invalid section structure', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Ava',
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

      const state: AvaReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(avaReviewNode(state)).rejects.toThrow('Invalid review format');
    });
  });

  describe('fallback trigger', () => {
    it('should fall back to fast model when smart model fails', async () => {
      // Smart model throws error
      const smartModel = new TestChatModel([]);

      // Fast model provides valid response
      const fastModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Ava',
          verdict: 'approve-with-concerns',
          sections: [
            {
              area: 'Capacity',
              assessment: 'From fast model - adequate capacity',
              concerns: ['Minor concern'],
            },
          ],
          comments: 'Fallback review from fast model',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: AvaReviewState = {
        prd: 'Add search filter',
        smartModel,
        fastModel,
      };

      const result = await avaReviewNode(state);

      // Should succeed with fast model's response
      expect(result.avaReview).toBeDefined();
      expect(result.avaReview?.verdict).toBe('approve-with-concerns');
      expect(result.avaReview?.comments).toContain('fast model');
    });

    it('should throw error when all models fail', async () => {
      const smartModel = new TestChatModel([]);
      const fastModel = new TestChatModel([]);

      const state: AvaReviewState = {
        prd: 'Some PRD',
        smartModel,
        fastModel,
      };

      await expect(avaReviewNode(state)).rejects.toThrow('No more responses available');
    });

    it('should work with only smart model provided', async () => {
      const smartModel = new TestChatModel([
        JSON.stringify({
          reviewer: 'Ava',
          verdict: 'approve',
          sections: [
            {
              area: 'Feasibility',
              assessment: 'Looks good',
              concerns: [],
            },
          ],
          comments: 'All good',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: AvaReviewState = {
        prd: 'Simple update',
        smartModel,
        // No fastModel provided
      };

      const result = await avaReviewNode(state);

      expect(result.avaReview).toBeDefined();
      expect(result.avaReview?.verdict).toBe('approve');
    });
  });
});
