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

const logger = createLogger('ContentFlowService');

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
}

/**
 * Service for managing content creation flows
 */
export class ContentFlowService {
  private activeRuns: Map<string, ContentFlowStatus>;

  constructor() {
    this.activeRuns = new Map();
  }

  /**
   * Create models from config
   */
  private createModels(): { smartModel: BaseChatModel; fastModel: BaseChatModel } {
    const smartModel = new ChatAnthropic({
      model: 'claude-sonnet-4-5-20250929',
      temperature: 0.7,
    });

    const fastModel = new ChatAnthropic({
      model: 'claude-haiku-4-5-20251001',
      temperature: 0.5,
    });

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

    const flow = createContentCreationFlow();

    this.executeFlow(runId, projectPath, flow, config).catch((error) => {
      logger.error(`Flow ${runId} failed:`, error);
      const failedStatus = this.activeRuns.get(runId);
      if (failedStatus) {
        failedStatus.status = 'failed';
        failedStatus.error = error.message;
      }
    });

    return { runId, status };
  }

  /**
   * Execute the flow asynchronously.
   *
   * In autonomous mode (default), the flow runs straight through with
   * antagonistic review nodes handling quality gates automatically.
   *
   * In HITL mode (enableHITL=true), the flow compiles with interruptBefore
   * and pauses at each HITL gate for human input.
   */
  private async executeFlow(
    runId: string,
    projectPath: string,
    flow: any,
    config: ContentCreationConfig
  ): Promise<void> {
    const status = this.activeRuns.get(runId);
    if (!status) return;

    try {
      const threadConfig = { configurable: { thread_id: runId } };

      // Update status to show we're in the research phase
      status.currentNode = 'generate_queries';
      status.progress = 5;

      const result = await flow.invoke({ config }, threadConfig);

      logger.info(`Flow ${runId} completed with keys:`, Object.keys(result));

      // Extract review scores from final state
      const reviewScores: ContentFlowStatus['reviewScores'] = {};
      if (result.researchReview) {
        reviewScores.research = {
          percentage: result.researchReview.percentage,
          passed: result.researchReview.passed,
          verdict: result.researchReview.verdict,
        };
      }
      if (result.outlineReview) {
        reviewScores.outline = {
          percentage: result.outlineReview.percentage,
          passed: result.outlineReview.passed,
          verdict: result.outlineReview.verdict,
        };
      }
      if (result.finalContentReview) {
        reviewScores.content = {
          percentage: result.finalContentReview.percentage,
          passed: result.finalContentReview.passed,
          verdict: result.finalContentReview.verdict,
        };
      }

      // Check if we hit an interrupt (only possible when enableHITL=true)
      const interruptInfo = await flow.getState(threadConfig);
      if (interruptInfo.next && interruptInfo.next.length > 0) {
        const nextNode = interruptInfo.next[0];
        status.status = 'interrupted';
        status.currentNode = nextNode;
        status.reviewScores = reviewScores;

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
      } else {
        // Flow completed (autonomous or after all HITL gates passed)
        status.status = 'completed';
        status.progress = 100;
        status.completedAt = Date.now();
        status.reviewScores = reviewScores;

        await this.saveOutputs(runId, projectPath, result);
      }
    } catch (error: any) {
      logger.error(`Flow ${runId} execution error:`, error);
      status.status = 'failed';
      status.error = error.message;
    }
  }

  /**
   * Get status of a content flow run
   */
  getStatus(runId: string): ContentFlowStatus | null {
    return this.activeRuns.get(runId) || null;
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

    const flow = createContentCreationFlow();

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

    status.status = 'running';
    status.hitlGatesPending = [];

    const threadConfig = { configurable: { thread_id: runId } };

    try {
      const result = await flow.invoke(resumeState, threadConfig);

      logger.info(`Flow ${runId} resumed with keys:`, Object.keys(result));

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
      } else {
        status.status = 'completed';
        status.progress = 100;
        status.completedAt = Date.now();

        await this.saveOutputs(runId, projectPath, result);
      }

      return { success: true, status };
    } catch (error: any) {
      logger.error(`Flow ${runId} resume error:`, error);
      status.status = 'failed';
      status.error = error.message;
      return { success: false, status };
    }
  }

  /**
   * Save flow outputs to disk
   */
  private async saveOutputs(runId: string, projectPath: string, finalState: any): Promise<void> {
    const automakerDir = getAutomakerDir(projectPath);
    const contentDir = path.join(automakerDir, 'content', runId);

    await fs.mkdir(contentDir, { recursive: true });

    if (finalState.outputs && finalState.outputs.length > 0) {
      for (const output of finalState.outputs) {
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
    const metadata = {
      runId,
      topic: finalState.config?.topic || 'Unknown',
      format: finalState.config?.format || 'unknown',
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

        case 'hf-dataset':
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

        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      logger.info(`Exported content to ${outputPath}`);
      return { success: true, filePath: outputPath };
    } catch (error: any) {
      logger.error(`Export failed for ${runId}:`, error);
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
export const contentFlowService = new ContentFlowService();
