/**
 * Antagonistic Review Adapter
 *
 * Adapter that wraps LangGraph flow execution to match the AntagonisticReviewService interface.
 * Allows callers to use the new flow-based implementation as a drop-in replacement
 * for the old service with zero changes to calling code.
 */

import { createLogger } from '@protolabs-ai/utils';
import { createAntagonisticReviewGraph } from '@protolabs-ai/flows';
import type { SPARCPrd } from '@protolabs-ai/types';
import { LangfuseClient } from '@protolabs-ai/observability';
import { v4 as uuidv4 } from 'uuid';
import { createFlowModel } from '../lib/flow-model-factory.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('AntagonisticReviewAdapter');

/**
 * Shape of a reviewer perspective in flow results.
 * Handles both @protolabs-ai/types ReviewerPerspective and node-local formats.
 */
interface FlowReviewPerspective {
  overallVerdict?: string;
  verdict?: string;
  sections?: Array<{
    issues?: string[];
    concerns?: string[];
    suggestions?: string[];
    recommendations?: string[];
  }>;
  generalComments?: string[];
  comments?: string[];
}

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
  threadId?: string;
  hitlPending?: boolean;
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
  /**
   * @deprecated Model selection is now handled by createFlowModel() via specGenerationModel phase.
   * This field is kept for backward compatibility but has no effect.
   */
  smartModel?: string;
  enableHITL?: boolean;
  langfuseClient?: LangfuseClient;
  /** Settings service for resolving the specGenerationModel phase model */
  settingsService?: SettingsService | null;
  /** Project path for project-level model overrides */
  projectPath?: string;
}

/**
 * Stored graph instance for HITL resume
 */
interface ActiveReview {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graph: any;
  traceId: string;
  startTime: number;
  prd: SPARCPrd;
}

/**
 * AntagonisticReviewAdapter - wraps flow execution with legacy interface
 */
export class AntagonisticReviewAdapter {
  private config: AdapterConfig;
  private langfuse: LangfuseClient | null;
  private activeReviews: Map<string, ActiveReview> = new Map();

  constructor(config: AdapterConfig = {}) {
    this.config = {
      enableHITL: config.enableHITL || false,
      langfuseClient: config.langfuseClient,
      settingsService: config.settingsService,
      projectPath: config.projectPath,
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
    const _trace = this.langfuse?.createTrace({
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

      // Create LLM model for the review nodes via settings-aware factory
      const smartModel = await createFlowModel('specGenerationModel', this.config.projectPath, {
        settingsService: this.config.settingsService,
      });

      // Use thread ID for checkpointing (required for HITL resume)
      const threadId = uuidv4();
      const config = { configurable: { thread_id: threadId } };

      // Execute the flow with PRD state + injected models
      const result = await graph.invoke(
        {
          prd,
          hitlRequired: this.config.enableHITL,
          smartModel,
          fastModel: undefined,
        },
        config
      );

      // Check if graph paused at HITL interrupt
      if (this.config.enableHITL) {
        const snapshot = await graph.getState(config);
        if (snapshot.next && snapshot.next.length > 0) {
          // Graph interrupted — store for resume
          this.activeReviews.set(threadId, { graph, traceId, startTime, prd });

          const totalDurationMs = Date.now() - startTime;
          const avaReview = this.extractAvaReview(result);
          const jonReview = this.extractJonReview(result);
          const resolution =
            result.finalVerdict || result.consolidatedReview?.synthesizedReview || '';
          const finalPRD = result.consolidatedPrd || this.extractFinalPRD(resolution, prd);

          logger.info(
            `Review paused for HITL at node(s): ${snapshot.next.join(', ')} (thread: ${threadId})`
          );

          return {
            success: true,
            avaReview,
            jonReview,
            resolution,
            finalPRD,
            totalDurationMs,
            traceId,
            threadId,
            hitlPending: true,
          };
        }
      }

      const totalDurationMs = Date.now() - startTime;

      // End graph span with output
      if (graphSpan) {
        graphSpan.end({
          output: { success: !result.error, hasConsolidatedReview: !!result.consolidatedReview },
        });
      }

      // Transform flow result to legacy interface
      if (result.error) {
        throw new Error(result.error);
      }

      // Extract review results from the graph state
      const avaReview = this.extractAvaReview(result);
      const jonReview = this.extractJonReview(result);
      const resolution = result.finalVerdict || result.consolidatedReview?.synthesizedReview || '';
      const finalPRD = result.consolidatedPrd || this.extractFinalPRD(resolution, prd);

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
   * Resume a review that was paused for HITL input.
   *
   * @param threadId - Thread ID from the paused review
   * @param feedback - Human feedback to inject into graph state
   */
  async resumeReview(threadId: string, feedback: string): Promise<ConsolidatedReview> {
    const active = this.activeReviews.get(threadId);
    if (!active) {
      throw new Error(`No active review found for thread ${threadId}. It may have expired.`);
    }

    const { graph, traceId, startTime, prd } = active;
    const config = { configurable: { thread_id: threadId } };

    logger.info(`Resuming review for thread ${threadId} with HITL feedback`);

    try {
      // Inject HITL feedback into checkpoint state
      await graph.updateState(config, { hitlFeedback: feedback });

      // Resume execution from the interrupt point
      const result = await graph.invoke(null, config);

      const totalDurationMs = Date.now() - startTime;

      // Clean up stored graph
      this.activeReviews.delete(threadId);

      if (result.error) {
        throw new Error(result.error);
      }

      const avaReview = this.extractAvaReview(result);
      const jonReview = this.extractJonReview(result);
      const resolution = result.finalVerdict || result.consolidatedReview?.synthesizedReview || '';
      const finalPRD = result.consolidatedPrd || this.extractFinalPRD(resolution, prd);

      // Flush Langfuse events
      await this.langfuse?.flush();

      logger.info(`Resumed review completed in ${totalDurationMs}ms (thread: ${threadId})`);

      return {
        success: true,
        avaReview,
        jonReview,
        resolution,
        finalPRD,
        totalDurationMs,
        traceId,
        threadId,
        hitlPending: false,
      };
    } catch (error) {
      const totalDurationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Clean up on failure
      this.activeReviews.delete(threadId);

      logger.error(`Resume failed for thread ${threadId}: ${errorMessage}`);

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
        traceId,
        threadId,
        hitlPending: false,
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
   * Handles both @protolabs-ai/types ReviewerPerspective (overallVerdict, sections, generalComments)
   * and node-local ReviewerPerspective (verdict, sections, comments)
   */
  private extractAvaReview(result: Record<string, unknown>): ReviewResult {
    const avaReview = result.avaReview as FlowReviewPerspective | undefined;

    if (!avaReview) {
      return {
        success: false,
        reviewer: 'ava',
        verdict: '',
        durationMs: 0,
        error: 'Ava review not found in flow result',
      };
    }

    // Extract concerns from sections (handles both section formats)
    const concerns: string[] = [];
    const recommendations: string[] = [];
    for (const section of avaReview.sections || []) {
      if (section.issues) concerns.push(...section.issues);
      if (section.concerns) concerns.push(...section.concerns);
      if (section.suggestions) recommendations.push(...section.suggestions);
      if (section.recommendations) recommendations.push(...section.recommendations);
    }

    return {
      success: true,
      reviewer: 'ava',
      verdict: avaReview.overallVerdict || avaReview.verdict || '',
      concerns,
      recommendations,
      durationMs: 0,
    };
  }

  /**
   * Extract Jon's review from flow result
   * Handles both @protolabs-ai/types ReviewerPerspective and node-local format
   */
  private extractJonReview(result: Record<string, unknown>): ReviewResult {
    const jonReview = result.jonReview as FlowReviewPerspective | undefined;

    if (!jonReview) {
      return {
        success: false,
        reviewer: 'jon',
        verdict: '',
        durationMs: 0,
        error: 'Jon review not found in flow result',
      };
    }

    const concerns: string[] = [];
    const recommendations: string[] = [];
    for (const section of jonReview.sections || []) {
      if (section.issues) concerns.push(...section.issues);
      if (section.concerns) concerns.push(...section.concerns);
      if (section.suggestions) recommendations.push(...section.suggestions);
      if (section.recommendations) recommendations.push(...section.recommendations);
    }

    return {
      success: true,
      reviewer: 'jon',
      verdict: jonReview.overallVerdict || jonReview.verdict || '',
      concerns,
      recommendations,
      durationMs: 0,
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
