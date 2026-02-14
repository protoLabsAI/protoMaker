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
}

/**
 * AntagonisticReviewAdapter - wraps flow execution with legacy interface
 */
export class AntagonisticReviewAdapter {
  private config: AdapterConfig;

  constructor(config: AdapterConfig = {}) {
    this.config = {
      smartModel: config.smartModel || 'claude-3-5-sonnet-20241022',
      enableHITL: config.enableHITL || false,
    };
  }

  /**
   * Execute the antagonistic review flow
   * This method matches the interface of AntagonisticReviewService.executeReview()
   */
  async executeReview(request: ReviewRequest): Promise<ConsolidatedReview> {
    const startTime = Date.now();
    const { prd, prdId, projectPath } = request;

    logger.info(`Starting flow-based antagonistic review for PRD: ${prdId}`);

    try {
      // Create the flow graph (checkpointing enabled by default)
      const graph = createAntagonisticReviewGraph(true);

      // Execute the flow with PRD state
      const result = await graph.invoke({
        prd,
        hitlRequired: this.config.enableHITL,
      });

      const totalDurationMs = Date.now() - startTime;

      // Transform flow result to legacy interface
      if (result.error) {
        throw new Error(result.error);
      }

      // Extract review results from the consolidated review
      const avaReview = this.extractAvaReview(result);
      const jonReview = this.extractJonReview(result);
      const resolution = result.consolidatedReview?.synthesizedReview || '';
      const finalPRD = this.extractFinalPRD(resolution, prd);

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
      };
    } catch (error) {
      const totalDurationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Flow-based antagonistic review failed for PRD ${prdId}: ${errorMessage}`);

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
