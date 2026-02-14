/**
 * Antagonistic Review Subgraph
 *
 * Reusable critique-revise loop primitive that scores content against a rubric.
 * Uses LLM with chain-of-thought reasoning to evaluate each dimension 1-10,
 * returns structured scores and verdict (PASS/REVISE/FAIL).
 *
 * Flow: START → review → route (PASS/REVISE/FAIL) → END
 * Max 2 retries. PASS at >=75%, FAIL after retries exhausted.
 */

import { StateGraph, Annotation, END } from '@langchain/langgraph';
import { compilePrompt } from '../prompt-loader.js';
import {
  extractRequiredTag,
  extractClampedInt,
  extractAllTags,
  extractRequiredEnum,
} from '../xml-parser.js';

/**
 * Rubric dimension for scoring
 */
export interface RubricDimension {
  /** Dimension name (e.g., "Clarity", "Technical Accuracy") */
  name: string;
  /** Description of what this dimension evaluates */
  description: string;
  /** Weight of this dimension (0-1, sum should be 1.0) */
  weight: number;
}

/**
 * Rubric configuration for content review
 */
export interface ReviewRubric {
  /** List of dimensions to evaluate */
  dimensions: RubricDimension[];
  /** Passing threshold percentage (0-100, default 75) */
  passingThreshold?: number;
  /** Maximum number of revision attempts (default 2) */
  maxRetries?: number;
}

/**
 * Score for a single rubric dimension
 */
export interface DimensionScore {
  /** Dimension name */
  dimension: string;
  /** Score 1-10 */
  score: number;
  /** Chain-of-thought reasoning */
  reasoning: string;
  /** Weight used for weighted average */
  weight: number;
}

/**
 * Review verdict after scoring
 */
export type ReviewVerdict = 'PASS' | 'REVISE' | 'FAIL';

/**
 * Result of antagonistic review
 */
export interface ReviewResult {
  /** Overall verdict */
  verdict: ReviewVerdict;
  /** Weighted average score (0-100) */
  overallScore: number;
  /** Individual dimension scores */
  dimensionScores: DimensionScore[];
  /** Consolidated feedback for revision */
  feedback: string;
  /** Number of revision attempts made */
  revisionCount: number;
}

/**
 * Antagonistic reviewer state
 */
export const AntagonisticReviewerState = Annotation.Root({
  /** Content to review */
  content: Annotation<string>,
  /** Review rubric configuration */
  rubric: Annotation<ReviewRubric>,
  /** Current revision count */
  revisionCount: Annotation<number>,
  /** Review result (populated after scoring) */
  result: Annotation<ReviewResult | undefined>,
  /** LLM model to use for full review (default: sonnet) */
  smartModel: Annotation<string>,
  /** LLM model to use for structural checks (default: haiku) */
  fastModel: Annotation<string>,
  /** Optional Langfuse trace ID */
  traceId: Annotation<string | undefined>,
});

export type AntagonisticReviewerStateType = typeof AntagonisticReviewerState.State;

/**
 * Review node - scores content against rubric dimensions
 */
async function reviewNode(
  state: AntagonisticReviewerStateType
): Promise<Partial<AntagonisticReviewerStateType>> {
  const { content, rubric, revisionCount, smartModel, traceId } = state;

  // Compile prompt with rubric dimensions
  const dimensionsText = rubric.dimensions
    .map(
      (d, i) =>
        `${i + 1}. **${d.name}** (weight: ${(d.weight * 100).toFixed(0)}%)\n   ${d.description}`
    )
    .join('\n\n');

  const compiled = await compilePrompt({
    name: 'antagonistic-review',
    variables: {
      content,
      dimensions: dimensionsText,
      dimensionCount: rubric.dimensions.length.toString(),
    },
  });

  // Call LLM with smart model for full review
  // TODO: Replace with actual LLM provider call when integrated
  // For now, mock the response structure
  const llmOutput = await mockLLMCall(compiled.prompt, smartModel, traceId);

  // Parse XML output
  const dimensionScores = parseDimensionScores(llmOutput, rubric.dimensions);
  const feedback = extractRequiredTag(llmOutput, 'feedback');

  // Calculate weighted average score
  const overallScore = calculateWeightedScore(dimensionScores);

  // Determine verdict
  const passingThreshold = rubric.passingThreshold ?? 75;
  const maxRetries = rubric.maxRetries ?? 2;

  let verdict: ReviewVerdict;
  if (overallScore >= passingThreshold) {
    verdict = 'PASS';
  } else if (revisionCount >= maxRetries) {
    verdict = 'FAIL';
  } else {
    verdict = 'REVISE';
  }

  const result: ReviewResult = {
    verdict,
    overallScore,
    dimensionScores,
    feedback,
    revisionCount,
  };

  return {
    result,
    revisionCount: revisionCount + 1,
  };
}

/**
 * Parse dimension scores from XML output
 */
function parseDimensionScores(output: string, dimensions: RubricDimension[]): DimensionScore[] {
  const scores: DimensionScore[] = [];

  // Extract all <dimension> blocks
  const dimensionBlocks = extractAllTags(output, 'dimension');

  if (dimensionBlocks.length !== dimensions.length) {
    throw new Error(
      `Expected ${dimensions.length} dimension scores, got ${dimensionBlocks.length}`
    );
  }

  for (let i = 0; i < dimensionBlocks.length; i++) {
    const block = dimensionBlocks[i];
    const dimension = dimensions[i];

    // Extract name, score, reasoning from each dimension block
    const name = extractRequiredTag(block, 'name');
    const score = extractClampedInt(block, 'score', 1, 10);
    const reasoning = extractRequiredTag(block, 'reasoning');

    // Verify dimension name matches
    if (name.toLowerCase() !== dimension.name.toLowerCase()) {
      throw new Error(
        `Dimension name mismatch: expected "${dimension.name}", got "${name}" at position ${i + 1}`
      );
    }

    scores.push({
      dimension: dimension.name,
      score,
      reasoning,
      weight: dimension.weight,
    });
  }

  return scores;
}

/**
 * Calculate weighted average score (0-100 scale)
 */
function calculateWeightedScore(dimensionScores: DimensionScore[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const dim of dimensionScores) {
    // Convert 1-10 score to 0-100 scale
    const normalizedScore = ((dim.score - 1) / 9) * 100;
    weightedSum += normalizedScore * dim.weight;
    totalWeight += dim.weight;
  }

  // Normalize in case weights don't sum to 1.0
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Routing function to decide next step after review
 */
function routeAfterReview(state: AntagonisticReviewerStateType): string {
  const { result } = state;

  if (!result) {
    throw new Error('Review result is missing');
  }

  // All verdicts lead to END in this primitive
  // Revision logic would be handled by parent graph
  return END;
}

/**
 * Creates the antagonistic reviewer subgraph
 *
 * @param options - Optional configuration
 * @returns Compiled LangGraph
 */
export function createAntagonisticReviewerGraph() {
  const graph = new StateGraph(AntagonisticReviewerState);

  // Add review node
  graph.addNode('review', reviewNode);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = graph as any;

  // Define flow
  g.setEntryPoint('review');

  // Route to END after review (parent handles revision)
  g.addConditionalEdges('review', routeAfterReview, {
    [END]: END,
  });

  return g.compile();
}

/**
 * Mock LLM call for testing - replace with actual LLM provider
 */
async function mockLLMCall(
  _prompt: string,
  _model: string,
  _traceId: string | undefined
): Promise<string> {
  // TODO: Replace with actual LLM provider call
  // Should use llm-providers package and Langfuse tracing
  return `
<dimension>
<name>Test Dimension</name>
<score>8</score>
<reasoning>This is a test reasoning for the dimension.</reasoning>
</dimension>

<feedback>
Overall feedback for the content under review.
</feedback>
  `.trim();
}

/**
 * Execute the antagonistic reviewer as a standalone subgraph
 *
 * @param content - Content to review
 * @param rubric - Review rubric configuration
 * @param options - Optional configuration (models, tracing)
 * @returns Review result
 */
export async function executeAntagonisticReviewer(
  content: string,
  rubric: ReviewRubric,
  options?: {
    smartModel?: string;
    fastModel?: string;
    traceId?: string;
  }
): Promise<ReviewResult> {
  const graph = createAntagonisticReviewerGraph();

  const result = await graph.invoke({
    content,
    rubric,
    revisionCount: 0,
    result: undefined,
    smartModel: options?.smartModel ?? 'claude-sonnet-4-5-20250929',
    fastModel: options?.fastModel ?? 'claude-haiku-4-5-20251001',
    traceId: options?.traceId,
  });

  if (!result.result) {
    throw new Error('Review did not produce a result');
  }

  return result.result;
}
