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
        `<consolidation>
  <verdict>PROCEED</verdict>
  <consensus_analysis>
    <agreement>
      <item>Both reviewers approve</item>
      <item>No blocking concerns identified</item>
      <item>Clear execution path and business value</item>
    </agreement>
    <disagreement></disagreement>
    <resolution>Full consensus to proceed. Both operational and business perspectives aligned.</resolution>
  </consensus_analysis>
  <final_prd>Add loading spinner to submit button</final_prd>
  <summary>Approved by both Ava and Jon. Ready to proceed with implementation.</summary>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</consolidation>`,
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
        `<consolidation>
  <verdict>PROCEED</verdict>
  <consensus_analysis>
    <agreement>
      <item>Both support moving forward</item>
      <item>High customer value (Jon)</item>
      <item>Execution is feasible (Ava)</item>
    </agreement>
    <disagreement>
      <item>Ava notes capacity is tight but not blocking</item>
    </disagreement>
    <resolution>Minor concerns do not warrant blocking. Proceed with monitoring plan.</resolution>
  </consensus_analysis>
  <final_prd>Add loading spinner to submit button</final_prd>
  <summary>Approved with minor operational concerns. Monitor sprint velocity as recommended by Ava.</summary>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</consolidation>`,
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
        `<consolidation>
  <verdict>MODIFY</verdict>
  <consensus_analysis>
    <agreement>
      <item>Both see value in the initiative</item>
    </agreement>
    <disagreement>
      <item>Ava: serious capacity and risk concerns</item>
      <item>Jon: wants to proceed due to market timing</item>
    </disagreement>
    <resolution>PRD needs modification to address Ava's operational concerns while preserving Jon's business objectives. Reduce scope or adjust timeline.</resolution>
  </consensus_analysis>
  <final_prd>MODIFIED: Launch real-time collaborative editing - PHASE 1 (reduced scope)

Address capacity by reducing initial scope to basic editing only. Full feature set deferred to Q2. Rollback plan documented in deployment guide.</final_prd>
  <summary>Modified PRD to address capacity and risk concerns while maintaining business value. Phased approach reduces operational burden.</summary>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</consolidation>`,
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
        `<consolidation>
  <verdict>MODIFY</verdict>
  <consensus_analysis>
    <agreement>
      <item>Both support the concept</item>
    </agreement>
    <disagreement>
      <item>Both raised concerns that need addressing</item>
      <item>Ava: technical risk mitigation needed</item>
      <item>Jon: business metrics unclear</item>
    </disagreement>
    <resolution>While both approve conceptually, the combined concerns warrant PRD updates to de-risk and clarify expectations.</resolution>
  </consensus_analysis>
  <final_prd>MODIFIED: Integrate payment gateway

Updates:
- Add circuit breaker pattern (Ava)
- Define success metrics: 95% uptime, &lt;2s latency (Jon)
- Cost projection: $50K dev + $10K/mo operational</final_prd>
  <summary>PRD updated to address both operational risk and business metrics concerns.</summary>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</consolidation>`,
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
        `<consolidation>
  <verdict>REJECT</verdict>
  <consensus_analysis>
    <agreement>
      <item>Both reviewers recommend rejection</item>
      <item>Ava: operationally not feasible</item>
      <item>Jon: business case insufficient</item>
    </agreement>
    <disagreement></disagreement>
    <resolution>Clear consensus to reject. Both operational and business perspectives align that this PRD should not proceed.</resolution>
  </consensus_analysis>
  <final_prd>Build internal tool for rarely-used workflow</final_prd>
  <summary>Rejected by both reviewers. Operationally infeasible and poor business case. Recommend exploring alternative solutions.</summary>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</consolidation>`,
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
        `<consolidation>
  <verdict>REJECT</verdict>
  <consensus_analysis>
    <agreement>
      <item>Technical execution is feasible (Ava)</item>
    </agreement>
    <disagreement>
      <item>Jon identifies fundamental business issues</item>
      <item>Strategic misalignment and no customer value</item>
    </disagreement>
    <resolution>Jon's rejection based on fundamental business concerns overrides Ava's operational approval. Cannot proceed with strategically misaligned initiative.</resolution>
  </consensus_analysis>
  <final_prd>Feature X</final_prd>
  <summary>Rejected due to fundamental business concerns. Even though technically feasible, strategic misalignment and lack of customer value make this a non-starter.</summary>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</consolidation>`,
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
        `<consolidation>
  <verdict>MODIFY</verdict>
  <consensus_analysis>
    <agreement>
      <item>All approve the initiative</item>
      <item>Ava and Jon have no concerns</item>
    </agreement>
    <disagreement>
      <item>Security Team raises PII handling concerns</item>
    </disagreement>
    <resolution>While Ava and Jon approve, Security Team's concerns about PII handling must be addressed. Modify PRD to include security requirements.</resolution>
  </consensus_analysis>
  <final_prd>MODIFIED: User profile feature

Added security section:
- Encrypt PII at rest
- Document data retention policy
- Security review before launch</final_prd>
  <summary>PRD modified to address security concerns while maintaining business and operational approval.</summary>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</consolidation>`,
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
        `<consolidation>
  <verdict>PROCEED</verdict>
  <consensus_analysis>
    <agreement>
      <item>All four reviewers approve</item>
      <item>No concerns from any perspective</item>
    </agreement>
    <disagreement></disagreement>
    <resolution>Full consensus across all reviewers. Ready to proceed.</resolution>
  </consensus_analysis>
  <final_prd>Feature with full approval</final_prd>
  <summary>Approved by Ava, Jon, Security, and Legal. No concerns.</summary>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</consolidation>`,
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

    it('should throw error on missing consolidation root element', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve',
        sections: [{ area: 'Capacity', assessment: 'Good', concerns: [] }],
        comments: 'Good',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel(['This is not valid XML']);

      const state: ConsolidateState = {
        prd: 'Some PRD',
        avaReview,
        smartModel,
      };

      await expect(consolidateNode(state)).rejects.toThrow('Failed to parse XML');
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
        `<consolidation>
  <consensus_analysis>
    <agreement></agreement>
    <disagreement></disagreement>
    <resolution>Test</resolution>
  </consensus_analysis>
  <final_prd>Test</final_prd>
  <summary>Test</summary>
</consolidation>`,
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
        `<consolidation>
  <verdict>MAYBE</verdict>
  <consensus_analysis>
    <agreement></agreement>
    <disagreement></disagreement>
    <resolution>Test</resolution>
  </consensus_analysis>
  <final_prd>Test</final_prd>
  <summary>Test</summary>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</consolidation>`,
      ]);

      const state: ConsolidateState = {
        prd: 'Some PRD',
        avaReview,
        smartModel,
      };

      await expect(consolidateNode(state)).rejects.toThrow('Invalid consolidation format');
    });

    it('should handle XML in markdown code blocks', async () => {
      const avaReview: ReviewerPerspective = {
        reviewer: 'Ava',
        verdict: 'approve',
        sections: [{ area: 'Capacity', assessment: 'Good', concerns: [] }],
        comments: 'Good',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const smartModel = new TestChatModel([
        '```xml\n<consolidation>\n  <verdict>PROCEED</verdict>\n  <consensus_analysis>\n    <agreement><item>All good</item></agreement>\n    <disagreement></disagreement>\n    <resolution>Proceed</resolution>\n  </consensus_analysis>\n  <final_prd>Test PRD</final_prd>\n  <summary>Approved</summary>\n  <timestamp>2024-01-01T00:00:00.000Z</timestamp>\n</consolidation>\n```',
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
        `<consolidation>
  <verdict>PROCEED</verdict>
  <consensus_analysis>
    <agreement>
      <item>From fast model - consensus reached</item>
    </agreement>
    <disagreement></disagreement>
    <resolution>Fallback model resolved successfully</resolution>
  </consensus_analysis>
  <final_prd>Feature X</final_prd>
  <summary>Consolidated by fast model</summary>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</consolidation>`,
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
        `<consolidation>
  <verdict>PROCEED</verdict>
  <consensus_analysis>
    <agreement>
      <item>All approved</item>
    </agreement>
    <disagreement></disagreement>
    <resolution>Ready to proceed</resolution>
  </consensus_analysis>
  <final_prd>Simple update</final_prd>
  <summary>All good</summary>
  <timestamp>2024-01-01T00:00:00.000Z</timestamp>
</consolidation>`,
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
