/**
 * Content Flow Service
 *
 * Manages content creation flow execution via LangGraph.
 * Runs autonomously with antagonistic review gates by default.
 * Optional HITL mode can be enabled via enableHITL config flag.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { createLogger } from '@automaker/utils';
import { getAutomakerDir } from '@automaker/platform';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';
import { createContentCreationFlow } from '@automaker/flows';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('ContentFlowService');

/**
 * Maps LangGraph node names to reviewing_* status values.
 * When the flow enters a review node, the service status reflects it.
 */
const NODE_STATUS_MAP: Record<string, ContentFlowStatus['status']> = {
  research_review: 'reviewing_research',
  outline_review: 'reviewing_outline',
  final_content_review: 'reviewing_content',
};

/**
 * Maps LangGraph node names to approximate progress percentages
 */
const NODE_PROGRESS_MAP: Record<string, number> = {
  generate_queries: 5,
  fan_out_research: 10,
  research_delegate: 15,
  research_review: 20,
  research_hitl: 22,
  generate_outline: 25,
  outline_review: 35,
  outline_hitl: 40,
  fan_out_generation: 45,
  generation_delegate: 55,
  assemble: 65,
  fan_out_review: 70,
  review_delegate: 75,
  final_content_review: 80,
  final_review_hitl: 85,
  fan_out_output: 90,
  output_delegate: 95,
  complete: 100,
};

/**
 * Content creation config type (mirrors ContentConfig from content-creation-flow)
 */
interface ContentCreationConfig {
  topic: string;
  format: 'tutorial' | 'reference' | 'guide';
  tone: 'technical' | 'conversational' | 'formal';
  audience: 'beginner' | 'intermediate' | 'expert';
  outputFormats: Array<'markdown' | 'html' | 'pdf'>;
  smartModel: BaseChatModel;
  fastModel: BaseChatModel;
  enableHITL?: boolean;
  maxRetries?: number;
}

/**
 * Status of a content flow run
 */
export interface ContentFlowStatus {
  runId: string;
  status:
    | 'running'
    | 'reviewing_research'
    | 'reviewing_outline'
    | 'reviewing_content'
    | 'interrupted'
    | 'completed'
    | 'failed';
  currentNode?: string;
  progress: number; // 0-100
  reviewScores?: {
    research?: { percentage: number; passed: boolean; verdict: string };
    outline?: { percentage: number; passed: boolean; verdict: string };
    content?: { percentage: number; passed: boolean; verdict: string };
  };
  hitlGatesPending: string[]; // Only populated when enableHITL=true
  error?: string;
  createdAt: number;
  completedAt?: number;
}

/**
 * Content metadata for listing
 */
export interface ContentMetadata {
  runId: string;
  topic: string;
  format: string;
  status: string;
  outputPath?: string;
  createdAt: number;
}

/**
 * HITL review decision (only used when enableHITL=true)
 */
export interface HITLReview {
  gate: 'research_hitl' | 'outline_hitl' | 'final_review_hitl';
  decision: 'approve' | 'revise' | 'reject';
  feedback?: string;
  editedContent?: string;
}

/**
 * Service for managing content creation flows
 */
export class ContentFlowService {
  private activeRuns: Map<string, ContentFlowStatus>;
  private events: EventEmitter | null = null;

  constructor() {
    this.activeRuns = new Map();
  }

  /**
   * Set event emitter for WebSocket status updates
   */
  setEventEmitter(emitter: EventEmitter): void {
    this.events = emitter;
  }

  /**
   * Emit a content flow status event over WebSocket
   */
  private emitStatus(status: ContentFlowStatus): void {
    if (this.events) {
      this.events.emit('feature:progress', {
        type: 'content-flow',
        runId: status.runId,
        status: status.status,
        progress: status.progress,
        currentNode: status.currentNode,
        reviewScores: status.reviewScores,
        hitlGatesPending: status.hitlGatesPending,
        error: status.error,
      });
    }
  }

  /**
   * Create models from config
   */
  private createModels(): { smartModel: BaseChatModel; fastModel: BaseChatModel } {
    // Cast needed: ChatAnthropic's type doesn't perfectly align with BaseChatModel
    // due to LangChain version mismatch on the 'profile' property, but works at runtime
    const smartModel = new ChatAnthropic({
      model: 'claude-sonnet-4-5-20250929',
      temperature: 0.7,
    }) as unknown as BaseChatModel;

    const fastModel = new ChatAnthropic({
      model: 'claude-haiku-4-5-20251001',
      temperature: 0.5,
    }) as unknown as BaseChatModel;

    return { smartModel, fastModel };
  }

  /**
   * Start a content creation flow.
   *
   * By default, runs end-to-end autonomously with antagonistic review gates.
   * Set enableHITL=true to enable human-in-the-loop interrupt gates.
   */
  async startFlow(
    projectPath: string,
    topic: string,
    contentConfig?: {
      format?: 'tutorial' | 'reference' | 'guide';
      tone?: 'technical' | 'conversational' | 'formal';
      audience?: 'beginner' | 'intermediate' | 'expert';
      outputFormats?: Array<'markdown' | 'html' | 'pdf'>;
      enableHITL?: boolean;
      maxRetries?: number;
    }
  ): Promise<{ runId: string; status: ContentFlowStatus }> {
    const runId = `content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info(
      `Starting content flow ${runId} for topic: ${topic} (autonomous=${!contentConfig?.enableHITL})`
    );

    const { smartModel, fastModel } = this.createModels();

    const config: ContentCreationConfig = {
      topic,
      format: contentConfig?.format || 'guide',
      tone: contentConfig?.tone || 'conversational',
      audience: contentConfig?.audience || 'intermediate',
      outputFormats: contentConfig?.outputFormats || ['markdown'],
      smartModel,
      fastModel,
      enableHITL: contentConfig?.enableHITL || false,
      maxRetries: contentConfig?.maxRetries ?? 2,
    };

    const status: ContentFlowStatus = {
      runId,
      status: 'running',
      progress: 0,
      hitlGatesPending: [],
      createdAt: Date.now(),
    };

    this.activeRuns.set(runId, status);

    const flow = createContentCreationFlow({ enableHITL: config.enableHITL });

    this.executeFlow(runId, projectPath, flow, config).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Flow ${runId} failed:`, error);
      const failedStatus = this.activeRuns.get(runId);
      if (failedStatus) {
        failedStatus.status = 'failed';
        failedStatus.error = message;
        this.emitStatus(failedStatus);
      }
    });

    return { runId, status };
  }

  /**
   * Extract review scores from a flow state object
   */
  private extractReviewScores(state: Record<string, unknown>): ContentFlowStatus['reviewScores'] {
    const reviewScores: ContentFlowStatus['reviewScores'] = {};

    const researchReview = state.researchReview as
      | { percentage: number; passed: boolean; verdict: string }
      | undefined;
    if (researchReview) {
      reviewScores.research = {
        percentage: researchReview.percentage,
        passed: researchReview.passed,
        verdict: researchReview.verdict,
      };
    }

    const outlineReview = state.outlineReview as
      | { percentage: number; passed: boolean; verdict: string }
      | undefined;
    if (outlineReview) {
      reviewScores.outline = {
        percentage: outlineReview.percentage,
        passed: outlineReview.passed,
        verdict: outlineReview.verdict,
      };
    }

    const finalContentReview = state.finalContentReview as
      | { percentage: number; passed: boolean; verdict: string }
      | undefined;
    if (finalContentReview) {
      reviewScores.content = {
        percentage: finalContentReview.percentage,
        passed: finalContentReview.passed,
        verdict: finalContentReview.verdict,
      };
    }

    return reviewScores;
  }

  /**
   * Execute the flow asynchronously using streaming for node-level status tracking.
   *
   * In autonomous mode (default), the flow streams through all nodes with
   * antagonistic review nodes handling quality gates automatically.
   * Status updates are emitted as each node completes.
   *
   * In HITL mode (enableHITL=true), the flow compiles with interruptBefore
   * and pauses at each HITL gate for human input.
   */
  private async executeFlow(
    runId: string,
    projectPath: string,
    flow: ReturnType<typeof createContentCreationFlow>,
    config: ContentCreationConfig
  ): Promise<void> {
    const status = this.activeRuns.get(runId);
    if (!status) return;

    try {
      const threadConfig = { configurable: { thread_id: runId } };

      // Stream the flow to get per-node updates
      let lastState: Record<string, unknown> = {};
      const stream = await flow.stream({ config: config as never }, threadConfig);

      for await (const update of stream) {
        // Each update is { nodeName: nodeOutput }
        const nodeName = Object.keys(update)[0];
        if (!nodeName) continue;

        lastState = { ...lastState, ...update[nodeName] };

        // Update status based on the node that just completed
        const reviewingStatus = NODE_STATUS_MAP[nodeName];
        if (reviewingStatus) {
          status.status = reviewingStatus;
        } else if (status.status !== 'interrupted') {
          status.status = 'running';
        }

        // Update progress
        const progress = NODE_PROGRESS_MAP[nodeName];
        if (progress !== undefined) {
          status.progress = progress;
        }

        status.currentNode = nodeName;

        // Incrementally update review scores as they become available
        status.reviewScores = this.extractReviewScores(lastState);

        this.emitStatus(status);

        logger.debug(`Flow ${runId} completed node: ${nodeName} (${status.progress}%)`);
      }

      // Check if we hit an interrupt (only possible when enableHITL=true)
      const interruptInfo = await flow.getState(threadConfig);
      if (interruptInfo.next && interruptInfo.next.length > 0) {
        const nextNode = interruptInfo.next[0];
        status.status = 'interrupted';
        status.currentNode = nextNode;

        if (nextNode === 'research_hitl') {
          status.hitlGatesPending = ['research_hitl'];
          status.progress = 20;
        } else if (nextNode === 'outline_hitl') {
          status.hitlGatesPending = ['outline_hitl'];
          status.progress = 40;
        } else if (nextNode === 'final_review_hitl') {
          status.hitlGatesPending = ['final_review_hitl'];
          status.progress = 80;
        }

        logger.info(`Flow ${runId} interrupted at ${nextNode}`);
        this.emitStatus(status);
      } else {
        // Flow completed (autonomous or after all HITL gates passed)
        status.status = 'completed';
        status.progress = 100;
        status.completedAt = Date.now();

        await this.saveOutputs(runId, projectPath, lastState);
        this.emitStatus(status);

        logger.info(`Flow ${runId} completed with review scores:`, status.reviewScores);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Flow ${runId} execution error:`, error);
      status.status = 'failed';
      status.error = message;
      this.emitStatus(status);
    }
  }

  /**
   * Get status of a content flow run
   */
  getStatus(runId: string): ContentFlowStatus | null {
    return this.activeRuns.get(runId) || null;
  }

  /**
   * Get execution state for all active flows
   *
   * Returns metadata about all running content flows including
   * progress, current node, and review scores.
   */
  getExecutionState(): {
    activeFlows: Array<{
      runId: string;
      status: string;
      progress: number;
      currentNode?: string;
      reviewScores?: ContentFlowStatus['reviewScores'];
      createdAt: number;
    }>;
    totalActive: number;
  } {
    const activeFlows = Array.from(this.activeRuns.values())
      .filter((flow) => flow.status === 'running' || flow.status === 'interrupted')
      .map((flow) => ({
        runId: flow.runId,
        status: flow.status,
        progress: flow.progress,
        currentNode: flow.currentNode,
        reviewScores: flow.reviewScores,
        createdAt: flow.createdAt,
      }));

    return {
      activeFlows,
      totalActive: activeFlows.length,
    };
  }

  /**
   * Resume a flow with HITL review.
   *
   * Only works when the flow was started with enableHITL=true and is
   * currently in 'interrupted' status. In autonomous mode, the flow
   * runs end-to-end without interrupts.
   */
  async resumeFlow(
    projectPath: string,
    runId: string,
    review: HITLReview
  ): Promise<{ success: boolean; status: ContentFlowStatus }> {
    const status = this.activeRuns.get(runId);

    if (!status) {
      throw new Error(`Flow ${runId} not found`);
    }

    if (status.status !== 'interrupted') {
      throw new Error(`Flow ${runId} is not interrupted (current status: ${status.status})`);
    }

    logger.info(`Resuming flow ${runId} at gate ${review.gate} with decision: ${review.decision}`);

    const flow = createContentCreationFlow({ enableHITL: true });

    const resumeState: Record<string, unknown> = {};

    if (review.gate === 'research_hitl') {
      resumeState.researchApproved = review.decision === 'approve';
      if (review.feedback) {
        resumeState.researchFeedback = review.feedback;
      }
    } else if (review.gate === 'outline_hitl') {
      resumeState.outlineApproved = review.decision === 'approve';
      if (review.feedback) {
        resumeState.outlineFeedback = review.feedback;
      }
    } else if (review.gate === 'final_review_hitl') {
      resumeState.reviewApproved = review.decision === 'approve';
      if (review.feedback) {
        resumeState.finalReviewFeedback = review.feedback;
      }
    }

    // Pass user-edited content through to the HITL node for merging
    if (review.editedContent) {
      resumeState.userEditedContent = review.editedContent;
    }

    status.status = 'running';
    status.hitlGatesPending = [];
    this.emitStatus(status);

    const threadConfig = { configurable: { thread_id: runId } };

    try {
      // Stream the resumed flow to track node transitions
      let lastState: Record<string, unknown> = {};
      const stream = await flow.stream(resumeState, threadConfig);

      for await (const update of stream) {
        const nodeName = Object.keys(update)[0];
        if (!nodeName) continue;

        lastState = { ...lastState, ...update[nodeName] };

        const reviewingStatus = NODE_STATUS_MAP[nodeName];
        if (reviewingStatus) {
          status.status = reviewingStatus;
        } else if (status.status !== 'interrupted') {
          status.status = 'running';
        }

        const progress = NODE_PROGRESS_MAP[nodeName];
        if (progress !== undefined) {
          status.progress = progress;
        }

        status.currentNode = nodeName;
        status.reviewScores = this.extractReviewScores(lastState);
        this.emitStatus(status);
      }

      // Check if we hit another interrupt or completed
      const interruptInfo = await flow.getState(threadConfig);
      if (interruptInfo.next && interruptInfo.next.length > 0) {
        const nextNode = interruptInfo.next[0];
        status.status = 'interrupted';
        status.currentNode = nextNode;

        if (nextNode === 'research_hitl') {
          status.hitlGatesPending = ['research_hitl'];
          status.progress = 20;
        } else if (nextNode === 'outline_hitl') {
          status.hitlGatesPending = ['outline_hitl'];
          status.progress = 40;
        } else if (nextNode === 'final_review_hitl') {
          status.hitlGatesPending = ['final_review_hitl'];
          status.progress = 80;
        }

        this.emitStatus(status);
      } else {
        status.status = 'completed';
        status.progress = 100;
        status.completedAt = Date.now();

        await this.saveOutputs(runId, projectPath, lastState);
        this.emitStatus(status);
      }

      return { success: true, status };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Flow ${runId} resume error:`, error);
      status.status = 'failed';
      status.error = message;
      this.emitStatus(status);
      return { success: false, status };
    }
  }

  /**
   * Save flow outputs to disk
   */
  private async saveOutputs(
    runId: string,
    projectPath: string,
    finalState: Record<string, unknown>
  ): Promise<void> {
    const automakerDir = getAutomakerDir(projectPath);
    const contentDir = path.join(automakerDir, 'content', runId);

    await fs.mkdir(contentDir, { recursive: true });

    const outputs = finalState.outputs as
      | Array<{ success: boolean; format: string; content: string }>
      | undefined;
    if (outputs && outputs.length > 0) {
      for (const output of outputs) {
        if (output.success) {
          const ext = output.format === 'markdown' ? 'md' : output.format;
          const filename = `content.${ext}`;
          const filepath = path.join(contentDir, filename);

          await fs.writeFile(filepath, output.content, 'utf-8');
          logger.info(`Saved ${output.format} output to ${filepath}`);
        }
      }
    }

    // Save metadata including review scores
    const status = this.activeRuns.get(runId);
    const flowConfig = finalState.config as { topic?: string; format?: string } | undefined;
    const metadata = {
      runId,
      topic: flowConfig?.topic || 'Unknown',
      format: flowConfig?.format || 'unknown',
      status: 'completed',
      outputPath: contentDir,
      reviewScores: status?.reviewScores,
      createdAt: status?.createdAt || Date.now(),
      completedAt: Date.now(),
    };

    const metadataPath = path.join(contentDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    logger.info(`Saved metadata to ${metadataPath}`);
  }

  /**
   * List all generated content
   */
  async listContent(
    projectPath: string,
    filters?: { contentType?: string; status?: string }
  ): Promise<ContentMetadata[]> {
    const automakerDir = getAutomakerDir(projectPath);
    const contentDir = path.join(automakerDir, 'content');

    try {
      const entries = await fs.readdir(contentDir);
      const metadata: ContentMetadata[] = [];

      for (const entry of entries) {
        const metadataPath = path.join(contentDir, entry, 'metadata.json');
        try {
          const data = await fs.readFile(metadataPath, 'utf-8');
          const meta = JSON.parse(data) as ContentMetadata;

          if (filters?.status && meta.status !== filters.status) {
            continue;
          }

          metadata.push(meta);
        } catch {
          logger.warn(`No metadata for ${entry}`);
        }
      }

      return metadata.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  /**
   * Export content in specific format
   */
  async exportContent(
    projectPath: string,
    runId: string,
    format: 'markdown' | 'hf-dataset' | 'jsonl' | 'frontmatter-md'
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    const automakerDir = getAutomakerDir(projectPath);
    const contentDir = path.join(automakerDir, 'content', runId);

    try {
      const markdownPath = path.join(contentDir, 'content.md');
      const content = await fs.readFile(markdownPath, 'utf-8');

      let outputPath: string;
      let outputContent: string;

      switch (format) {
        case 'markdown':
          outputPath = markdownPath;
          break;

        case 'frontmatter-md':
          outputPath = path.join(contentDir, 'content-frontmatter.md');
          outputContent = `---
title: Generated Content
date: ${new Date().toISOString()}
---

${content}`;
          await fs.writeFile(outputPath, outputContent, 'utf-8');
          break;

        case 'jsonl':
          outputPath = path.join(contentDir, 'content.jsonl');
          outputContent = JSON.stringify({ content, createdAt: Date.now() }) + '\n';
          await fs.writeFile(outputPath, outputContent, 'utf-8');
          break;

        case 'hf-dataset': {
          outputPath = path.join(contentDir, 'dataset.json');
          const datasetEntry = {
            text: content,
            metadata: {
              runId,
              createdAt: Date.now(),
            },
          };
          await fs.writeFile(outputPath, JSON.stringify(datasetEntry, null, 2), 'utf-8');
          break;
        }

        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      logger.info(`Exported content to ${outputPath}`);
      return { success: true, filePath: outputPath };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Export failed for ${runId}:`, error);
      return { success: false, error: message };
    }
  }
}

// Singleton instance
export const contentFlowService = new ContentFlowService();
