/**
 * Idea Processing Graph
 *
 * Idea validation and enrichment workflow using LangGraph with complexity routing.
 *
 * Flow:
 * START -> classify_complexity ->
 *   [trivial: fast_path_review -> done]
 *   [simple/complex: research -> review -> done]
 *
 * Complexity routing (after classify_complexity):
 * - complexity=trivial: Skip research, use fast-path review
 * - complexity=simple: Standard research and review
 * - complexity=complex: Deep research and comprehensive review
 *
 * Fast path optimization:
 * - Trivial ideas bypass expensive research phase
 * - Quick approve/reject decision based on basic heuristics
 * - Sets usedFastPath=true for tracking
 */

import { MemorySaver } from '@langchain/langgraph';
import { GraphBuilder } from '../graphs/builder.js';
import {
  IdeaProcessingStateAnnotation,
  type IdeaProcessingState,
  type IdeaComplexity,
} from './state.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('IdeaProcessingGraph');

// ─── Node Implementations ──────────────────────────────────────────────────

/**
 * Classify complexity node - determines processing path
 * Falls back to heuristic classification when no LLM models available
 */
async function classifyComplexityNode(
  state: IdeaProcessingState
): Promise<Partial<IdeaProcessingState>> {
  const nodeName = 'classify_complexity';
  const startTime = new Date();
  let spanId: string | undefined;

  try {
    // Heuristic classification based on description length and content
    const descLength = state.idea.description?.length ?? 0;
    const titleLength = state.idea.title?.length ?? 0;

    let complexity: IdeaComplexity;
    const notes: string[] = [];

    if (descLength < 50 && titleLength < 30) {
      complexity = 'trivial';
      notes.push('Classified as trivial - using fast path');
    } else if (descLength < 200) {
      complexity = 'simple';
      notes.push('Classified as simple - standard processing');
    } else {
      complexity = 'complex';
      notes.push('Classified as complex - deep research required');
    }

    // Create trace span if Langfuse is available
    if (state.langfuseClient?.isAvailable() && state.traceId) {
      spanId = `${nodeName}-${Date.now()}`;
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { ideaTitle: state.idea.title, ideaLength: descLength },
        metadata: { nodeType: 'classification', complexity },
        startTime,
      });
    }

    const endTime = new Date();

    // Update span with output
    if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { ideaTitle: state.idea.title, ideaLength: descLength },
        output: { complexity },
        metadata: { nodeType: 'classification', success: true },
        startTime,
        endTime,
      });
      await state.langfuseClient.flush();
    }

    return {
      complexity,
      processingNotes: notes,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[${nodeName}] Failed:`, error);

    // Update span with error
    if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { ideaTitle: state.idea.title },
        output: '',
        metadata: { nodeType: 'classification', success: false, error: errorMsg },
        startTime,
        endTime: new Date(),
      });
      await state.langfuseClient.flush();
    }

    throw error;
  }
}

/**
 * Research node - performs deep research on the idea
 * Gathers context, analyzes feasibility, estimates impact/effort
 */
async function researchNode(state: IdeaProcessingState): Promise<Partial<IdeaProcessingState>> {
  const nodeName = 'research';
  const startTime = new Date();
  let spanId: string | undefined;

  try {
    // Create trace span if Langfuse is available
    if (state.langfuseClient?.isAvailable() && state.traceId) {
      spanId = `${nodeName}-${Date.now()}`;
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { ideaTitle: state.idea.title, complexity: state.complexity },
        metadata: { nodeType: 'research' },
        startTime,
      });
    }

    // Mock research implementation
    // In production, this would integrate with project analysis, web search, etc.
    const researchResults = {
      findings: [
        {
          source: 'project-analysis',
          summary: `Analyzed idea: ${state.idea.title}`,
          relevance: 'Direct project relevance',
        },
      ],
      summary: `Research completed for idea: ${state.idea.title}. ${state.idea.description}`,
      recommendedCategory: state.idea.category,
      estimatedImpact: 'medium' as const,
      estimatedEffort: 'medium' as const,
    };

    const endTime = new Date();

    // Update span with output
    if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { ideaTitle: state.idea.title, complexity: state.complexity },
        output: { findings: researchResults.findings.length, summary: researchResults.summary },
        metadata: {
          nodeType: 'research',
          success: true,
          findingsCount: researchResults.findings.length,
        },
        startTime,
        endTime,
      });
      await state.langfuseClient.flush();
    }

    return {
      researchResults,
      processingNotes: ['Research phase completed'],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[${nodeName}] Failed:`, error);

    // Update span with error
    if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { ideaTitle: state.idea.title },
        output: '',
        metadata: { nodeType: 'research', success: false, error: errorMsg },
        startTime,
        endTime: new Date(),
      });
      await state.langfuseClient.flush();
    }

    throw error;
  }
}

/**
 * Fast path review node - quick approve/reject for trivial ideas
 * Bypasses research phase for efficiency
 */
async function fastPathReviewNode(
  state: IdeaProcessingState
): Promise<Partial<IdeaProcessingState>> {
  const nodeName = 'fast_path_review';
  const startTime = new Date();
  let spanId: string | undefined;

  try {
    // Create trace span if Langfuse is available
    if (state.langfuseClient?.isAvailable() && state.traceId) {
      spanId = `${nodeName}-${Date.now()}`;
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { ideaTitle: state.idea.title },
        metadata: { nodeType: 'review', reviewType: 'fast_path' },
        startTime,
      });
    }

    // Simple heuristic-based approval
    const titleValid = state.idea.title && state.idea.title.length > 5;
    const descValid = state.idea.description && state.idea.description.length > 10;

    const approve = !!(titleValid && descValid);

    const reviewOutput = {
      approve,
      category: state.idea.category || 'feature',
      impact: 'low' as const,
      effort: 'low' as const,
      suggestions: approve ? [] : ['Provide more details about the idea'],
      reasoning: approve ? 'Basic validation passed' : 'Insufficient detail for approval',
    };

    const endTime = new Date();

    // Update span with output
    if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { ideaTitle: state.idea.title },
        output: { approved: approve, category: reviewOutput.category },
        metadata: {
          nodeType: 'review',
          reviewType: 'fast_path',
          success: true,
          approved: approve,
        },
        startTime,
        endTime,
      });
      await state.langfuseClient.flush();
    }

    return {
      reviewOutput,
      approved: approve,
      category: reviewOutput.category,
      impact: reviewOutput.impact,
      effort: reviewOutput.effort,
      usedFastPath: true,
      processingNotes: ['Fast path review completed'],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[${nodeName}] Failed:`, error);

    // Update span with error
    if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { ideaTitle: state.idea.title },
        output: '',
        metadata: { nodeType: 'review', reviewType: 'fast_path', success: false, error: errorMsg },
        startTime,
        endTime: new Date(),
      });
      await state.langfuseClient.flush();
    }

    throw error;
  }
}

/**
 * Review node - comprehensive review with research context
 * Makes final approve/reject decision with category/impact/effort estimates
 */
async function reviewNode(state: IdeaProcessingState): Promise<Partial<IdeaProcessingState>> {
  const nodeName = 'review';
  const startTime = new Date();
  let spanId: string | undefined;

  try {
    // Create trace span if Langfuse is available
    if (state.langfuseClient?.isAvailable() && state.traceId) {
      spanId = `${nodeName}-${Date.now()}`;
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: {
          ideaTitle: state.idea.title,
          hasResearch: !!state.researchResults,
          complexity: state.complexity,
        },
        metadata: { nodeType: 'review', reviewType: 'comprehensive' },
        startTime,
      });
    }

    // Use research results to inform review
    const research = state.researchResults;

    const reviewOutput = {
      approve: true, // Default to approve if research was conducted
      category: research?.recommendedCategory || state.idea.category || 'feature',
      impact: research?.estimatedImpact || 'medium',
      effort: research?.estimatedEffort || 'medium',
      suggestions: ['Consider adding user stories', 'Define clear acceptance criteria'],
      reasoning: research?.summary || 'Standard review completed',
    };

    const endTime = new Date();

    // Update span with output
    if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: {
          ideaTitle: state.idea.title,
          hasResearch: !!state.researchResults,
          complexity: state.complexity,
        },
        output: {
          approved: reviewOutput.approve,
          category: reviewOutput.category,
          impact: reviewOutput.impact,
          effort: reviewOutput.effort,
        },
        metadata: {
          nodeType: 'review',
          reviewType: 'comprehensive',
          success: true,
          approved: reviewOutput.approve,
        },
        startTime,
        endTime,
      });
      await state.langfuseClient.flush();
    }

    return {
      reviewOutput,
      approved: reviewOutput.approve,
      category: reviewOutput.category,
      impact: reviewOutput.impact,
      effort: reviewOutput.effort,
      processingNotes: ['Comprehensive review completed'],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[${nodeName}] Failed:`, error);

    // Update span with error
    if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { ideaTitle: state.idea.title, complexity: state.complexity },
        output: '',
        metadata: {
          nodeType: 'review',
          reviewType: 'comprehensive',
          success: false,
          error: errorMsg,
        },
        startTime,
        endTime: new Date(),
      });
      await state.langfuseClient.flush();
    }

    throw error;
  }
}

// ─── Routing Functions ─────────────────────────────────────────────────────

/**
 * Route after complexity classification
 * Trivial ideas go to fast path, others go to research
 */
function routeComplexity(state: IdeaProcessingState): string {
  if (state.complexity === 'trivial') {
    return 'fast_path_review';
  }
  return 'research';
}

// ─── Graph Builder ─────────────────────────────────────────────────────────

/**
 * Creates the idea processing graph
 *
 * @param enableCheckpointing - Whether to enable state persistence (default: true)
 * @returns Compiled LangGraph runnable
 */
export function createIdeaProcessingGraph(enableCheckpointing = true) {
  const checkpointer = enableCheckpointing ? new MemorySaver() : undefined;

  const builder = new GraphBuilder<IdeaProcessingState>({
    stateAnnotation: IdeaProcessingStateAnnotation,
    enableCheckpointing,
    checkpointer,
  });

  // Add all nodes
  builder
    .addNode('classify_complexity', classifyComplexityNode)
    .addNode('research', researchNode)
    .addNode('fast_path_review', fastPathReviewNode)
    .addNode('review', reviewNode)
    .addNode('done', async () => ({}));

  // Wire the flow
  builder.setEntryPoint('classify_complexity');

  // Conditional routing based on complexity
  builder.addConditionalEdge('classify_complexity', routeComplexity, {
    fast_path_review: 'fast_path_review',
    research: 'research',
  });

  // Fast path goes straight to done
  builder.addEdge('fast_path_review', 'done');

  // Research path continues to full review
  builder.addEdge('research', 'review');
  builder.addEdge('review', 'done');

  // Set finish point
  builder.setFinishPoint('done');

  // Compile the graph
  const graph = builder.getGraph();
  return graph.compile({ checkpointer });
}

/**
 * Default graph instance with checkpointing enabled
 */
export const ideaProcessingGraph = createIdeaProcessingGraph();
