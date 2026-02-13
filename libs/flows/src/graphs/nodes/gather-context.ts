import type { ResearchState } from '../research-flow.js';

/**
 * Gather context node - collects information for research
 */
export async function gatherContextNode(state: ResearchState): Promise<Partial<ResearchState>> {
  console.log('[gather-context] Starting context gathering...');

  const { topic } = state;

  // Simulate gathering context about the topic
  const context = `Research context for "${topic}":
- Industry best practices
- Recent developments
- Key considerations
- Technical requirements`;

  console.log('[gather-context] Context gathered successfully');

  return {
    context,
    gatheredAt: new Date().toISOString(),
  };
}
