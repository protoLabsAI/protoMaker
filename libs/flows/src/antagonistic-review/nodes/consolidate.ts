/**
 * Consolidate Node
 *
 * Takes the PRD and all reviewer perspectives (Ava + Jon + optional pair reviews)
 * and synthesizes them into a final consolidated PRD with a clear verdict.
 *
 * The consolidation:
 * - Merges all perspectives into a coherent final assessment
 * - Identifies areas of agreement and disagreement
 * - Resolves conflicts by weighing different concerns
 * - Produces a final verdict: PROCEED, MODIFY, or REJECT
 * - Updates the PRD with consolidated recommendations if needed
 *
 * Verdict mapping:
 * - PROCEED: All reviewers approve or minor concerns that don't block progress
 * - MODIFY: Significant concerns that require PRD changes before proceeding
 * - REJECT: Fundamental issues identified, cannot proceed with this PRD
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import { executeWithFallback } from './classify-topic.js';
import { type ReviewerPerspective, type NodeTokenUsage } from './ava-review.js';

/**
 * Final verdict schema for consolidated review
 */
export const FinalVerdictSchema = z.enum(['PROCEED', 'MODIFY', 'REJECT']);
export type FinalVerdict = z.infer<typeof FinalVerdictSchema>;

/**
 * Agreement/disagreement analysis schema
 */
export const ConsensusAnalysisSchema = z.object({
  agreement: z.array(z.string()),
  disagreement: z.array(z.string()),
  resolution: z.string(),
});
export type ConsensusAnalysis = z.infer<typeof ConsensusAnalysisSchema>;

/**
 * Consolidated review result schema
 */
export const ConsolidatedReviewSchema = z.object({
  verdict: FinalVerdictSchema,
  consensusAnalysis: ConsensusAnalysisSchema,
  finalPRD: z.string(),
  summary: z.string(),
  timestamp: z.string(),
});
export type ConsolidatedReview = z.infer<typeof ConsolidatedReviewSchema>;

/**
 * State interface for consolidate node
 */
export interface ConsolidateState {
  prd: string;
  avaReview?: ReviewerPerspective;
  jonReview?: ReviewerPerspective;
  pairReviews?: ReviewerPerspective[];
  consolidatedReview?: ConsolidatedReview;
  tokenUsage?: NodeTokenUsage;
  smartModel?: BaseChatModel;
  fastModel?: BaseChatModel;
}

/**
 * Consolidate Node - Merges all review perspectives into final PRD with verdict
 *
 * @param state - Node state containing PRD and all reviews
 * @returns Partial state with consolidated review
 */
export async function consolidateNode(state: ConsolidateState): Promise<Partial<ConsolidateState>> {
  const { prd, avaReview, jonReview, pairReviews = [], smartModel, fastModel } = state;
  const nodeName = 'ConsolidateNode';

  console.log(`[${nodeName}] Starting review consolidation`);

  // Collect all reviews
  const allReviews: ReviewerPerspective[] = [];
  if (avaReview) allReviews.push(avaReview);
  if (jonReview) allReviews.push(jonReview);
  allReviews.push(...pairReviews);

  if (allReviews.length === 0) {
    throw new Error(`[${nodeName}] No reviews available to consolidate`);
  }

  try {
    // Build review summary
    const reviewSummary = allReviews
      .map(
        (review) =>
          `
${review.reviewer} (${review.verdict}):
${review.sections
  .map(
    (section) =>
      `  - ${section.area}: ${section.assessment}${
        section.concerns.length > 0 ? `\n    Concerns: ${section.concerns.join('; ')}` : ''
      }${
        section.recommendations && section.recommendations.length > 0
          ? `\n    Recommendations: ${section.recommendations.join('; ')}`
          : ''
      }`
  )
  .join('\n')}
Summary: ${review.comments}
`
      )
      .join('\n---\n');

    // Execute with model fallback, capturing both content and token usage
    const result = await executeWithFallback(
      { primary: smartModel, fallback: fastModel },
      async (model) => {
        const response = await model.invoke([
          {
            role: 'user',
            content: `You are the consolidation agent responsible for synthesizing multiple review perspectives into a final decision.

Original PRD:
${prd}

Review Perspectives:
${reviewSummary}

Your task:
1. Analyze areas of agreement and disagreement across all reviews
2. Resolve conflicts by weighing operational (Ava) and business (Jon) concerns
3. Determine a final verdict: PROCEED, MODIFY, or REJECT
4. Produce an updated PRD that incorporates key recommendations (if MODIFY) or the original PRD (if PROCEED)

Verdict guidelines:
- PROCEED: All reviewers approve OR only minor concerns that don't block progress
  - Example: Both approve, or one approve + one approve-with-concerns
- MODIFY: Significant concerns require PRD changes before proceeding
  - Example: One or both say "revise", or serious concerns raised
  - Update PRD to address the key recommendations
- REJECT: Fundamental issues identified, cannot proceed
  - Example: One or both say "reject", or irreconcilable conflicts

Provide your consolidation in the following JSON format:
{
  "verdict": "PROCEED" | "MODIFY" | "REJECT",
  "consensusAnalysis": {
    "agreement": ["List points where reviewers agree"],
    "disagreement": ["List points where reviewers disagree"],
    "resolution": "How conflicts were resolved and why this verdict was chosen"
  },
  "finalPRD": "Updated PRD text (with changes if MODIFY, original if PROCEED/REJECT)",
  "summary": "Executive summary of the consolidated decision",
  "timestamp": "${new Date().toISOString()}"
}

Be thorough, fair, and prioritize both customer value (Jon's focus) and execution feasibility (Ava's focus). Return ONLY the JSON object, no additional text.`,
          },
        ]);

        const usageMeta = response.usage_metadata;
        const fallbackUsage = (response.response_metadata as any)?.usage;
        let tokenUsage: NodeTokenUsage | undefined;
        if (usageMeta) {
          tokenUsage = {
            inputTokens: usageMeta.input_tokens,
            outputTokens: usageMeta.output_tokens,
          };
        } else if (fallbackUsage) {
          tokenUsage = {
            inputTokens: fallbackUsage.prompt_tokens ?? 0,
            outputTokens: fallbackUsage.completion_tokens ?? 0,
          };
        }

        return { content: response.content.toString(), tokenUsage };
      },
      nodeName
    );

    // Parse and validate the LLM response
    const consolidatedReview = parseAndValidateConsolidation(result.content, nodeName);

    console.log(
      `[${nodeName}] Consolidation complete: ${consolidatedReview.verdict} (${allReviews.length} reviews merged)`
    );

    return { consolidatedReview, tokenUsage: result.tokenUsage };
  } catch (error) {
    console.error(`[${nodeName}] Failed:`, error);
    throw error;
  }
}

/**
 * Parse and validate LLM output as ConsolidatedReview
 *
 * @param output - Raw LLM output string
 * @param nodeName - Node name for error messages
 * @returns Validated ConsolidatedReview
 * @throws Error if parsing or validation fails
 */
function parseAndValidateConsolidation(output: string, nodeName: string): ConsolidatedReview {
  try {
    // Extract JSON from potential markdown code blocks
    let jsonStr = output.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Parse JSON
    const parsed = JSON.parse(jsonStr);

    // Validate with Zod
    const validated = ConsolidatedReviewSchema.parse(parsed);

    return validated;
  } catch (error) {
    console.error(`[${nodeName}] Failed to parse/validate LLM output:`, output);
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`[${nodeName}] Invalid consolidation format: ${issues}`);
    }
    throw new Error(
      `[${nodeName}] Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
