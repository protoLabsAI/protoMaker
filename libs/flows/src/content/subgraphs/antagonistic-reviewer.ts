/**
 * Antagonistic Reviewer Subgraph
 *
 * Provides rigorous quality review for content pipeline phases.
 * Scores content against phase-specific rubrics with pass/fail thresholds.
 *
 * Three review modes:
 * 1. Research Quality - Validates research findings completeness
 * 2. Outline Structure - Reviews outline organization and flow
 * 3. Full Content - Comprehensive 8-dimension review of assembled content
 */

import { StateGraph, Annotation, END } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('AntagonisticReviewer');

/**
 * Review dimension score
 */
export interface DimensionScore {
  dimension: string;
  score: number; // 1-10
  evidence: string;
  suggestion?: string;
}

/**
 * Review result
 */
export interface ReviewResult {
  mode: 'research' | 'outline' | 'full';
  overallScore: number; // Average of dimension scores
  maxScore: number; // Maximum possible score
  percentage: number; // overallScore / maxScore * 100
  passed: boolean; // true if >= threshold
  threshold: number; // Minimum percentage to pass
  dimensions: DimensionScore[];
  verdict: 'PASS' | 'REVISE' | 'FAIL';
  criticalIssues: string[];
  recommendations: string[];
  timestamp: string;
}

/**
 * Antagonistic reviewer state
 */
export const AntagonisticReviewerState = Annotation.Root({
  // Input
  mode: Annotation<'research' | 'outline' | 'full'>,
  content: Annotation<string>,
  researchFindings: Annotation<string | undefined>,
  smartModel: Annotation<BaseChatModel>,

  // Output
  result: Annotation<ReviewResult | undefined>,

  // Error handling
  error: Annotation<string | undefined>,
});

export type AntagonisticReviewerStateType = typeof AntagonisticReviewerState.State;

/**
 * Threshold for passing review (percentage)
 */
const PASS_THRESHOLD = 75; // Must score 75% or higher to pass

/**
 * Review dimensions by mode
 */
const RESEARCH_DIMENSIONS = ['Completeness', 'Source Quality', 'Relevance', 'Depth'];

const OUTLINE_DIMENSIONS = ['Structure', 'Flow', 'Coverage', 'Clarity'];

const FULL_DIMENSIONS = [
  'Headline Strength',
  'Hook Effectiveness',
  'Scannability',
  'SEO Optimization',
  'Internal Linking',
  'CTA Quality',
  'Value Density',
  'Readability',
];

/**
 * Main review node - performs antagonistic review based on mode
 */
async function reviewNode(
  state: AntagonisticReviewerStateType
): Promise<Partial<AntagonisticReviewerStateType>> {
  const { mode, content, researchFindings, smartModel } = state;

  logger.info(`Starting antagonistic review in ${mode} mode`);

  try {
    let dimensions: string[];
    let systemPrompt: string;

    // Select dimensions and prompt based on mode
    switch (mode) {
      case 'research':
        dimensions = RESEARCH_DIMENSIONS;
        systemPrompt = buildResearchPrompt(content, researchFindings);
        break;
      case 'outline':
        dimensions = OUTLINE_DIMENSIONS;
        systemPrompt = buildOutlinePrompt(content);
        break;
      case 'full':
        dimensions = FULL_DIMENSIONS;
        systemPrompt = buildFullPrompt(content);
        break;
    }

    // Invoke LLM for review
    const response = await smartModel.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Please review the content according to the rubric.' },
    ]);

    const reviewOutput =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    // Parse review output
    const dimensionScores = parseDimensionScores(reviewOutput, dimensions);
    const criticalIssues = parseCriticalIssues(reviewOutput);
    const recommendations = parseRecommendations(reviewOutput);

    // Calculate overall score
    const totalScore = dimensionScores.reduce((sum, d) => sum + d.score, 0);
    const maxScore = dimensions.length * 10;
    const percentage = (totalScore / maxScore) * 100;
    const passed = percentage >= PASS_THRESHOLD;

    // Determine verdict
    let verdict: 'PASS' | 'REVISE' | 'FAIL';
    if (percentage >= PASS_THRESHOLD) {
      verdict = 'PASS';
    } else if (percentage >= 50) {
      verdict = 'REVISE';
    } else {
      verdict = 'FAIL';
    }

    const result: ReviewResult = {
      mode,
      overallScore: totalScore,
      maxScore,
      percentage,
      passed,
      threshold: PASS_THRESHOLD,
      dimensions: dimensionScores,
      verdict,
      criticalIssues,
      recommendations,
      timestamp: new Date().toISOString(),
    };

    logger.info(`Review complete: ${verdict} (${percentage.toFixed(1)}%)`);

    return { result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Review failed: ${errorMessage}`);

    return {
      error: errorMessage,
      result: {
        mode,
        overallScore: 0,
        maxScore: 0,
        percentage: 0,
        passed: false,
        threshold: PASS_THRESHOLD,
        dimensions: [],
        verdict: 'FAIL',
        criticalIssues: [errorMessage],
        recommendations: [],
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Build research quality review prompt
 */
function buildResearchPrompt(content: string, researchFindings?: string): string {
  return `You are an antagonistic research quality reviewer. Your job is to rigorously assess research findings.

# Content to Review
${content}

${researchFindings ? `# Research Context\n${researchFindings}\n` : ''}

# Review Rubric

Score each dimension 1-10. Be harsh but fair.

## 1. Completeness (1-10)
- 9-10: All key aspects covered, no gaps
- 7-8: Most aspects covered, minor gaps
- 5-6: Several gaps, missing key elements
- 3-4: Major gaps, incomplete
- 1-2: Severely incomplete

## 2. Source Quality (1-10)
- 9-10: All authoritative, credible sources
- 7-8: Mostly credible, some weak sources
- 5-6: Mix of good and questionable sources
- 3-4: Mostly weak or unverified sources
- 1-2: No credible sources

## 3. Relevance (1-10)
- 9-10: All findings directly relevant
- 7-8: Mostly relevant, some tangential
- 5-6: Mix of relevant and irrelevant
- 3-4: Mostly irrelevant or off-topic
- 1-2: Completely irrelevant

## 4. Depth (1-10)
- 9-10: Deep analysis, comprehensive
- 7-8: Good depth, adequate detail
- 5-6: Surface level, needs more depth
- 3-4: Shallow, lacking substance
- 1-2: No depth, trivial

# Output Format

Provide scores in this exact format:

## Dimension Scores

**Completeness:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

**Source Quality:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

**Relevance:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

**Depth:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

## Critical Issues
- [List any blocking issues]

## Recommendations
- [List actionable improvements]
`;
}

/**
 * Build outline structure review prompt
 */
function buildOutlinePrompt(content: string): string {
  return `You are an antagonistic outline reviewer. Your job is to rigorously assess content structure.

# Outline to Review
${content}

# Review Rubric

Score each dimension 1-10. Be harsh but fair.

## 1. Structure (1-10)
- 9-10: Perfect logical hierarchy, clear organization
- 7-8: Good structure, minor issues
- 5-6: Adequate but could be better organized
- 3-4: Poor structure, confusing flow
- 1-2: No clear structure

## 2. Flow (1-10)
- 9-10: Seamless transitions, perfect narrative arc
- 7-8: Good flow, mostly smooth
- 5-6: Acceptable flow, some awkward transitions
- 3-4: Choppy, disconnected sections
- 1-2: No flow, disjointed

## 3. Coverage (1-10)
- 9-10: Comprehensive, all key topics covered
- 7-8: Good coverage, minor omissions
- 5-6: Adequate but missing some key areas
- 3-4: Major gaps in coverage
- 1-2: Severely incomplete coverage

## 4. Clarity (1-10)
- 9-10: Crystal clear purpose and content preview
- 7-8: Clear with minor ambiguity
- 5-6: Somewhat clear, needs refinement
- 3-4: Unclear or vague
- 1-2: Confusing, no clear direction

# Output Format

Provide scores in this exact format:

## Dimension Scores

**Structure:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

**Flow:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

**Coverage:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

**Clarity:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

## Critical Issues
- [List any blocking issues]

## Recommendations
- [List actionable improvements]
`;
}

/**
 * Build full content review prompt (8 dimensions)
 */
function buildFullPrompt(content: string): string {
  return `You are an antagonistic content reviewer. Your job is to rigorously assess published content quality.

# Content to Review
${content}

# Review Rubric

Score each dimension 1-10. Be harsh but fair.

## 1. Headline Strength (1-10)
- 9-10: Perfect formula, under 70 chars, irresistible
- 7-8: Good formula, slightly weak
- 5-6: Basic formula, generic
- 3-4: Weak, too long
- 1-2: No formula, boring

## 2. Hook Effectiveness (1-10)
- 9-10: Powerful pattern, demands attention
- 7-8: Good pattern, engaging
- 5-6: Weak pattern, mildly interesting
- 3-4: Generic intro, no clear pattern
- 1-2: Boring, reader likely bounces

## 3. Scannability (1-10)
- 9-10: Perfect F-pattern, subheadings every 200-300 words
- 7-8: Good structure, mostly scannable
- 5-6: Adequate, some walls of text
- 3-4: Poor structure, hard to scan
- 1-2: Wall of text, reader fatigue

## 4. SEO Optimization (1-10)
- 9-10: Keywords in all critical spots, complete optimization
- 7-8: Good keyword usage, minor gaps
- 5-6: Keywords present but minimal
- 3-4: Poor optimization
- 1-2: No SEO consideration

## 5. Internal Linking (1-10)
- 9-10: Perfect frequency, natural anchors
- 7-8: Good frequency, relevant links
- 5-6: Sparse linking, somewhat relevant
- 3-4: Very few links
- 1-2: No internal links

## 6. CTA Quality (1-10)
- 9-10: Perfect alignment, multiple placements, clear value
- 7-8: Good CTA, present in 2+ locations
- 5-6: Basic CTA, single placement
- 3-4: Weak or misaligned CTA
- 1-2: No CTA

## 7. Value Density (1-10)
- 9-10: Every paragraph actionable, zero fluff
- 7-8: Mostly valuable, minimal filler
- 5-6: Some value, noticeable fluff
- 3-4: Thin content, lots of filler
- 1-2: No real value

## 8. Readability (1-10)
- 9-10: Perfect grade level, short sentences, conversational
- 7-8: Appropriate level, mostly readable
- 5-6: Acceptable but could be clearer
- 3-4: Too complex or too simple
- 1-2: Unreadable

# Output Format

Provide scores in this exact format:

## Dimension Scores

**Headline Strength:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

**Hook Effectiveness:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

**Scannability:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

**SEO Optimization:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

**Internal Linking:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

**CTA Quality:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

**Value Density:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

**Readability:** X/10
Evidence: [Why this score]
Suggestion: [How to improve]

## Critical Issues
- [List any blocking issues]

## Recommendations
- [List actionable improvements]
`;
}

/**
 * Parse dimension scores from review output
 */
function parseDimensionScores(output: string, expectedDimensions: string[]): DimensionScore[] {
  const scores: DimensionScore[] = [];

  for (const dimension of expectedDimensions) {
    // Match pattern: **DimensionName:** X/10
    const scoreRegex = new RegExp(`\\*\\*${dimension}\\*\\*:\\s*(\\d+)/10`, 'i');
    const evidenceRegex = new RegExp(`Evidence:[\\s]*([^\\n]+)`, 'i');
    const suggestionRegex = new RegExp(`Suggestion:[\\s]*([^\\n]+)`, 'i');

    const scoreMatch = output.match(scoreRegex);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 5; // Default to middle score if not found

    // Find the section for this dimension
    const dimensionSectionRegex = new RegExp(
      `\\*\\*${dimension}\\*\\*:\\s*\\d+/10[\\s\\S]*?(?=\\*\\*|##|$)`,
      'i'
    );
    const sectionMatch = output.match(dimensionSectionRegex);
    const section = sectionMatch ? sectionMatch[0] : '';

    const evidenceMatch = section.match(evidenceRegex);
    const suggestionMatch = section.match(suggestionRegex);

    scores.push({
      dimension,
      score,
      evidence: evidenceMatch ? evidenceMatch[1].trim() : 'No evidence provided',
      suggestion: suggestionMatch ? suggestionMatch[1].trim() : undefined,
    });
  }

  return scores;
}

/**
 * Parse critical issues from review output
 */
function parseCriticalIssues(output: string): string[] {
  const match = output.match(/## Critical Issues\s+([\s\S]*?)(?=##|$)/i);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-') || line.startsWith('*'))
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

/**
 * Parse recommendations from review output
 */
function parseRecommendations(output: string): string[] {
  const match = output.match(/## Recommendations\s+([\s\S]*?)(?=##|$)/i);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-') || line.startsWith('*'))
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

/**
 * Create the antagonistic reviewer subgraph
 */
export function createAntagonisticReviewerGraph() {
  const graph = new StateGraph(AntagonisticReviewerState);

  // Add review node
  graph.addNode('review', reviewNode);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = graph as any;

  // Define flow: START → review → END
  g.setEntryPoint('review');
  g.addEdge('review', END);

  return graph.compile();
}
