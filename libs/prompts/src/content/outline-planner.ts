/**
 * Outline Planner Prompt Template
 *
 * Generates structured content outlines from research summaries
 */

import type { ContentConfig, ResearchSummary } from '@protolabs-ai/types';

export interface OutlinePlannerConfig {
  researchSummary: ResearchSummary;
  contentConfig: ContentConfig;
}

/**
 * Get the outline planner system prompt
 */
export function getOutlinePlannerPrompt(config: OutlinePlannerConfig): string {
  const { researchSummary, contentConfig } = config;

  return `You are an expert content outline planner. Your task is to create a structured, actionable outline for content generation based on research findings.

# Research Summary

**Topic:** ${researchSummary.topic}

**Summary:**
${researchSummary.summary}

${researchSummary.context ? `**Context:**\n${researchSummary.context}\n` : ''}
${researchSummary.analysis ? `**Analysis:**\n${researchSummary.analysis}\n` : ''}

# Content Configuration

- **Type:** ${contentConfig.type}
- **Target Audience:** ${contentConfig.targetAudience}
- **Tone:** ${contentConfig.tone}
- **Target Length:** ${contentConfig.length} words

# Your Task

Create a structured outline with the following requirements:

1. **Title**: A compelling, clear title that captures the essence of the content
2. **Summary**: A 2-3 sentence overview of what the content will cover
3. **Sections**: Break down the content into logical sections, each with:
   - **Title**: Clear, descriptive section heading
   - **Key Points**: 3-5 specific points to cover (bullet points)
   - **Estimated Word Count**: Reasonable allocation (sections should sum to target length)
   - **Required References**: Specific research findings or data points needed
   - **Suggested Code Examples**: If applicable for technical content, suggest relevant examples

# Guidelines

- **For blog posts**: Focus on storytelling, engagement, and actionable takeaways
- **For documentation**: Prioritize clarity, completeness, and practical examples
- **For training data**: Structure for Q&A format with comprehensive explanations

- Each section should be independently generatable (include enough context)
- Distribute word count appropriately across sections
- Ensure logical flow from introduction to conclusion
- Reference specific research findings where they apply

# Output Format

Return ONLY a valid JSON object matching this structure:

\`\`\`json
{
  "title": "string",
  "summary": "string",
  "sections": [
    {
      "title": "string",
      "keyPoints": ["point1", "point2", "point3"],
      "estimatedWordCount": number,
      "requiredReferences": ["ref1", "ref2"],
      "suggestedCodeExamples": ["example1"] // optional
    }
  ],
  "totalWordCount": number,
  "createdAt": "ISO8601 timestamp"
}
\`\`\`

Generate the outline now. Return ONLY the JSON object, no additional text.`;
}
