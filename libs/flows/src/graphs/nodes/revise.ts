/**
 * Revise node - Applies feedback to revise the document
 */

import type { ReviewState } from '../review-flow.js';

export async function revise(state: ReviewState): Promise<Partial<ReviewState>> {
  // Apply feedback to revise content
  const feedback = state.feedback || '';
  const currentRevision = state.revision || 1;

  const revisedContent = `${state.content}\n\nRevision ${currentRevision + 1}: Applied feedback - ${feedback}`;

  return {
    content: revisedContent,
    revision: currentRevision + 1,
    feedback: undefined, // Clear feedback after applying
  };
}
