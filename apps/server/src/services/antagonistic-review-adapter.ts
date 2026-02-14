/**
 * Antagonistic Review Adapter
 *
 * Adapter that wraps LangGraph flow execution to match the AntagonisticReviewService interface.
 * Allows signal-router-service to use the new flow-based implementation as a drop-in replacement
 * for the old service with zero changes to calling code.
 */

import { createLogger } from '@automaker/utils';
import { ChatAnthropic } from '@langchain/anthropic';
import { createAntagonisticReviewGraph } from '@automaker/flows';
import type { SPARCPrd } from '@automaker/types';
import { LangfuseClient } from '@automaker/observability';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('AntagonisticReviewAdapter');

/**
 * Review result from a single agent
 */
export interface ReviewResult {
  success: boolean;
  reviewer: string;
  verdict: string;
  concerns?: string[];
  recommendations?: string[];
  durationMs: number;
  error?: string;
}

/**
 * Consolidated review output
 */
export interface ConsolidatedReview {
  success: boolean;
  avaReview: ReviewResult;
  jonReview: ReviewResult;
  resolution: string;
  finalPRD?: SPARCPrd;
  totalDurationMs: number;
  totalCost?: number;
  traceId?: string;
  error?: string;
}

/**
 * Review request parameters
 */
export interface ReviewRequest {
  prd: SPARCPrd;
  prdId: string;
  projectPath: string;
}

/**
 * Configuration for the adapter
 */
export interface AdapterConfig {
  smartModel?: string;
  enableHITL?: boolean;
  langfuseClient?: LangfuseClient;
}

/**
 * AntagonisticReviewAdapter - wraps flow execution with legacy interface
 */
export class AntagonisticReviewAdapter {
  private config: AdapterConfig;
  private langfuse: LangfuseClient | null;

  constructor(config: AdapterConfig = {}) {
    this.config = {
      smartModel: config.smartModel || 'claude-3-5-sonnet-20241022',
      enableHITL: config.enableHITL || false,
      langfuseClient: config.langfuseClient,
    };
    this.langfuse = config.langfuseClient || null;
  }

  /**
   * Execute the antagonistic review flow
   * This method matches the interface of AntagonisticReviewService.executeReview()
   */
  async executeReview(request: ReviewRequest): Promise<ConsolidatedReview> {
    const startTime = Date.now();
    const { prd, prdId, projectPath } = request;

    logger.info(`Starting flow-based antagonistic review for PRD: ${prdId}`);

    // Create Langfuse trace for this review flow
    const traceId = uuidv4();
    const trace = this.langfuse?.createTrace({
      id: traceId,
      name: 'antagonistic-review',
      metadata: {
        prdId,
        projectPath,
        enableHITL: this.config.enableHITL,
      },
      tags: ['antagonistic-review', 'prd-review'],
    });

    try {
      // Create span for graph execution
      const graphSpanId = uuidv4();
      const graphSpan = this.langfuse?.createSpan({
        id: graphSpanId,
        traceId,
        name: 'graph-execution',
        input: { prd, hitlRequired: this.config.enableHITL },
        startTime: new Date(),
      });

      // Create the flow graph (checkpointing enabled by default)
      const graph = createAntagonisticReviewGraph(true);

      // Execute the flow with PRD state
      const result = await graph.invoke({
        prd,
        hitlRequired: this.config.enableHITL,
      });

      const totalDurationMs = Date.now() - startTime;

      // Update graph span with output
      if (graphSpan) {
        this.langfuse?.createSpan({
          id: graphSpanId,
          traceId,
          name: 'graph-execution',
          input: { prd, hitlRequired: this.config.enableHITL },
          output: { success: !result.error, hasConsolidatedReview: !!result.consolidatedReview },
          startTime: new Date(startTime),
          endTime: new Date(),
        });
      }

      // Transform flow result to legacy interface
      if (result.error) {
        throw new Error(result.error);
      }

      // Extract review results from the consolidated review
      const avaReview = this.extractAvaReview(result);
      const jonReview = this.extractJonReview(result);
      const resolution = result.consolidatedReview?.synthesizedReview || '';
      const finalPRD = this.extractFinalPRD(resolution, prd);

      // Create spans for individual review nodes (retroactive tracking)
      if (result.avaReview) {
        this.langfuse?.createSpan({
          id: uuidv4(),
          traceId,
          name: 'ava-review',
          input: { prd },
          output: result.avaReview,
          metadata: { reviewer: 'ava', verdict: result.avaReview.verdict },
          startTime: new Date(startTime),
          endTime: new Date(startTime + totalDurationMs / 3), // Estimate
        });
      }

      if (result.jonReview) {
        this.langfuse?.createSpan({
          id: uuidv4(),
          traceId,
          name: 'jon-review',
          input: { prd },
          output: result.jonReview,
          metadata: { reviewer: 'jon', verdict: result.jonReview.verdict },
          startTime: new Date(startTime + totalDurationMs / 3), // Estimate
          endTime: new Date(startTime + (2 * totalDurationMs) / 3), // Estimate
        });
      }

      if (result.consolidatedReview) {
        this.langfuse?.createSpan({
          id: uuidv4(),
          traceId,
          name: 'consolidate',
          input: { avaReview: result.avaReview, jonReview: result.jonReview },
          output: result.consolidatedReview,
          metadata: { verdict: result.consolidatedReview.verdict },
          startTime: new Date(startTime + (2 * totalDurationMs) / 3), // Estimate
          endTime: new Date(),
        });
      }

      // Calculate total cost (placeholder - will be populated by LLM callback tracking)
      const totalCost = 0; // TODO: Track actual costs from LLM calls

      // Flush Langfuse events
      await this.langfuse?.flush();

      logger.info(
        `Flow-based antagonistic review completed in ${totalDurationMs}ms for PRD ${prdId}`
      );

      return {
        success: true,
        avaReview,
        jonReview,
        resolution,
        finalPRD,
        totalDurationMs,
        totalCost,
        traceId,
      };
    } catch (error) {
      const totalDurationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Flow-based antagonistic review failed for PRD ${prdId}: ${errorMessage}`);

      // Log error to Langfuse
      this.langfuse?.createSpan({
        id: uuidv4(),
        traceId,
        name: 'error',
        input: { prd, prdId },
        output: { error: errorMessage },
        metadata: { errorType: error instanceof Error ? error.constructor.name : 'Unknown' },
        startTime: new Date(startTime),
        endTime: new Date(),
      });

      await this.langfuse?.flush();

      return {
        success: false,
        avaReview: {
          success: false,
          reviewer: 'ava',
          verdict: '',
          durationMs: 0,
          error: errorMessage,
        },
        jonReview: {
          success: false,
          reviewer: 'jon',
          verdict: '',
          durationMs: 0,
          error: errorMessage,
        },
        resolution: '',
        totalDurationMs,
        totalCost: 0,
        traceId,
        error: errorMessage,
      };
    }
  }

  /**
   * Format PRD into content string for the flow
   */
  private formatPRDContent(prd: SPARCPrd): string {
    return `# PRD Review Request

## Situation
${prd.situation}

## Problem
${prd.problem}

## Approach
${prd.approach}

## Results
${prd.results}

## Constraints
${prd.constraints || 'None specified'}
`;
  }

  /**
   * Extract Ava's review from flow result
   */
  private extractAvaReview(result: any): ReviewResult {
    const avaReview = result.avaReview;

    if (!avaReview) {
      return {
        success: false,
        reviewer: 'ava',
        verdict: '',
        durationMs: 0,
        error: 'Ava review not found in flow result',
      };
    }

    return {
      success: true,
      reviewer: 'ava',
      verdict: avaReview.verdict || avaReview.review || '',
      concerns: avaReview.concerns || [],
      recommendations: avaReview.recommendations || [],
      durationMs: 0, // Flow doesn't track individual timings
    };
  }

  /**
   * Extract Jon's review from flow result
   */
  private extractJonReview(result: any): ReviewResult {
    const jonReview = result.jonReview;

    if (!jonReview) {
      return {
        success: false,
        reviewer: 'jon',
        verdict: '',
        durationMs: 0,
        error: 'Jon review not found in flow result',
      };
    }

    return {
      success: true,
      reviewer: 'jon',
      verdict: jonReview.verdict || jonReview.review || '',
      concerns: jonReview.concerns || [],
      recommendations: jonReview.recommendations || [],
      durationMs: 0, // Flow doesn't track individual timings
    };
  }

  /**
   * Extract final PRD from resolution text
   */
  private extractFinalPRD(resolution: string, originalPrd: SPARCPrd): SPARCPrd | undefined {
    try {
      // Try to parse SPARC sections from the resolution
      const situationMatch = resolution.match(/### Situation\s+([\s\S]*?)(?=###|$)/);
      const problemMatch = resolution.match(/### Problem\s+([\s\S]*?)(?=###|$)/);
      const approachMatch = resolution.match(/### Approach\s+([\s\S]*?)(?=###|$)/);
      const resultsMatch = resolution.match(/### Results\s+([\s\S]*?)(?=###|$)/);
      const constraintsMatch = resolution.match(/### Constraints\s+([\s\S]*?)(?=###|$)/);

      if (situationMatch || problemMatch || approachMatch || resultsMatch) {
        return {
          situation: situationMatch?.[1]?.trim() || originalPrd.situation,
          problem: problemMatch?.[1]?.trim() || originalPrd.problem,
          approach: approachMatch?.[1]?.trim() || originalPrd.approach,
          results: resultsMatch?.[1]?.trim() || originalPrd.results,
          constraints: constraintsMatch?.[1]?.trim() || originalPrd.constraints,
          generatedAt: new Date().toISOString(),
        };
      }

      // If no SPARC sections found, return original PRD
      return originalPrd;
    } catch (error) {
      logger.error('Failed to extract PRD from resolution:', error);
      return originalPrd;
    }
  }
}

/**
 * Create an adapter instance
 */
export function createAntagonisticReviewAdapter(config?: AdapterConfig): AntagonisticReviewAdapter {
  return new AntagonisticReviewAdapter(config);
}
