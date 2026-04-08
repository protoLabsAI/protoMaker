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
        `<review>
  <reviewer>Ava</reviewer>
  <verdict>approve</verdict>
  <sections>
    <section>
      <area>Capacity</area>
      <assessment>Team has sufficient bandwidth</assessment>
      <concerns></concerns>
    </section>
    <section>
      <area>Risk</area>
      <assessment>Low risk, well-understood domain</assessment>
      <concerns></concerns>
    </section>
    <section>
      <area>Tech Debt</area>
      <assessment>Neutral impact on tech debt</assessment>
      <concerns></concerns>
    </section>
    <section>
      <area>Feasibility</area>
      <assessment>Straightforward implementation</assessment>
      <concerns></concerns>
    </section>
  </sections>
  <comments>Clean, low-risk change. Ready to proceed.</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
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
        `<review>
  <reviewer>Ava</reviewer>
  <verdict>approve-with-concerns</verdict>
  <sections>
    <section>
      <area>Capacity</area>
      <assessment>Tight timeline but manageable</assessment>
      <concerns>
        <item>May require overtime during peak sprint</item>
      </concerns>
      <recommendations>
        <item>Add 1 week buffer to timeline</item>
      </recommendations>
    </section>
    <section>
      <area>Risk</area>
      <assessment>Moderate risk with third-party API</assessment>
      <concerns>
        <item>API rate limits not documented</item>
        <item>No fallback mechanism</item>
      </concerns>
      <recommendations>
        <item>Implement rate limiting</item>
        <item>Add circuit breaker pattern</item>
      </recommendations>
    </section>
    <section>
      <area>Tech Debt</area>
      <assessment>Will add some technical debt</assessment>
      <concerns>
        <item>Quick implementation may skip best practices</item>
      </concerns>
      <recommendations>
        <item>Schedule refactoring in next sprint</item>
      </recommendations>
    </section>
    <section>
      <area>Feasibility</area>
      <assessment>Feasible with caveats</assessment>
      <concerns>
        <item>Dependency on external team deliverable</item>
      </concerns>
    </section>
  </sections>
  <comments>Can proceed but monitor the identified concerns closely.</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
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
        `<review>
  <reviewer>Ava</reviewer>
  <verdict>revise</verdict>
  <sections>
    <section>
      <area>Capacity</area>
      <assessment>Insufficient team capacity</assessment>
      <concerns>
        <item>Team already at 120% capacity</item>
        <item>No clear resource allocation plan</item>
      </concerns>
      <recommendations>
        <item>Defer to next quarter</item>
        <item>Hire additional engineer</item>
      </recommendations>
    </section>
    <section>
      <area>Risk</area>
      <assessment>High risk, unclear requirements</assessment>
      <concerns>
        <item>Vague success criteria</item>
        <item>No rollback plan defined</item>
      </concerns>
      <recommendations>
        <item>Define specific KPIs</item>
        <item>Document rollback procedure</item>
      </recommendations>
    </section>
    <section>
      <area>Tech Debt</area>
      <assessment>Will significantly increase tech debt</assessment>
      <concerns>
        <item>Proposed shortcut will make future features harder</item>
      </concerns>
    </section>
    <section>
      <area>Feasibility</area>
      <assessment>Not feasible without infrastructure upgrade</assessment>
      <concerns>
        <item>Current database cannot handle projected load</item>
      </concerns>
      <recommendations>
        <item>Upgrade to scalable database solution first</item>
      </recommendations>
    </section>
  </sections>
  <comments>PRD needs revision before we can commit resources. Address capacity, requirements clarity, and infrastructure concerns.</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
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
        `<review>
  <reviewer>Ava</reviewer>
  <verdict>reject</verdict>
  <sections>
    <section>
      <area>Capacity</area>
      <assessment>No available capacity</assessment>
      <concerns>
        <item>Would require 3 full-time engineers for 6 months</item>
        <item>No engineers available</item>
      </concerns>
    </section>
    <section>
      <area>Risk</area>
      <assessment>Extreme risk</assessment>
      <concerns>
        <item>Would require complete system rewrite</item>
        <item>High probability of data loss</item>
        <item>Cannot guarantee backward compatibility</item>
      </concerns>
    </section>
    <section>
      <area>Tech Debt</area>
      <assessment>Would create massive technical debt</assessment>
      <concerns>
        <item>Legacy approach being proposed</item>
        <item>Will block future initiatives</item>
      </concerns>
    </section>
    <section>
      <area>Feasibility</area>
      <assessment>Not feasible with current technology</assessment>
      <concerns>
        <item>Required technology does not exist</item>
        <item>Physics constraints</item>
      </concerns>
    </section>
  </sections>
  <comments>Cannot recommend proceeding with this PRD. Fundamental issues with capacity, risk, and feasibility.</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
      ]);

      const state: AvaReviewState = {
        prd: 'Implement real-time video AI analysis at 1000fps for all user uploads',
        smartModel,
      };

      const result = await avaReviewNode(state);

      expect(result.avaReview).toBeDefined();
      expect(result.avaReview?.verdict).toBe('reject');
    });

    it('should handle XML in markdown code blocks', async () => {
      const smartModel = new TestChatModel([
        '```xml\n<review>\n  <reviewer>Ava</reviewer>\n  <verdict>approve</verdict>\n  <sections>\n    <section>\n      <area>Capacity</area>\n      <assessment>Good</assessment>\n      <concerns></concerns>\n    </section>\n  </sections>\n  <comments>Looks good</comments>\n  <timestamp>2024-01-01T00:00:00.000Z</timestamp>\n</review>\n```',
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
    it('should throw error on missing review root element', async () => {
      const smartModel = new TestChatModel(['This is not valid XML']);

      const state: AvaReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(avaReviewNode(state)).rejects.toThrow('Failed to parse XML');
    });

    it('should throw error on missing verdict field', async () => {
      const smartModel = new TestChatModel([
        `<review>
  <reviewer>Ava</reviewer>
  <sections>
    <section>
      <area>Capacity</area>
      <assessment>Good</assessment>
      <concerns></concerns>
    </section>
  </sections>
  <comments>Test</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
      ]);

      const state: AvaReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(avaReviewNode(state)).rejects.toThrow('Invalid review format');
    });

    it('should throw error on invalid verdict value', async () => {
      const smartModel = new TestChatModel([
        `<review>
  <reviewer>Ava</reviewer>
  <verdict>maybe</verdict>
  <sections>
    <section>
      <area>Capacity</area>
      <assessment>Good</assessment>
      <concerns></concerns>
    </section>
  </sections>
  <comments>Test</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
      ]);

      const state: AvaReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(avaReviewNode(state)).rejects.toThrow('Invalid review format');
    });

    it('should throw error on empty review content', async () => {
      const smartModel = new TestChatModel([`<review></review>`]);

      const state: AvaReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(avaReviewNode(state)).rejects.toThrow('Failed to parse XML');
    });
  });

  describe('fallback trigger', () => {
    it('should fall back to fast model when smart model fails', async () => {
      // Smart model throws error
      const smartModel = new TestChatModel([]);

      // Fast model provides valid response
      const fastModel = new TestChatModel([
        `<review>
  <reviewer>Ava</reviewer>
  <verdict>approve-with-concerns</verdict>
  <sections>
    <section>
      <area>Capacity</area>
      <assessment>From fast model - adequate capacity</assessment>
      <concerns>
        <item>Minor concern</item>
      </concerns>
    </section>
  </sections>
  <comments>Fallback review from fast model</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
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
        `<review>
  <reviewer>Ava</reviewer>
  <verdict>approve</verdict>
  <sections>
    <section>
      <area>Feasibility</area>
      <assessment>Looks good</assessment>
      <concerns></concerns>
    </section>
  </sections>
  <comments>All good</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
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
