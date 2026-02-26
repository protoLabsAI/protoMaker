/**
 * Lead Engineer — Prompt Builders
 *
 * Prompt construction functions for the Lead Engineer pipeline.
 * Separates prompt content from orchestration logic for easier tuning.
 */

import type { Feature, KnowledgeSearchResult } from '@protolabs-ai/types';

/**
 * Build the plan generation prompt for the Lead Engineer PlanProcessor.
 * Injects prior plans from the knowledge store as context when available.
 *
 * @param feature - The feature to generate a plan for
 * @param priorPlans - Top search results from the knowledge store (optional)
 * @returns The complete prompt string
 */
export function buildPlanPrompt(
  feature: Feature,
  priorPlans: KnowledgeSearchResult[] = []
): string {
  let priorPlansSection = '';

  if (priorPlans.length > 0) {
    const plans = priorPlans
      .map(
        (r, i) =>
          `### Prior Plan ${i + 1} (${r.chunk.sourceFile})\n${r.chunk.content.slice(0, 1500)}`
      )
      .join('\n\n');

    priorPlansSection = `

## Prior Plans for Similar Features

${plans}

Review these prior plans for relevant patterns and decisions before creating the new plan.
`;
  }

  return `Create a concise implementation plan for this feature.

**Title:** ${feature.title || 'Untitled'}
**Description:** ${feature.description || 'No description provided'}
**Complexity:** ${feature.complexity || 'medium'}
${priorPlansSection}
Produce a plan with:
1. Key files to modify or create
2. Implementation steps (ordered)
3. Testing approach
4. Risk areas or edge cases

Keep it focused and actionable. If the feature description is too vague or unclear to plan, respond with "UNCLEAR:" followed by what's missing.`;
}
