/**
 * Content Flow Service
 *
 * Manages content creation flow execution via LangGraph.
 * Handles HITL interrupts, status tracking, and output management.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { createLogger } from '@automaker/utils';
import { getAutomakerDir } from '@automaker/platform';
import { MemorySaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';
import { createContentCreationFlow } from '@automaker/flows';

const logger = createLogger('ContentFlowService');

/**
 * Content creation config type (from content-creation-flow)
 */
interface ContentCreationConfig {
  topic: string;
  format: 'tutorial' | 'reference' | 'guide';
  tone: 'technical' | 'conversational' | 'formal';
  audience: 'beginner' | 'intermediate' | 'expert';
  outputFormats: Array<'markdown' | 'html' | 'pdf'>;
  smartModel: BaseChatModel;
  fastModel: BaseChatModel;
}

/**
 * Status of a content flow run
 */
export interface ContentFlowStatus {
  runId: string;
  status: 'running' | 'interrupted' | 'completed' | 'failed';
  currentNode?: string;
  progress: number; // 0-100
  hitlGatesPending: string[]; // e.g., ['research_hitl', 'outline_hitl']
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
 * HITL review decision
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
  private checkpointer: MemorySaver;
  private activeRuns: Map<string, ContentFlowStatus>;

  constructor() {
    this.checkpointer = new MemorySaver();
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
   * Start a content creation flow
   */
  async startFlow(
    projectPath: string,
    topic: string,
    contentConfig?: {
      format?: 'tutorial' | 'reference' | 'guide';
      tone?: 'technical' | 'conversational' | 'formal';
      audience?: 'beginner' | 'intermediate' | 'expert';
      outputFormats?: Array<'markdown' | 'html' | 'pdf'>;
    }
  ): Promise<{ runId: string; status: ContentFlowStatus }> {
    const runId = `content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info(`Starting content flow ${runId} for topic: ${topic}`);

    const { smartModel, fastModel } = this.createModels();

    // Prepare full config
    const config: ContentCreationConfig = {
      topic,
      format: contentConfig?.format || 'guide',
      tone: contentConfig?.tone || 'conversational',
      audience: contentConfig?.audience || 'intermediate',
      outputFormats: contentConfig?.outputFormats || ['markdown'],
      smartModel,
      fastModel,
    };

    // Initialize status
    const status: ContentFlowStatus = {
      runId,
      status: 'running',
      progress: 0,
      hitlGatesPending: [],
      createdAt: Date.now(),
    };

    this.activeRuns.set(runId, status);

    // Create and compile flow
    const flow = createContentCreationFlow({ checkpointer: this.checkpointer });

    // Start flow execution asynchronously
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
   * Execute the flow asynchronously
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
      const threadId = runId;
      const threadConfig = { configurable: { thread_id: threadId } };

      // Invoke the flow (will run until first interrupt or completion)
      const result = await flow.invoke({ config }, threadConfig);

      logger.info(`Flow ${runId} result:`, Object.keys(result));

      // Check if we hit an interrupt
      const interruptInfo = await flow.getState(threadConfig);
      if (interruptInfo.next && interruptInfo.next.length > 0) {
        // Flow is interrupted
        const nextNode = interruptInfo.next[0];
        if (nextNode === 'research_hitl') {
          status.status = 'interrupted';
          status.currentNode = 'research_hitl';
          status.hitlGatesPending = ['research_hitl'];
          status.progress = 20;
        } else if (nextNode === 'outline_hitl') {
          status.status = 'interrupted';
          status.currentNode = 'outline_hitl';
          status.hitlGatesPending = ['outline_hitl'];
          status.progress = 40;
        } else if (nextNode === 'final_review_hitl') {
          status.status = 'interrupted';
          status.currentNode = 'final_review_hitl';
          status.hitlGatesPending = ['final_review_hitl'];
          status.progress = 80;
        }
        logger.info(`Flow ${runId} interrupted at ${status.currentNode}`);
      } else {
        // Flow completed
        status.status = 'completed';
        status.progress = 100;
        status.completedAt = Date.now();

        // Save outputs
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
   * Resume a flow with HITL review
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

    // Create flow
    const { smartModel, fastModel } = this.createModels();
    const flow = createContentCreationFlow({ checkpointer: this.checkpointer });

    // Prepare resume state based on gate
    const resumeState: any = {};

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

    // Update status
    status.status = 'running';
    status.hitlGatesPending = [];

    // Resume execution
    const threadId = runId;
    const threadConfig = { configurable: { thread_id: threadId } };

    try {
      // Resume from the interrupt point by invoking with new state
      const result = await flow.invoke(resumeState, threadConfig);

      logger.info(`Flow ${runId} resumed:`, Object.keys(result));

      // Check if we hit another interrupt or completed
      const interruptInfo = await flow.getState(threadConfig);
      if (interruptInfo.next && interruptInfo.next.length > 0) {
        // Flow hit another interrupt
        const nextNode = interruptInfo.next[0];
        if (nextNode === 'research_hitl') {
          status.status = 'interrupted';
          status.currentNode = 'research_hitl';
          status.hitlGatesPending = ['research_hitl'];
          status.progress = 20;
        } else if (nextNode === 'outline_hitl') {
          status.status = 'interrupted';
          status.currentNode = 'outline_hitl';
          status.hitlGatesPending = ['outline_hitl'];
          status.progress = 40;
        } else if (nextNode === 'final_review_hitl') {
          status.status = 'interrupted';
          status.currentNode = 'final_review_hitl';
          status.hitlGatesPending = ['final_review_hitl'];
          status.progress = 80;
        }
      } else {
        // Flow completed
        status.status = 'completed';
        status.progress = 100;
        status.completedAt = Date.now();

        // Save outputs
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

    // Save outputs
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

    // Save metadata
    const metadata = {
      runId,
      topic: finalState.config?.topic || 'Unknown',
      format: finalState.config?.format || 'unknown',
      status: 'completed',
      outputPath: contentDir,
      createdAt: this.activeRuns.get(runId)?.createdAt || Date.now(),
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

          // Apply filters
          if (filters?.status && meta.status !== filters.status) {
            continue;
          }

          metadata.push(meta);
        } catch (error) {
          // Skip if no metadata file
          logger.warn(`No metadata for ${entry}`);
        }
      }

      return metadata.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      // No content directory yet
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
      // Read existing content
      const markdownPath = path.join(contentDir, 'content.md');
      const content = await fs.readFile(markdownPath, 'utf-8');

      let outputPath: string;
      let outputContent: string;

      switch (format) {
        case 'markdown':
          // Already in markdown format
          outputPath = markdownPath;
          break;

        case 'frontmatter-md':
          // Add YAML frontmatter
          outputPath = path.join(contentDir, 'content-frontmatter.md');
          outputContent = `---
title: Generated Content
date: ${new Date().toISOString()}
---

${content}`;
          await fs.writeFile(outputPath, outputContent, 'utf-8');
          break;

        case 'jsonl':
          // Convert to JSONL (one JSON object per line)
          outputPath = path.join(contentDir, 'content.jsonl');
          outputContent = JSON.stringify({ content, createdAt: Date.now() }) + '\n';
          await fs.writeFile(outputPath, outputContent, 'utf-8');
          break;

        case 'hf-dataset':
          // Convert to HuggingFace dataset format
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
