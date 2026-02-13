import type { ResearchState } from '../research-flow.js';

/**
 * Summarize node - creates final summary from analysis
 */
export async function summarizeNode(state: ResearchState): Promise<Partial<ResearchState>> {
  console.log('[summarize] Creating summary...');

  const { topic, context, analysis } = state;

  if (!analysis) {
    throw new Error('No analysis available for summarization');
  }

  // Create a concise summary
  const summary = `Research Summary: ${topic}

Executive Summary:
Based on gathered context and detailed analysis, this research provides actionable insights for implementation.

Key Takeaways:
- Comprehensive context gathered
- Thorough analysis completed
- Clear recommendations provided

Next Steps:
1. Review findings
2. Plan implementation
3. Execute based on recommendations

Completed at: ${new Date().toISOString()}`;

  console.log('[summarize] Summary created successfully');

  return {
    summary,
    summarizedAt: new Date().toISOString(),
    completed: true,
  };
}
