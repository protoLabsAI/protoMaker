/**
 * Consolidate PRD Node
 *
 * Uses Opus to consolidate review feedback into an updated PRD.
 * Single high-quality call to merge all perspectives.
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import type { SPARCPrd } from '@automaker/types';
import type { ReviewOutput } from './cross-review.js';

/**
 * Consolidated PRD schema
 */
export const ConsolidatedPRDSchema = z.object({
  prd: z.custom<SPARCPrd>(),
  summary: z.string(),
  changesApplied: z.array(z.string()),
  timestamp: z.string(),
});
export type ConsolidatedPRD = z.infer<typeof ConsolidatedPRDSchema>;

/**
 * State interface for consolidate-prd node
 */
export interface ConsolidatePRDState {
  prd: SPARCPrd;
  reviews: ReviewOutput[];
  consolidatedPRD?: ConsolidatedPRD;
  smartModel?: BaseChatModel; // Expected to be Opus for quality
  fastModel?: BaseChatModel;
}

/**
 * Consolidate PRD Node - Merge review feedback into updated PRD
 *
 * Uses Opus (smartModel) for high-quality consolidation.
 * Takes all review perspectives and produces a refined PRD.
 *
 * @param state - Node state containing PRD and reviews
 * @returns Partial state with consolidated PRD
 */
export async function consolidatePRDNode(
  state: ConsolidatePRDState
): Promise<Partial<ConsolidatePRDState>> {
  const { prd, reviews, smartModel, fastModel } = state;
  const nodeName = 'ConsolidatePRDNode';

  console.log(`[${nodeName}] Consolidating ${reviews.length} reviews with Opus`);

  if (!reviews || reviews.length === 0) {
    throw new Error(`[${nodeName}] No reviews available to consolidate`);
  }

  try {
    // Prefer smartModel (Opus) for quality, fallback to fastModel
    const model = smartModel || fastModel;
    if (!model) {
      throw new Error(`[${nodeName}] No LLM model available`);
    }

    // Build review summary
    const reviewSummary = reviews
      .map(
        (review) =>
          `
${review.reviewer} (${review.verdict}, confidence: ${review.confidence}):
  Strengths: ${review.strengths.join('; ')}
  Weaknesses: ${review.weaknesses.join('; ')}
  Blockers: ${review.blockers.length > 0 ? review.blockers.join('; ') : 'None'}
  Recommendations: ${review.recommendations.join('; ')}
  Comments: ${review.comments}
`
      )
      .join('\n---\n');

    // Execute consolidation with Opus
    const response = await model.invoke([
      {
        role: 'user',
        content: `You are a senior product architect responsible for consolidating review feedback into a refined PRD.

Original PRD:
${JSON.stringify(prd, null, 2)}

Review Feedback:
${reviewSummary}

Your task:
1. Analyze all review feedback (strengths, weaknesses, blockers, recommendations)
2. Incorporate valuable feedback into the PRD
3. Resolve conflicts between reviewers by prioritizing:
   - Blocking issues must be addressed
   - High-value recommendations should be integrated
   - Maintain clarity and feasibility
4. Produce an updated PRD that addresses key concerns

Provide your consolidation in the following JSON format:
{
  "prd": {
    "situation": "...",
    "problem": "...",
    "approach": "...",
    "results": "...",
    "constraints": ["..."]
  },
  "summary": "Executive summary of changes made",
  "changesApplied": ["List of specific changes applied to the PRD"],
  "timestamp": "${new Date().toISOString()}"
}

Guidelines:
- Address all blocking issues
- Incorporate high-confidence recommendations
- Maintain SPARC structure (Situation, Problem, Approach, Results, Constraints)
- Be thorough but concise
- Ensure the updated PRD is actionable

Return ONLY the JSON object, no additional text.`,
      },
    ]);

    // Parse and validate the LLM response
    const consolidatedPRD = parseAndValidateConsolidation(
      response.content.toString(),
      nodeName
    );

    console.log(`[${nodeName}] Consolidation complete: ${consolidatedPRD.changesApplied.length} changes applied`);

    return { consolidatedPRD };
  } catch (error) {
    console.error(`[${nodeName}] Failed:`, error);
    throw error;
  }
}

/**
 * Parse and validate LLM output as ConsolidatedPRD
 *
 * @param output - Raw LLM output string
 * @param nodeName - Node name for error messages
 * @returns Validated ConsolidatedPRD
 * @throws Error if parsing or validation fails
 */
function parseAndValidateConsolidation(output: string, nodeName: string): ConsolidatedPRD {
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
    const validated = ConsolidatedPRDSchema.parse(parsed);

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
