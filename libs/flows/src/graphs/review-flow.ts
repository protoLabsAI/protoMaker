/**
 * Review Flow Graph with Human Interrupt
 *
 * Flow: START → draft → human_review (interrupt) → revise → END
 *
 * Demonstrates:
 * - interruptBefore for human_review node
 * - getState() to inspect current state
 * - updateState() to modify state during interrupt
 * - resume() to continue from interrupt point
 */

import { StateGraph, Annotation, END, MemorySaver } from '@langchain/langgraph';
import { revise } from './nodes/revise.js';

export interface ReviewState {
  content: string;
  feedback?: string;
  approved?: boolean;
  revision?: number;
}

// Define the state annotation
const ReviewStateAnnotation = Annotation.Root({
  content: Annotation<string>,
  feedback: Annotation<string | undefined>,
  approved: Annotation<boolean | undefined>,
  revision: Annotation<number | undefined>,
});

/**
 * Draft node - Creates an initial draft document
 */
async function draft(state: ReviewState): Promise<Partial<ReviewState>> {
  const draftContent = state.content || 'This is a draft document that needs review.';
  return {
    content: draftContent,
    revision: (state.revision ?? 0) + 1,
  };
}

/**
 * Human review node - This is where the interrupt occurs
 * The node itself doesn't execute during interrupt - it waits for human input
 */
async function humanReview(state: ReviewState): Promise<Partial<ReviewState>> {
  // This node executes after the interrupt is resolved
  // If approved, we end. If not approved, we route to revise
  return {
    approved: state.approved,
  };
}

/**
 * Routing function to decide next step after human review
 */
function routeAfterReview(state: ReviewState): string {
  if (state.approved) {
    return END;
  }
  return 'revise';
}

/**
 * Creates the review flow graph
 *
 * @returns Compiled graph with interrupt at human_review node
 */
export function createReviewFlow() {
  const graph = new StateGraph(ReviewStateAnnotation)
    // Add nodes
    .addNode('draft', draft)
    .addNode('human_review', humanReview)
    .addNode('revise', revise)
    // Define edges
    .addEdge('__start__', 'draft')
    .addEdge('draft', 'human_review')
    .addConditionalEdges('human_review', routeAfterReview, {
      revise: 'revise',
      [END]: END,
    })
    .addEdge('revise', 'human_review');

  // Compile with interrupt before human_review and memory checkpointer
  const checkpointer = new MemorySaver();
  return graph.compile({
    interruptBefore: ['human_review'],
    checkpointer,
  });
}
