/**
 * Draft node - Creates an initial draft document
 */

export interface ReviewState {
  content: string;
  feedback?: string;
  approved?: boolean;
  revision?: number;
}

export async function draft(state: ReviewState): Promise<Partial<ReviewState>> {
  // Create initial draft
  const draftContent = 'This is a draft document that needs review.';

  return {
    content: draftContent,
    revision: 1,
  };
}
