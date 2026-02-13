/**
 * Draft node - Creates an initial draft document
 */

export interface ReviewState {
  content: string;
  feedback?: string;
  approved?: boolean;
  revision?: number;
}

// TODO: Placeholder for LLM-based draft generation. Currently returns a hardcoded draft.
// The async signature is required for LangGraph node compatibility.
export async function draft(state: ReviewState): Promise<Partial<ReviewState>> {
  const draftContent = state.content || 'This is a draft document that needs review.';

  return {
    content: draftContent,
    revision: (state.revision ?? 0) + 1,
  };
}
