/**
 * Jon Review Node
 *
 * Jon is the market/business reviewer who evaluates PRDs from a
 * customer impact and business value perspective.
 *
 * Focus areas:
 * - Customer Impact: How will this affect our users? What's the value proposition?
 * - ROI: What's the expected return on investment? Cost vs. benefit?
 * - Market Positioning: How does this position us competitively?
 * - Priority: Given our business goals, is this the right thing to build now?
 *
 * Jon receives Ava's operational review as context to understand execution concerns.
 * Returns a structured ReviewerPerspective with sections, verdict, and comments.
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import { createLogger } from '@protolabsai/utils';
import { executeWithFallback } from './classify-topic.js';
import {
  ReviewerPerspectiveSchema,
  type ReviewerPerspective,
  type NodeTokenUsage,
} from './ava-review.js';

const logger = createLogger('jon-review');

/**
 * State interface for jon-review node
 */
export interface JonReviewState {
  prd: string;
  avaReview?: ReviewerPerspective;
  jonReview?: ReviewerPerspective;
  tokenUsage?: NodeTokenUsage;
  smartModel?: BaseChatModel;
  fastModel?: BaseChatModel;
}

/**
 * Jon Review Node - Market/business review of PRD with awareness of Ava's concerns
 *
 * @param state - Node state containing PRD, Ava's review, and models
 * @returns Partial state with Jon's review perspective
 */
export async function jonReviewNode(state: JonReviewState): Promise<Partial<JonReviewState>> {
  const { prd, avaReview, smartModel, fastModel } = state;
  const nodeName = 'JonReviewNode';

  logger.info(`[${nodeName}] Starting Jon's market review`);

  try {
    // Build context about Ava's concerns if available
    const avaContext = avaReview
      ? `
Ava's Operational Review (${avaReview.verdict}):
${avaReview.sections
  .map(
    (section) =>
      `- ${section.area}: ${section.assessment}${
        section.concerns.length > 0 ? `\n  Concerns: ${section.concerns.join(', ')}` : ''
      }`
  )
  .join('\n')}

Ava's Summary: ${avaReview.comments}
`
      : '';

    // Execute with model fallback, capturing both content and token usage
    const result = await executeWithFallback(
      { primary: smartModel, fallback: fastModel },
      async (model) => {
        const response = await model.invoke([
          {
            role: 'user',
            content: `You are Jon, the market and business reviewer. Your role is to evaluate PRDs from a customer impact, ROI, and business value perspective.

Focus on these key areas:
1. **Customer Impact**: How will this affect our users? What problem does it solve? What's the value proposition?
2. **ROI**: What's the expected return on investment? Cost vs. benefit analysis? Revenue implications?
3. **Market Positioning**: How does this position us competitively? Does it strengthen our market position?
4. **Priority**: Given our business goals and market conditions, is this the right thing to build now?

PRD to review:
${prd}
${
  avaContext
    ? `
${avaContext}
Note: Consider Ava's operational concerns in your business assessment. If Ava raises significant execution risks, factor those into your ROI and priority evaluation.`
    : ''
}

Provide your review in the following JSON format:
{
  "reviewer": "Jon",
  "verdict": "approve" | "approve-with-concerns" | "revise" | "reject",
  "sections": [
    {
      "area": "Customer Impact" | "ROI" | "Market Positioning" | "Priority",
      "assessment": "Brief assessment of this area",
      "concerns": ["List of specific concerns"],
      "recommendations": ["Optional list of recommendations"]
    }
  ],
  "comments": "Overall summary and final thoughts",
  "timestamp": "${new Date().toISOString()}"
}

Verdict guidelines:
- approve: Strong business case, clear customer value, ready to proceed
- approve-with-concerns: Good business case but monitor these issues
- revise: Needs changes to business case or scope before approval
- reject: Insufficient business value, wrong priority, or poor market fit

Be strategic, business-focused, and consider customer impact above all. Return ONLY the JSON object, no additional text.`,
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
    const jonReview = parseAndValidateReview(result.content, nodeName);

    logger.info(
      `[${nodeName}] Review complete: ${jonReview.verdict} (${jonReview.sections.length} sections)`
    );

    return { jonReview, tokenUsage: result.tokenUsage };
  } catch (error) {
    logger.error(`[${nodeName}] Failed:`, error);
    throw error;
  }
}

/**
 * Parse and validate LLM output as ReviewerPerspective
 *
 * @param output - Raw LLM output string
 * @param nodeName - Node name for error messages
 * @returns Validated ReviewerPerspective
 * @throws Error if parsing or validation fails
 */
function parseAndValidateReview(output: string, nodeName: string): ReviewerPerspective {
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
    const validated = ReviewerPerspectiveSchema.parse(parsed);

    return validated;
  } catch (error) {
    logger.error(`[${nodeName}] Failed to parse/validate LLM output:`, output);
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`[${nodeName}] Invalid review format: ${issues}`);
    }
    throw new Error(
      `[${nodeName}] Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
