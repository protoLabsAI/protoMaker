/**
 * Ava Review Node
 *
 * Ava is the operational/pragmatic reviewer who evaluates PRDs from a
 * delivery and execution perspective.
 *
 * Focus areas:
 * - Capacity: Do we have the resources and bandwidth to execute this?
 * - Risk: What are the technical risks and dependencies?
 * - Tech Debt: Will this add to or reduce our technical debt?
 * - Feasibility: Is this implementable with our current stack and constraints?
 *
 * Returns a structured ReviewerPerspective with sections, verdict, and comments.
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import { createLogger } from '@protolabsai/utils';
import {
  executeWithFallback,
  extractXmlTag,
  extractXmlItems,
  stripMarkdownFences,
} from './classify-topic.js';

const logger = createLogger('ava-review');

/**
 * Review verdict schema
 */
export const ReviewVerdictSchema = z.enum(['approve', 'approve-with-concerns', 'revise', 'reject']);
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

/**
 * Review section schema - structured feedback on a specific area
 */
export const ReviewSectionSchema = z.object({
  area: z.string(),
  assessment: z.string(),
  concerns: z.array(z.string()),
  recommendations: z.array(z.string()).optional(),
});
export type ReviewSection = z.infer<typeof ReviewSectionSchema>;

/**
 * Reviewer perspective schema - complete structured review
 */
export const ReviewerPerspectiveSchema = z.object({
  reviewer: z.string(),
  verdict: ReviewVerdictSchema,
  sections: z.array(ReviewSectionSchema),
  comments: z.string(),
  timestamp: z.string(),
});
export type ReviewerPerspective = z.infer<typeof ReviewerPerspectiveSchema>;

/**
 * Token usage from a single LLM call
 */
export interface NodeTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * State interface for ava-review node
 */
export interface AvaReviewState {
  prd: string;
  avaReview?: ReviewerPerspective;
  tokenUsage?: NodeTokenUsage;
  smartModel?: BaseChatModel;
  fastModel?: BaseChatModel;
}

/**
 * Ava Review Node - Operational/pragmatic review of PRD
 *
 * @param state - Node state containing PRD and models
 * @returns Partial state with Ava's review perspective
 */
export async function avaReviewNode(state: AvaReviewState): Promise<Partial<AvaReviewState>> {
  const { prd, smartModel, fastModel } = state;
  const nodeName = 'AvaReviewNode';

  logger.info(`[${nodeName}] Starting Ava's operational review`);

  try {
    // Execute with model fallback, capturing both content and token usage
    const result = await executeWithFallback(
      { primary: smartModel, fallback: fastModel },
      async (model) => {
        const response = await model.invoke([
          {
            role: 'user',
            content: `You are Ava, the operational and pragmatic technical reviewer. Your role is to evaluate PRDs from a delivery and execution perspective.

Focus on these key areas:
1. **Capacity**: Do we have the resources, bandwidth, and team capacity to execute this?
2. **Risk**: What are the technical risks, external dependencies, and potential blockers?
3. **Tech Debt**: Will this add to or reduce our technical debt? Are there shortcuts being taken?
4. **Feasibility**: Is this implementable with our current tech stack, infrastructure, and constraints?

PRD to review:
${prd}

Provide your review in the following XML format. Use this exact structure — no markdown fences, no JSON:

<review>
  <reviewer>Ava</reviewer>
  <verdict>approve|approve-with-concerns|revise|reject</verdict>
  <sections>
    <section>
      <area>Capacity|Risk|Tech Debt|Feasibility</area>
      <assessment>Brief assessment of this area</assessment>
      <concerns>
        <item>Specific concern</item>
      </concerns>
      <recommendations>
        <item>Optional recommendation</item>
      </recommendations>
    </section>
  </sections>
  <comments>Overall summary and final thoughts</comments>
  <timestamp>${new Date().toISOString()}</timestamp>
</review>

Verdict guidelines:
- approve: Ready to proceed, no significant concerns
- approve-with-concerns: Can proceed but monitor these issues
- revise: Needs changes before approval
- reject: Cannot proceed, fundamental issues

Be direct, practical, and focus on execution realities. Return ONLY the XML, no additional text.`,
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
    const avaReview = parseReviewXml(result.content, nodeName);

    logger.info(
      `[${nodeName}] Review complete: ${avaReview.verdict} (${avaReview.sections.length} sections)`
    );

    return { avaReview, tokenUsage: result.tokenUsage };
  } catch (error) {
    logger.error(`[${nodeName}] Failed:`, error);
    throw error;
  }
}

/**
 * Parse and validate LLM output as ReviewerPerspective (XML format).
 * Exported so graph adapters can reuse this when running agent-loop paths.
 *
 * @param output - Raw LLM output string
 * @param nodeName - Node name for error messages
 * @returns Validated ReviewerPerspective
 * @throws Error if parsing or validation fails
 */
export function parseReviewXml(output: string, nodeName: string): ReviewerPerspective {
  try {
    const cleaned = stripMarkdownFences(output);
    const root = extractXmlTag(cleaned, 'review');
    if (!root) {
      throw new Error(`Missing <review> root element. Output preview: ${cleaned.slice(0, 200)}`);
    }

    const reviewer = extractXmlTag(root, 'reviewer') ?? 'Ava';
    const verdict = extractXmlTag(root, 'verdict');
    const comments = extractXmlTag(root, 'comments');
    const timestamp = extractXmlTag(root, 'timestamp');
    const sectionsBlock = extractXmlTag(root, 'sections') ?? '';

    const sectionMatches = [...sectionsBlock.matchAll(/<section[^>]*>([\s\S]*?)<\/section>/gi)];
    const sections = sectionMatches.map((m) => {
      const block = m[1];
      const concernsBlock = extractXmlTag(block, 'concerns') ?? '';
      const recsBlock = extractXmlTag(block, 'recommendations') ?? '';
      return {
        area: extractXmlTag(block, 'area') ?? '',
        assessment: extractXmlTag(block, 'assessment') ?? '',
        concerns: extractXmlItems(concernsBlock),
        recommendations:
          extractXmlItems(recsBlock).length > 0 ? extractXmlItems(recsBlock) : undefined,
      };
    });

    const parsed = {
      reviewer,
      verdict,
      sections,
      comments: comments ?? '',
      timestamp: timestamp ?? new Date().toISOString(),
    };
    return ReviewerPerspectiveSchema.parse(parsed);
  } catch (error) {
    logger.error(`[${nodeName}] Failed to parse/validate LLM output:`, output);
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`[${nodeName}] Invalid review format: ${issues}`);
    }
    throw new Error(
      `[${nodeName}] Failed to parse XML: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
