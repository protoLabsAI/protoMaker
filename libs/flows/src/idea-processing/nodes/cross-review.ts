/**
 * Cross-Review Node
 *
 * Executes parallel reviews using Send() to fan out to multiple reviewers.
 * Returns structured ReviewOutput for consensus checking.
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import type { SPARCPrd } from '@automaker/types';

/**
 * Review output schema - structured feedback from a single reviewer
 */
export const ReviewOutputSchema = z.object({
  reviewer: z.string(),
  verdict: z.enum(['approved', 'concerns', 'blocked']),
  confidence: z.number().min(0).max(1), // 0.0 to 1.0
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  blockers: z.array(z.string()),
  recommendations: z.array(z.string()),
  comments: z.string(),
  timestamp: z.string(),
});
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

/**
 * State interface for cross-review node
 */
export interface CrossReviewState {
  prd: SPARCPrd;
  reviews?: ReviewOutput[];
  smartModel?: BaseChatModel;
  fastModel?: BaseChatModel;
}

/**
 * Cross-Review Node - Parallel review execution
 *
 * This node is designed to be called via Send() for parallel execution.
 * Each invocation performs a single review and returns a ReviewOutput.
 *
 * @param state - Node state containing PRD and reviewer context
 * @param reviewerName - Name of the reviewer (passed via Send())
 * @param reviewerRole - Role/focus of the reviewer (passed via Send())
 * @returns Partial state with review output
 */
export async function crossReviewNode(
  state: CrossReviewState,
  reviewerName: string,
  reviewerRole: string
): Promise<Partial<CrossReviewState>> {
  const { prd, smartModel, fastModel } = state;
  const nodeName = `CrossReviewNode[${reviewerName}]`;

  console.log(`[${nodeName}] Starting review with role: ${reviewerRole}`);

  try {
    // Use smartModel with fallback to fastModel
    const model = smartModel || fastModel;
    if (!model) {
      throw new Error(`[${nodeName}] No LLM model available`);
    }

    // Execute review
    const response = await model.invoke([
      {
        role: 'user',
        content: `You are ${reviewerName}, a reviewer with the following focus: ${reviewerRole}

PRD to review:
${JSON.stringify(prd, null, 2)}

Provide your review in the following JSON format:
{
  "reviewer": "${reviewerName}",
  "verdict": "approved" | "concerns" | "blocked",
  "confidence": 0.0 to 1.0 (how confident you are in this PRD),
  "strengths": ["List key strengths of this PRD"],
  "weaknesses": ["List areas that could be improved"],
  "blockers": ["List any blocking issues that must be addressed"],
  "recommendations": ["List specific recommendations for improvement"],
  "comments": "Overall summary and final thoughts",
  "timestamp": "${new Date().toISOString()}"
}

Verdict guidelines:
- approved: Ready to proceed, no blocking issues
- concerns: Some issues but not blocking, should be addressed
- blocked: Cannot proceed, fundamental issues must be resolved

Confidence guidelines (0.0 to 1.0):
- 0.8-1.0: High confidence, well-defined and feasible
- 0.6-0.8: Moderate confidence, some uncertainties
- 0.0-0.6: Low confidence, significant gaps or risks

Return ONLY the JSON object, no additional text.`,
      },
    ]);

    // Parse and validate the LLM response
    const review = parseAndValidateReview(response.content.toString(), nodeName);

    console.log(
      `[${nodeName}] Review complete: ${review.verdict} (confidence: ${review.confidence})`
    );

    return {
      reviews: [review], // Will be collected via appendReducer
    };
  } catch (error) {
    console.error(`[${nodeName}] Failed:`, error);
    throw error;
  }
}

/**
 * Parse and validate LLM output as ReviewOutput
 *
 * @param output - Raw LLM output string
 * @param nodeName - Node name for error messages
 * @returns Validated ReviewOutput
 * @throws Error if parsing or validation fails
 */
function parseAndValidateReview(output: string, nodeName: string): ReviewOutput {
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
    const validated = ReviewOutputSchema.parse(parsed);

    return validated;
  } catch (error) {
    console.error(`[${nodeName}] Failed to parse/validate LLM output:`, output);
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`[${nodeName}] Invalid review format: ${issues}`);
    }
    throw new Error(
      `[${nodeName}] Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
