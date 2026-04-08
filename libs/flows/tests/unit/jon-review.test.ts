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
        `<review>
  <reviewer>Jon</reviewer>
  <verdict>approve</verdict>
  <sections>
    <section>
      <area>Customer Impact</area>
      <assessment>Solves major user pain point, high satisfaction expected</assessment>
      <concerns></concerns>
    </section>
    <section>
      <area>ROI</area>
      <assessment>Strong ROI, 200% expected return within 6 months</assessment>
      <concerns></concerns>
    </section>
    <section>
      <area>Market Positioning</area>
      <assessment>Differentiates us from competitors</assessment>
      <concerns></concerns>
    </section>
    <section>
      <area>Priority</area>
      <assessment>Aligns perfectly with Q1 strategic goals</assessment>
      <concerns></concerns>
    </section>
  </sections>
  <comments>Strong business case. Proceed with implementation.</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
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
        `<review>
  <reviewer>Jon</reviewer>
  <verdict>approve-with-concerns</verdict>
  <sections>
    <section>
      <area>Customer Impact</area>
      <assessment>Good customer value but scope may be too broad</assessment>
      <concerns>
        <item>Feature creep risk</item>
        <item>May confuse non-technical users</item>
      </concerns>
      <recommendations>
        <item>Start with MVP, gather feedback</item>
      </recommendations>
    </section>
    <section>
      <area>ROI</area>
      <assessment>Positive ROI but uncertain timeline</assessment>
      <concerns>
        <item>Development cost may exceed budget</item>
        <item>Revenue impact depends on adoption rate</item>
      </concerns>
      <recommendations>
        <item>Set clear success metrics</item>
        <item>Plan phased rollout</item>
      </recommendations>
    </section>
    <section>
      <area>Market Positioning</area>
      <assessment>Maintains competitive parity</assessment>
      <concerns>
        <item>Not a differentiator, just keeps us competitive</item>
      </concerns>
    </section>
    <section>
      <area>Priority</area>
      <assessment>Important but not urgent</assessment>
      <concerns>
        <item>Other features may provide more immediate value</item>
      </concerns>
      <recommendations>
        <item>Consider prioritizing security features first</item>
      </recommendations>
    </section>
  </sections>
  <comments>Good business case but monitor scope and ROI closely.</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
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
        `<review>
  <reviewer>Jon</reviewer>
  <verdict>revise</verdict>
  <sections>
    <section>
      <area>Customer Impact</area>
      <assessment>Unclear target audience and value proposition</assessment>
      <concerns>
        <item>No user research cited</item>
        <item>Vague problem definition</item>
        <item>No success criteria</item>
      </concerns>
      <recommendations>
        <item>Conduct user interviews</item>
        <item>Define specific use cases</item>
        <item>Set measurable goals</item>
      </recommendations>
    </section>
    <section>
      <area>ROI</area>
      <assessment>Cannot assess ROI without clear metrics</assessment>
      <concerns>
        <item>No cost analysis</item>
        <item>No revenue projections</item>
        <item>No comparison to alternatives</item>
      </concerns>
      <recommendations>
        <item>Create detailed cost/benefit analysis</item>
        <item>Project revenue impact</item>
      </recommendations>
    </section>
    <section>
      <area>Market Positioning</area>
      <assessment>Positioning strategy unclear</assessment>
      <concerns>
        <item>How does this differentiate us?</item>
        <item>Competitive analysis missing</item>
      </concerns>
      <recommendations>
        <item>Research competitor offerings</item>
        <item>Define unique value proposition</item>
      </recommendations>
    </section>
    <section>
      <area>Priority</area>
      <assessment>Cannot prioritize without business case</assessment>
      <concerns>
        <item>No urgency explained</item>
        <item>Opportunity cost not considered</item>
      </concerns>
      <recommendations>
        <item>Justify timing</item>
        <item>Compare to other initiatives</item>
      </recommendations>
    </section>
  </sections>
  <comments>PRD needs significant revision. Clarify business value, target audience, and success metrics before proceeding.</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
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
        `<review>
  <reviewer>Jon</reviewer>
  <verdict>reject</verdict>
  <sections>
    <section>
      <area>Customer Impact</area>
      <assessment>Minimal customer value</assessment>
      <concerns>
        <item>Solves edge case for &lt;1% of users</item>
        <item>Customer feedback indicates low interest</item>
      </concerns>
    </section>
    <section>
      <area>ROI</area>
      <assessment>Negative ROI</assessment>
      <concerns>
        <item>High development cost</item>
        <item>No revenue opportunity</item>
        <item>Ongoing maintenance burden</item>
      </concerns>
    </section>
    <section>
      <area>Market Positioning</area>
      <assessment>No competitive advantage</assessment>
      <concerns>
        <item>Feature already commoditized</item>
        <item>Would not influence buying decisions</item>
      </concerns>
    </section>
    <section>
      <area>Priority</area>
      <assessment>Wrong priority for business goals</assessment>
      <concerns>
        <item>Misaligned with company strategy</item>
        <item>Opportunity cost too high</item>
        <item>Better alternatives exist</item>
      </concerns>
    </section>
  </sections>
  <comments>Cannot recommend this PRD. Poor business case, minimal customer value, and wrong strategic priority.</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
      ]);

      const state: JonReviewState = {
        prd: 'Build internal tool for rarely-used workflow',
        smartModel,
      };

      const result = await jonReviewNode(state);

      expect(result.jonReview).toBeDefined();
      expect(result.jonReview?.verdict).toBe('reject');
    });

    it('should handle XML in markdown code blocks', async () => {
      const smartModel = new TestChatModel([
        '```xml\n<review>\n  <reviewer>Jon</reviewer>\n  <verdict>approve</verdict>\n  <sections>\n    <section>\n      <area>Customer Impact</area>\n      <assessment>Good customer value</assessment>\n      <concerns></concerns>\n    </section>\n  </sections>\n  <comments>Looks good from business perspective</comments>\n  <timestamp>2024-01-01T00:00:00.000Z</timestamp>\n</review>\n```',
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
        `<review>
  <reviewer>Jon</reviewer>
  <verdict>approve-with-concerns</verdict>
  <sections>
    <section>
      <area>Customer Impact</area>
      <assessment>High customer value</assessment>
      <concerns></concerns>
    </section>
    <section>
      <area>ROI</area>
      <assessment>Good ROI if execution risks are managed</assessment>
      <concerns>
        <item>Ava flagged timeline and technical risks that could impact cost</item>
      </concerns>
      <recommendations>
        <item>Factor in Ava's recommended buffer when calculating ROI</item>
      </recommendations>
    </section>
    <section>
      <area>Market Positioning</area>
      <assessment>Strong competitive advantage</assessment>
      <concerns></concerns>
    </section>
    <section>
      <area>Priority</area>
      <assessment>High priority with execution caveats</assessment>
      <concerns>
        <item>Success depends on managing Ava's identified risks</item>
      </concerns>
    </section>
  </sections>
  <comments>Strong business case. Proceed but budget for Ava's recommended timeline buffer.</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
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
        `<review>
  <reviewer>Jon</reviewer>
  <verdict>approve</verdict>
  <sections>
    <section>
      <area>Customer Impact</area>
      <assessment>Clear customer value</assessment>
      <concerns></concerns>
    </section>
  </sections>
  <comments>Good business case</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
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
    it('should throw error on missing review root element', async () => {
      const smartModel = new TestChatModel(['This is not valid XML']);

      const state: JonReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(jonReviewNode(state)).rejects.toThrow('Failed to parse XML');
    });

    it('should throw error on missing verdict field', async () => {
      const smartModel = new TestChatModel([
        `<review>
  <reviewer>Jon</reviewer>
  <sections>
    <section>
      <area>Customer Impact</area>
      <assessment>Good</assessment>
      <concerns></concerns>
    </section>
  </sections>
  <comments>Test</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
      ]);

      const state: JonReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(jonReviewNode(state)).rejects.toThrow('Invalid review format');
    });

    it('should throw error on invalid verdict value', async () => {
      const smartModel = new TestChatModel([
        `<review>
  <reviewer>Jon</reviewer>
  <verdict>maybe</verdict>
  <sections>
    <section>
      <area>Customer Impact</area>
      <assessment>Good</assessment>
      <concerns></concerns>
    </section>
  </sections>
  <comments>Test</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
      ]);

      const state: JonReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(jonReviewNode(state)).rejects.toThrow('Invalid review format');
    });

    it('should throw error on empty review content', async () => {
      const smartModel = new TestChatModel([`<review></review>`]);

      const state: JonReviewState = {
        prd: 'Some PRD',
        smartModel,
      };

      await expect(jonReviewNode(state)).rejects.toThrow('Failed to parse XML');
    });
  });

  describe('fallback trigger', () => {
    it('should fall back to fast model when smart model fails', async () => {
      // Smart model throws error
      const smartModel = new TestChatModel([]);

      // Fast model provides valid response
      const fastModel = new TestChatModel([
        `<review>
  <reviewer>Jon</reviewer>
  <verdict>approve-with-concerns</verdict>
  <sections>
    <section>
      <area>Customer Impact</area>
      <assessment>From fast model - good customer value</assessment>
      <concerns>
        <item>Minor concern</item>
      </concerns>
    </section>
  </sections>
  <comments>Fallback review from fast model</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
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
        `<review>
  <reviewer>Jon</reviewer>
  <verdict>approve</verdict>
  <sections>
    <section>
      <area>Customer Impact</area>
      <assessment>Looks good</assessment>
      <concerns></concerns>
    </section>
  </sections>
  <comments>All good</comments>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</review>`,
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
