/**
 * Review Subgraph
 *
 * Orchestrates parallel review workers and aggregates findings for HITL decision.
 * Flow: START → fan_out (Send to 3 reviewers in parallel) → aggregate → human_review (interrupt) → END
 */

import { StateGraph, Annotation, Send, Command, END, MemorySaver } from '@langchain/langgraph';
import {
  technicalReviewerNode,
  styleReviewerNode,
  factCheckerNode,
  type ReviewFinding,
  type ReviewSeverity,
} from '../nodes/review-workers.js';

/**
 * Review subgraph state
 */
export const ReviewState = Annotation.Root({
  content: Annotation<string>,
  researchFindings: Annotation<string | undefined>,
  findings: Annotation<ReviewFinding[]>({
    reducer: (left, right) => [...(left || []), ...(right || [])],
    default: () => [],
  }),
  reviewSummary: Annotation<string | undefined>,
  approved: Annotation<boolean | undefined>,
  feedback: Annotation<string | undefined>,
  revision: Annotation<number | undefined>,
});

export type ReviewStateType = typeof ReviewState.State;

/**
 * Fan-out node - dispatches content to all three reviewers in parallel using Send()
 */
async function fanOutNode(state: ReviewStateType) {
  const sends: Send[] = [
    new Send('technical_reviewer', state),
    new Send('style_reviewer', state),
    new Send('fact_checker', state),
  ];

  return new Command({ goto: sends });
}

/**
 * Aggregate node - combines findings from all reviewers and generates summary
 */
async function aggregateNode(state: ReviewStateType): Promise<Partial<ReviewStateType>> {
  const { findings } = state;

  // Group findings by severity
  const errorFindings = findings.filter((f) => f.severity === 'error');
  const warningFindings = findings.filter((f) => f.severity === 'warning');
  const infoFindings = findings.filter((f) => f.severity === 'info');

  // Generate review summary
  const summary = `
=== Review Summary ===

Total Findings: ${findings.length}
- Errors: ${errorFindings.length}
- Warnings: ${warningFindings.length}
- Info: ${infoFindings.length}

${errorFindings.length > 0 ? '\n## Errors (Must Fix)\n' + formatFindings(errorFindings) : ''}
${warningFindings.length > 0 ? '\n## Warnings (Should Fix)\n' + formatFindings(warningFindings) : ''}
${infoFindings.length > 0 ? '\n## Information\n' + formatFindings(infoFindings) : ''}

=== End Review Summary ===
`.trim();

  return {
    reviewSummary: summary,
  };
}

/**
 * Helper to format findings for summary
 */
function formatFindings(findings: ReviewFinding[]): string {
  return findings
    .map(
      (f, i) => `
${i + 1}. [${f.reviewer}] ${f.message}
   ${f.location ? `Location: ${f.location}\n   ` : ''}${f.suggestion ? `Suggestion: ${f.suggestion}` : ''}
`
    )
    .join('\n');
}

/**
 * Human review node - HITL interrupt point
 * This node waits for human input via interruptBefore
 */
async function humanReviewNode(state: ReviewStateType): Promise<Partial<ReviewStateType>> {
  // This node executes after the interrupt is resolved
  // The approved and feedback values are set by the user via updateState()
  return {
    approved: state.approved,
    feedback: state.feedback,
  };
}

/**
 * Routing function to decide next step after human review
 */
function routeAfterReview(state: ReviewStateType): string {
  if (state.approved) {
    return END;
  }
  // If not approved, could route to revision node
  // For now, just end - revision would be handled externally
  return END;
}

/**
 * Creates the review subgraph with parallel workers and HITL interrupt
 */
export function createReviewSubgraph() {
  const graph = new StateGraph(ReviewState);

  // Add nodes
  graph.addNode('fan_out', fanOutNode, {
    ends: ['technical_reviewer', 'style_reviewer', 'fact_checker'],
  });
  graph.addNode('technical_reviewer', technicalReviewerNode);
  graph.addNode('style_reviewer', styleReviewerNode);
  graph.addNode('fact_checker', factCheckerNode);
  graph.addNode('aggregate', aggregateNode);
  graph.addNode('human_review', humanReviewNode);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = graph as any;

  // Define flow
  g.setEntryPoint('fan_out');

  // All reviewers route to aggregate
  g.addEdge('technical_reviewer', 'aggregate');
  g.addEdge('style_reviewer', 'aggregate');
  g.addEdge('fact_checker', 'aggregate');

  // Aggregate routes to human review
  g.addEdge('aggregate', 'human_review');

  // Human review routes based on approval
  g.addConditionalEdges('human_review', routeAfterReview, {
    [END]: END,
  });

  // Compile with interrupt before human_review and memory checkpointer
  const checkpointer = new MemorySaver();
  return g.compile({
    interruptBefore: ['human_review'],
    checkpointer,
  });
}

/**
 * Helper to get review summary with severity stats
 */
export function getReviewStats(findings: ReviewFinding[]): {
  total: number;
  errors: number;
  warnings: number;
  info: number;
  byReviewer: Record<string, number>;
} {
  const stats = {
    total: findings.length,
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
    byReviewer: {} as Record<string, number>,
  };

  // Count by reviewer
  for (const finding of findings) {
    stats.byReviewer[finding.reviewer] = (stats.byReviewer[finding.reviewer] || 0) + 1;
  }

  return stats;
}

/**
 * Helper to check if review has blocking issues
 */
export function hasBlockingIssues(findings: ReviewFinding[]): boolean {
  return findings.some((f) => f.severity === 'error');
}
