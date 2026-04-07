/**
 * Antagonistic Review Adapter
 *
 * Adapter that wraps LangGraph flow execution to match the AntagonisticReviewService interface.
 * Allows callers to use the new flow-based implementation as a drop-in replacement
 * for the old service with zero changes to calling code.
 */

import { createLogger } from '@protolabsai/utils';
import { createAntagonisticReviewGraph } from '@protolabsai/flows';
import type { AgentQueryOptions } from '@protolabsai/flows';
import type { SPARCPrd, Feature } from '@protolabsai/types';
import type { ReviewResult, ConsolidatedReview, ReviewRequest } from '@protolabsai/types';
import { extractPRDFromText } from '@protolabsai/types';
import { LangfuseClient, calculateCost } from '@protolabsai/observability';
import { v4 as uuidv4 } from 'uuid';
import { createFlowModel } from '../lib/flow-model-factory.js';
import type { SettingsService } from './settings-service.js';
import { streamingQuery } from '../providers/simple-query-service.js';
import { FeatureLoader } from './feature-loader.js';
import { resolveModelString } from '@protolabsai/model-resolver';

const logger = createLogger('AntagonisticReviewAdapter');

/**
 * Shape of a reviewer perspective in flow results.
 * Handles both @protolabsai/types ReviewerPerspective and node-local formats.
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

// ── Board context helpers ─────────────────────────────────────────────────────

/** Priority label map for board context display */
const PRIORITY_LABELS: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Normal', 4: 'Low' };

/**
 * Serialize board features into a compact text block for review context.
 * Groups by status so reviewers understand current load and commitments.
 */
function serializeBoardContext(features: Feature[]): string {
  if (!features.length) return 'No features on board.';

  const IN_FLIGHT_STATUSES = new Set(['active', 'in-progress', 'review', 'blocked']);
  const BACKLOG_STATUSES = new Set(['backlog', 'pending', 'todo', 'queued']);

  const active = features.filter((f) => IN_FLIGHT_STATUSES.has(f.status ?? ''));
  const backlog = features.filter((f) => BACKLOG_STATUSES.has(f.status ?? ''));

  const lines: string[] = [];

  if (active.length) {
    lines.push(`### IN FLIGHT (${active.length} feature${active.length !== 1 ? 's' : ''})`);
    for (const f of active) {
      const priority = f.priority ? ` [${PRIORITY_LABELS[f.priority] ?? ''}]` : '';
      lines.push(`- **${f.title ?? f.id}**${priority} (${f.status})`);
      if (f.description) lines.push(`  ${f.description.slice(0, 150)}`);
    }
  } else {
    lines.push('### IN FLIGHT\nNone — team capacity available.');
  }

  if (backlog.length) {
    lines.push(
      `\n### BACKLOG (${backlog.length} total${backlog.length > 8 ? ', showing top 8' : ''})`
    );
    const sorted = [...backlog].sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));
    for (const f of sorted.slice(0, 8)) {
      const priority = f.priority ? ` [${PRIORITY_LABELS[f.priority] ?? ''}]` : '';
      lines.push(`- **${f.title ?? f.id}**${priority}`);
    }
  }

  return lines.join('\n');
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
      const { model: smartModel } = await createFlowModel(
        'specGenerationModel',
        this.config.projectPath,
        {
          settingsService: this.config.settingsService,
        }
      );

      // Fetch board context so reviewers know current capacity and commitments
      let boardContext: string | undefined;
      if (projectPath) {
        try {
          const featureLoader = new FeatureLoader();
          const features = await featureLoader.getAll(projectPath);
          boardContext = serializeBoardContext(features);
          logger.info(`[${prdId}] Board context loaded: ${features.length} features`);
        } catch (err) {
          logger.warn(`[${prdId}] Failed to load board context:`, err);
        }
      }

      // Build agent query function: Ava + Jon run as multi-turn agents with tools
      const agentQueryFn = projectPath
        ? async (options: AgentQueryOptions) =>
            streamingQuery({
              ...options,
              cwd: options.cwd || projectPath,
              model: options.model ?? resolveModelString('sonnet'),
              traceContext: { agentRole: 'reviewer', projectSlug: projectPath },
            })
        : undefined;

      // Use thread ID for checkpointing (required for HITL resume)
      const threadId = uuidv4();
      const config = { configurable: { thread_id: threadId } };

      // Execute the flow with PRD state + injected models + agent loop support
      const result = await graph.invoke(
        {
          prd,
          hitlRequired: this.config.enableHITL,
          smartModel,
          fastModel: undefined,
          projectPath: projectPath || undefined,
          boardContext,
          agentQueryFn,
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
          const finalPRD = result.consolidatedPrd || extractPRDFromText(resolution, prd);

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
      const finalPRD = result.consolidatedPrd || extractPRDFromText(resolution, prd);

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

      // Calculate total cost from token usage collected across graph nodes
      let totalCost = 0;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const modelName: string = (smartModel as any).model ?? (smartModel as any).modelName ?? '';
        const usages = [
          result.avaTokenUsage,
          result.jonTokenUsage,
          result.consolidateTokenUsage,
        ].filter(Boolean) as Array<{ inputTokens: number; outputTokens: number }>;
        for (const usage of usages) {
          const cost = calculateCost(modelName, {
            promptTokens: usage.inputTokens,
            completionTokens: usage.outputTokens,
          });
          totalCost += cost ?? 0;
        }
      } catch (err) {
        logger.warn('Failed to compute antagonistic review cost', err);
        totalCost = 0;
      }

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
      const finalPRD = result.consolidatedPrd || extractPRDFromText(resolution, prd);

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
   * Extract Ava's review from flow result
   * Handles both @protolabsai/types ReviewerPerspective (overallVerdict, sections, generalComments)
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
   * Handles both @protolabsai/types ReviewerPerspective and node-local format
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
}

/**
 * Create an adapter instance
 */
export function createAntagonisticReviewAdapter(config?: AdapterConfig): AntagonisticReviewAdapter {
  return new AntagonisticReviewAdapter(config);
}
