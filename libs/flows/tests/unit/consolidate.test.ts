/**
 * Tests for consolidate node
 *
 * Covers:
 * - Normal case: PROCEED verdict when reviewers agree
 * - MODIFY verdict when reviewers disagree or have concerns
 * - REJECT verdict when both reject
 * - Handling of pair reviews
 * - Malformed LLM output handling
 * - Model fallback trigger
 * - Consensus analysis validation
 */

import { describe, it, expect } from 'vitest';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage } from '@langchain/core/messages';
import {
  consolidateNode,
  type ConsolidateState,
} from '../../src/antagonistic-review/nodes/consolidate.js';
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

describe('consolidate node', () => {
  describe('PROCEED verdict', () => {
    it('should return PROCEED when both reviewers approve', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve',
        sections: [
          {
            area: 'Capacity',
            assessment: 'Sufficient capacity',
            concerns: [],
          },
          {
            area: 'Feasibility',
            assessment: 'Technically straightforward',
            concerns: [],
          },
        ],
        comments: 'Good to go from ops perspective',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const jonReview: ReviewerPerspective = {
        reviewer: 'Jon',
        verdict: 'approve',
        sections: [
          {
            area: 'Customer Impact',
            assessment: 'Clear customer value',
            concerns: [],
          },
          {
            area: 'ROI',
            assessment: 'Strong ROI',
            concerns: [],
          },
        ],
        comments: 'Strong business case',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel([
        JSON.stringify({
          verdict: 'PROCEED',
          consensusAnalysis: {
            agreement: [
              'Both reviewers approve',
              'No blocking concerns identified',
              'Clear execution path and business value',
            ],
            disagreement: [],
            resolution: 'Full consensus to proceed. Both operational and business perspectives aligned.',
          },
          finalPRD: 'Add loading spinner to submit button',
          summary: 'Approved by both Ava and Jon. Ready to proceed with implementation.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: ConsolidateState = {
        prd: 'Add loading spinner to submit button',
        avaReview,
        jonReview,
        smartModel,
      };

      const result = await consolidateNode(state);

      expect(result.consolidatedReview).toBeDefined();
      expect(result.consolidatedReview?.verdict).toBe('PROCEED');
      expect(result.consolidatedReview?.consensusAnalysis.agreement.length).toBeGreaterThan(0);
      expect(result.consolidatedReview?.consensusAnalysis.disagreement).toHaveLength(0);
      expect(result.consolidatedReview?.finalPRD).toBeTruthy();
      expect(result.consolidatedReview?.summary).toBeTruthy();
      expect(result.consolidatedReview?.timestamp).toBeTruthy();
    });

    it('should return PROCEED when concerns are minor', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve-with-concerns',
        sections: [
          {
            area: 'Capacity',
            assessment: 'Adequate but tight',
            concerns: ['May need to defer lower-priority tasks'],
            recommendations: ['Monitor sprint velocity'],
          },
        ],
        comments: 'Can proceed with monitoring',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const jonReview: ReviewerPerspective = {
        reviewer: 'Jon',
        verdict: 'approve',
        sections: [
          {
            area: 'Customer Impact',
            assessment: 'High value',
            concerns: [],
          },
        ],
        comments: 'Strong business case',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel([
        JSON.stringify({
          verdict: 'PROCEED',
          consensusAnalysis: {
            agreement: [
              'Both support moving forward',
              'High customer value (Jon)',
              'Execution is feasible (Ava)',
            ],
            disagreement: ['Ava notes capacity is tight but not blocking'],
            resolution: 'Minor concerns do not warrant blocking. Proceed with monitoring plan.',
          },
          finalPRD: 'Add loading spinner to submit button',
          summary: 'Approved with minor operational concerns. Monitor sprint velocity as recommended by Ava.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: ConsolidateState = {
        prd: 'Add loading spinner to submit button',
        avaReview,
        jonReview,
        smartModel,
      };

      const result = await consolidateNode(state);

      expect(result.consolidatedReview?.verdict).toBe('PROCEED');
      expect(result.consolidatedReview?.consensusAnalysis.disagreement.length).toBeGreaterThan(0);
    });
  });

  describe('MODIFY verdict', () => {
    it('should return MODIFY when one reviewer requests revision', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'revise',
        sections: [
          {
            area: 'Capacity',
            assessment: 'Insufficient capacity',
            concerns: ['Team at 120% capacity', 'No clear resource plan'],
            recommendations: ['Defer to next quarter', 'Reduce scope'],
          },
          {
            area: 'Risk',
            assessment: 'High technical risk',
            concerns: ['Undefined rollback plan'],
            recommendations: ['Document rollback procedure'],
          },
        ],
        comments: 'Cannot proceed without addressing capacity and risk concerns',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const jonReview: ReviewerPerspective = {
        reviewer: 'Jon',
        verdict: 'approve-with-concerns',
        sections: [
          {
            area: 'Customer Impact',
            assessment: 'Good customer value',
            concerns: ['Timing is important for market window'],
          },
        ],
        comments: 'Strong business case but timing matters',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel([
        JSON.stringify({
          verdict: 'MODIFY',
          consensusAnalysis: {
            agreement: ['Both see value in the initiative'],
            disagreement: [
              'Ava: serious capacity and risk concerns',
              'Jon: wants to proceed due to market timing',
            ],
            resolution: 'PRD needs modification to address Ava\'s operational concerns while preserving Jon\'s business objectives. Reduce scope or adjust timeline.',
          },
          finalPRD: 'MODIFIED: Launch real-time collaborative editing - PHASE 1 (reduced scope)\n\nAddress capacity by reducing initial scope to basic editing only. Full feature set deferred to Q2. Rollback plan documented in deployment guide.',
          summary: 'Modified PRD to address capacity and risk concerns while maintaining business value. Phased approach reduces operational burden.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: ConsolidateState = {
        prd: 'Launch real-time collaborative editing',
        avaReview,
        jonReview,
        smartModel,
      };

      const result = await consolidateNode(state);

      expect(result.consolidatedReview?.verdict).toBe('MODIFY');
      expect(result.consolidatedReview?.consensusAnalysis.disagreement.length).toBeGreaterThan(0);
      expect(result.consolidatedReview?.finalPRD).toContain('MODIFIED');
    });

    it('should return MODIFY when both have concerns', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve-with-concerns',
        sections: [
          {
            area: 'Risk',
            assessment: 'Moderate risk',
            concerns: ['Third-party dependency'],
            recommendations: ['Add circuit breaker'],
          },
        ],
        comments: 'Concerns need addressing',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const jonReview: ReviewerPerspective = {
        reviewer: 'Jon',
        verdict: 'approve-with-concerns',
        sections: [
          {
            area: 'ROI',
            assessment: 'Uncertain ROI',
            concerns: ['Cost projections unclear'],
            recommendations: ['Define success metrics'],
          },
        ],
        comments: 'Need clearer metrics',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel([
        JSON.stringify({
          verdict: 'MODIFY',
          consensusAnalysis: {
            agreement: ['Both support the concept'],
            disagreement: [
              'Both raised concerns that need addressing',
              'Ava: technical risk mitigation needed',
              'Jon: business metrics unclear',
            ],
            resolution: 'While both approve conceptually, the combined concerns warrant PRD updates to de-risk and clarify expectations.',
          },
          finalPRD: 'MODIFIED: Integrate payment gateway\n\nUpdates:\n- Add circuit breaker pattern (Ava)\n- Define success metrics: 95% uptime, <2s latency (Jon)\n- Cost projection: $50K dev + $10K/mo operational',
          summary: 'PRD updated to address both operational risk and business metrics concerns.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: ConsolidateState = {
        prd: 'Integrate payment gateway',
        avaReview,
        jonReview,
        smartModel,
      };

      const result = await consolidateNode(state);

      expect(result.consolidatedReview?.verdict).toBe('MODIFY');
    });
  });

  describe('REJECT verdict', () => {
    it('should return REJECT when both reviewers reject', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'reject',
        sections: [
          {
            area: 'Capacity',
            assessment: 'No available capacity',
            concerns: ['Would require 3 FTEs for 6 months', 'No engineers available'],
          },
          {
            area: 'Feasibility',
            assessment: 'Not technically feasible',
            concerns: ['Current infrastructure cannot support this'],
          },
        ],
        comments: 'Cannot execute with current resources and infrastructure',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const jonReview: ReviewerPerspective = {
        reviewer: 'Jon',
        verdict: 'reject',
        sections: [
          {
            area: 'Customer Impact',
            assessment: 'Minimal value',
            concerns: ['Solves edge case for <1% users'],
          },
          {
            area: 'ROI',
            assessment: 'Negative ROI',
            concerns: ['High cost, no revenue opportunity'],
          },
        ],
        comments: 'Poor business case',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel([
        JSON.stringify({
          verdict: 'REJECT',
          consensusAnalysis: {
            agreement: [
              'Both reviewers recommend rejection',
              'Ava: operationally not feasible',
              'Jon: business case insufficient',
            ],
            disagreement: [],
            resolution: 'Clear consensus to reject. Both operational and business perspectives align that this PRD should not proceed.',
          },
          finalPRD: 'Build internal tool for rarely-used workflow',
          summary: 'Rejected by both reviewers. Operationally infeasible and poor business case. Recommend exploring alternative solutions.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: ConsolidateState = {
        prd: 'Build internal tool for rarely-used workflow',
        avaReview,
        jonReview,
        smartModel,
      };

      const result = await consolidateNode(state);

      expect(result.consolidatedReview?.verdict).toBe('REJECT');
      expect(result.consolidatedReview?.consensusAnalysis.agreement).toContain(
        'Both reviewers recommend rejection'
      );
    });

    it('should return REJECT when concerns are fundamental', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve-with-concerns',
        sections: [
          {
            area: 'Risk',
            assessment: 'Some concerns',
            concerns: ['Minor technical debt'],
          },
        ],
        comments: 'Can proceed with caution',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const jonReview: ReviewerPerspective = {
        reviewer: 'Jon',
        verdict: 'reject',
        sections: [
          {
            area: 'Customer Impact',
            assessment: 'No customer value',
            concerns: ['Does not solve user problem', 'User research shows no demand'],
          },
          {
            area: 'Priority',
            assessment: 'Wrong strategic direction',
            concerns: ['Misaligned with company goals'],
          },
        ],
        comments: 'Fundamental strategic issues',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel([
        JSON.stringify({
          verdict: 'REJECT',
          consensusAnalysis: {
            agreement: ['Technical execution is feasible (Ava)'],
            disagreement: [
              'Jon identifies fundamental business issues',
              'Strategic misalignment and no customer value',
            ],
            resolution: 'Jon\'s rejection based on fundamental business concerns overrides Ava\'s operational approval. Cannot proceed with strategically misaligned initiative.',
          },
          finalPRD: 'Feature X',
          summary: 'Rejected due to fundamental business concerns. Even though technically feasible, strategic misalignment and lack of customer value make this a non-starter.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: ConsolidateState = {
        prd: 'Feature X',
        avaReview,
        jonReview,
        smartModel,
      };

      const result = await consolidateNode(state);

      expect(result.consolidatedReview?.verdict).toBe('REJECT');
    });
  });

  describe('pair reviews', () => {
    it('should handle additional pair reviews in consolidation', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve',
        sections: [
          {
            area: 'Capacity',
            assessment: 'Good capacity',
            concerns: [],
          },
        ],
        comments: 'Ops approved',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const jonReview: ReviewerPerspective = {
        reviewer: 'Jon',
        verdict: 'approve',
        sections: [
          {
            area: 'Customer Impact',
            assessment: 'Good value',
            concerns: [],
          },
        ],
        comments: 'Business approved',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const pairReviews: ReviewerPerspective[] = [
        {
          reviewer: 'Security Team',
          verdict: 'approve-with-concerns',
          sections: [
            {
              area: 'Security',
              assessment: 'Needs security review',
              concerns: ['PII handling not documented'],
              recommendations: ['Add data encryption'],
            },
          ],
          comments: 'Add security measures',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      ];

      const smartModel = new TestChatModel([
        JSON.stringify({
          verdict: 'MODIFY',
          consensusAnalysis: {
            agreement: [
              'All approve the initiative',
              'Ava and Jon have no concerns',
            ],
            disagreement: [
              'Security Team raises PII handling concerns',
            ],
            resolution: 'While Ava and Jon approve, Security Team\'s concerns about PII handling must be addressed. Modify PRD to include security requirements.',
          },
          finalPRD: 'MODIFIED: User profile feature\n\nAdded security section:\n- Encrypt PII at rest\n- Document data retention policy\n- Security review before launch',
          summary: 'PRD modified to address security concerns while maintaining business and operational approval.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: ConsolidateState = {
        prd: 'User profile feature',
        avaReview,
        jonReview,
        pairReviews,
        smartModel,
      };

      const result = await consolidateNode(state);

      expect(result.consolidatedReview?.verdict).toBe('MODIFY');
      expect(result.consolidatedReview?.consensusAnalysis.disagreement).toContain(
        'Security Team raises PII handling concerns'
      );
    });

    it('should handle multiple pair reviews', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve',
        sections: [{ area: 'Capacity', assessment: 'Good', concerns: [] }],
        comments: 'Approved',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const jonReview: ReviewerPerspective = {
        reviewer: 'Jon',
        verdict: 'approve',
        sections: [{ area: 'ROI', assessment: 'Good', concerns: [] }],
        comments: 'Approved',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const pairReviews: ReviewerPerspective[] = [
        {
          reviewer: 'Security',
          verdict: 'approve',
          sections: [{ area: 'Security', assessment: 'Secure', concerns: [] }],
          comments: 'Secure',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
        {
          reviewer: 'Legal',
          verdict: 'approve',
          sections: [{ area: 'Compliance', assessment: 'Compliant', concerns: [] }],
          comments: 'Compliant',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      ];

      const smartModel = new TestChatModel([
        JSON.stringify({
          verdict: 'PROCEED',
          consensusAnalysis: {
            agreement: [
              'All four reviewers approve',
              'No concerns from any perspective',
            ],
            disagreement: [],
            resolution: 'Full consensus across all reviewers. Ready to proceed.',
          },
          finalPRD: 'Feature with full approval',
          summary: 'Approved by Ava, Jon, Security, and Legal. No concerns.',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: ConsolidateState = {
        prd: 'Feature with full approval',
        avaReview,
        jonReview,
        pairReviews,
        smartModel,
      };

      const result = await consolidateNode(state);

      expect(result.consolidatedReview?.verdict).toBe('PROCEED');
    });
  });

  describe('error handling', () => {
    it('should throw error when no reviews available', async () => {
      const smartModel = new TestChatModel([]);

      const state: ConsolidateState = {
        prd: 'Some PRD',
        smartModel,
        // No reviews provided
      };

      await expect(consolidateNode(state)).rejects.toThrow('No reviews available');
    });

    it('should throw error on invalid JSON', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve',
        sections: [{ area: 'Capacity', assessment: 'Good', concerns: [] }],
        comments: 'Good',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel(['This is not valid JSON']);

      const state: ConsolidateState = {
        prd: 'Some PRD',
        avaReview,
        smartModel,
      };

      await expect(consolidateNode(state)).rejects.toThrow('Failed to parse JSON');
    });

    it('should throw error on missing required fields', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve',
        sections: [{ area: 'Capacity', assessment: 'Good', concerns: [] }],
        comments: 'Good',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel([
        JSON.stringify({
          verdict: 'PROCEED',
          // missing consensusAnalysis, finalPRD, summary
        }),
      ]);

      const state: ConsolidateState = {
        prd: 'Some PRD',
        avaReview,
        smartModel,
      };

      await expect(consolidateNode(state)).rejects.toThrow('Invalid consolidation format');
    });

    it('should throw error on invalid verdict value', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve',
        sections: [{ area: 'Capacity', assessment: 'Good', concerns: [] }],
        comments: 'Good',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel([
        JSON.stringify({
          verdict: 'MAYBE', // invalid value
          consensusAnalysis: {
            agreement: [],
            disagreement: [],
            resolution: 'Test',
          },
          finalPRD: 'Test',
          summary: 'Test',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: ConsolidateState = {
        prd: 'Some PRD',
        avaReview,
        smartModel,
      };

      await expect(consolidateNode(state)).rejects.toThrow('Invalid consolidation format');
    });

    it('should handle JSON in markdown code blocks', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve',
        sections: [{ area: 'Capacity', assessment: 'Good', concerns: [] }],
        comments: 'Good',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel([
        '```json\n' +
          JSON.stringify({
            verdict: 'PROCEED',
            consensusAnalysis: {
              agreement: ['All good'],
              disagreement: [],
              resolution: 'Proceed',
            },
            finalPRD: 'Test PRD',
            summary: 'Approved',
            timestamp: '2024-01-01T00:00:00.000Z',
          }) +
          '\n```',
      ]);

      const state: ConsolidateState = {
        prd: 'Test PRD',
        avaReview,
        smartModel,
      };

      const result = await consolidateNode(state);

      expect(result.consolidatedReview?.verdict).toBe('PROCEED');
    });
  });

  describe('fallback trigger', () => {
    it('should fall back to fast model when smart model fails', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve',
        sections: [{ area: 'Capacity', assessment: 'Good', concerns: [] }],
        comments: 'Good',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Smart model throws error
      const smartModel = new TestChatModel([]);

      // Fast model provides valid response
      const fastModel = new TestChatModel([
        JSON.stringify({
          verdict: 'PROCEED',
          consensusAnalysis: {
            agreement: ['From fast model - consensus reached'],
            disagreement: [],
            resolution: 'Fallback model resolved successfully',
          },
          finalPRD: 'Feature X',
          summary: 'Consolidated by fast model',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: ConsolidateState = {
        prd: 'Feature X',
        avaReview,
        smartModel,
        fastModel,
      };

      const result = await consolidateNode(state);

      // Should succeed with fast model's response
      expect(result.consolidatedReview).toBeDefined();
      expect(result.consolidatedReview?.verdict).toBe('PROCEED');
      expect(result.consolidatedReview?.summary).toContain('fast model');
    });

    it('should throw error when all models fail', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve',
        sections: [{ area: 'Capacity', assessment: 'Good', concerns: [] }],
        comments: 'Good',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel([]);
      const fastModel = new TestChatModel([]);

      const state: ConsolidateState = {
        prd: 'Some PRD',
        avaReview,
        smartModel,
        fastModel,
      };

      await expect(consolidateNode(state)).rejects.toThrow('No more responses available');
    });

    it('should work with only smart model provided', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve',
        sections: [{ area: 'Capacity', assessment: 'Good', concerns: [] }],
        comments: 'Good',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel([
        JSON.stringify({
          verdict: 'PROCEED',
          consensusAnalysis: {
            agreement: ['All approved'],
            disagreement: [],
            resolution: 'Ready to proceed',
          },
          finalPRD: 'Simple update',
          summary: 'All good',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      ]);

      const state: ConsolidateState = {
        prd: 'Simple update',
        avaReview,
        smartModel,
        // No fastModel provided
      };

      const result = await consolidateNode(state);

      expect(result.consolidatedReview?.verdict).toBe('PROCEED');
    });
  });
});
