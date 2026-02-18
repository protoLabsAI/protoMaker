/**
 * Idea Processing Service
 *
 * Wraps the LangGraph idea processing flow and manages sessions for HITL (human-in-the-loop).
 * Provides session management for interrupted flows that need user approval.
 */

import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
import { createLogger } from '@automaker/utils';
import { ideaProcessingGraph, type IdeaProcessingState, type IdeaInput } from '@automaker/flows';
import { LangfuseClient } from '@automaker/observability';
import type {
  IdeaSessionStatus,
  IdeaNodeState,
  IdeaNodeStatus,
  IdeaSessionPath,
} from '@automaker/types';

/**
 * Maps each graph node to a progress percentage (0-100)
 * Used to track progress through the idea processing flow
 */
const NODE_PROGRESS_MAP: Record<string, number> = {
  classify_complexity: 20,
  research: 50,
  fast_path_review: 70,
  review: 80,
  done: 100,
};

interface IdeaSession {
  id: string;
  idea: string;
  status: IdeaSessionStatus;
  state?: unknown; // LangGraph state snapshot for resume
  result?: unknown; // Final result when completed
  error?: string;
  createdAt: string;
  updatedAt: string;
  nodes?: Record<string, IdeaNodeState>;
  progress?: number;
  path?: IdeaSessionPath;
  source?: string;
  countdown?: {
    startedAt: string;
    expiresAt: string;
    durationSeconds: number;
  };
}

interface ProcessIdeaOptions {
  idea: string;
  autoApprove?: boolean;
  countdownSeconds?: number;
}

interface ResumeIdeaOptions {
  sessionId: string;
  approved: boolean;
  feedback?: string;
}

interface RefireNodeOptions {
  sessionId: string;
  nodeId: string;
}

interface EditNodeOptions {
  sessionId: string;
  nodeId: string;
  statePatch: Partial<IdeaProcessingState>;
}

export class IdeaProcessingService {
  private sessions = new Map<string, IdeaSession>();
  private stateDir: string;
  private events: EventEmitter;
  private logger = createLogger('IdeaProcessingService');
  private langfuse: LangfuseClient;

  constructor(dataDir: string, events: EventEmitter) {
    this.stateDir = path.join(dataDir, 'idea-sessions');
    this.events = events;
    this.langfuse = new LangfuseClient({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
      enabled: !!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY),
    });
  }

  /**
   * Initialize service - ensure state directory exists
   */
  async init(): Promise<void> {
    try {
      await secureFs.mkdir(this.stateDir, { recursive: true });
      await this.loadSessions();
      this.logger.info('Idea processing service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize idea processing service', { error });
      throw error;
    }
  }

  /**
   * Load sessions from disk
   */
  private async loadSessions(): Promise<void> {
    try {
      const files = await secureFs.readdir(this.stateDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const sessionPath = path.join(this.stateDir, file);
          const content = await secureFs.readFile(sessionPath, 'utf-8');
          const session = JSON.parse(content.toString()) as IdeaSession;
          this.sessions.set(session.id, session);
        }
      }
      this.logger.info(`Loaded ${this.sessions.size} idea sessions from disk`);
    } catch (error) {
      this.logger.warn('Failed to load sessions from disk', { error });
    }
  }

  /**
   * Save session to disk
   */
  private async saveSession(session: IdeaSession): Promise<void> {
    const sessionPath = path.join(this.stateDir, `${session.id}.json`);
    await secureFs.writeFile(sessionPath, JSON.stringify(session, null, 2));
  }

  /**
   * Delete session from disk
   */
  private async deleteSession(sessionId: string): Promise<void> {
    const sessionPath = path.join(this.stateDir, `${sessionId}.json`);
    try {
      await secureFs.unlink(sessionPath);
    } catch (error) {
      // Ignore if file doesn't exist
      this.logger.debug('Failed to delete session file', { sessionId, error });
    }
  }

  /**
   * Process a new idea through the LangGraph flow
   */
  async processIdea(options: ProcessIdeaOptions): Promise<string> {
    const sessionId = `idea-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const session: IdeaSession = {
      id: sessionId,
      idea: options.idea,
      status: 'processing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // If countdown is specified, set up the countdown metadata
    if (options.countdownSeconds) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + options.countdownSeconds * 1000);
      session.countdown = {
        startedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        durationSeconds: options.countdownSeconds,
      };
    }

    this.sessions.set(sessionId, session);
    await this.saveSession(session);

    // Emit event for session created (new granular event)
    this.events.emit('idea:session-created', {
      sessionId,
      idea: options.idea,
      autoApprove: options.autoApprove,
      countdownSeconds: options.countdownSeconds,
    });

    // Emit legacy event for backward compatibility
    this.events.emit('ideation:session-started', {
      sessionId,
      idea: options.idea,
    });

    this.logger.info('Idea processing started', { sessionId, idea: options.idea });

    // Execute LangGraph flow asynchronously
    this.executeIdeaFlow(sessionId, options).catch((error) => {
      this.logger.error('Idea processing flow failed', { sessionId, error });
      this.updateSessionStatus(sessionId, 'failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    return sessionId;
  }

  /**
   * Execute the LangGraph idea processing flow
   */
  private async executeIdeaFlow(sessionId: string, options: ProcessIdeaOptions): Promise<void> {
    const startTime = new Date();

    // Create Langfuse trace
    const trace = this.langfuse.createTrace({
      id: `idea-${sessionId}`,
      name: 'Idea Processing',
      sessionId,
      metadata: {
        idea: options.idea,
        autoApprove: options.autoApprove,
        countdownSeconds: options.countdownSeconds,
      },
      tags: ['idea-processing', 'langgraph'],
    });

    try {
      // Parse idea text into structured input
      const ideaInput: IdeaInput = {
        title: this.extractTitle(options.idea),
        description: options.idea,
      };

      // Create initial state
      const initialState: IdeaProcessingState = {
        idea: ideaInput,
        processingNotes: [],
      };

      // Stream the graph execution
      const stream = await ideaProcessingGraph.stream(initialState, {
        configurable: { thread_id: sessionId },
      });

      let finalState: IdeaProcessingState | undefined;

      for await (const event of stream) {
        // Event is a Record<nodeName, Partial<State>>
        const nodeNames = Object.keys(event);
        for (const nodeName of nodeNames) {
          const nodeOutput = event[nodeName];

          // Emit node-enter event before processing
          const progress = NODE_PROGRESS_MAP[nodeName] ?? 0;
          this.events.emit('idea:node-enter', {
            sessionId,
            node: nodeName,
            progress,
          });

          try {
            // Log span for each node execution
            this.langfuse.createSpan({
              traceId: trace?.id || `idea-${sessionId}`,
              name: nodeName,
              input: nodeOutput,
              metadata: {
                sessionId,
                node: nodeName,
              },
            });

            // Emit streaming event (legacy)
            this.events.emit('ideation:stream', {
              sessionId,
              node: nodeName,
              output: nodeOutput,
            });

            // Track final state
            finalState = { ...finalState, ...nodeOutput } as IdeaProcessingState;

            // Emit node-complete event after processing
            this.events.emit('idea:node-complete', {
              sessionId,
              node: nodeName,
              output: nodeOutput,
              progress,
            });
          } catch (nodeError) {
            // Emit node-error event if node processing fails
            this.events.emit('idea:node-error', {
              sessionId,
              node: nodeName,
              error: nodeError instanceof Error ? nodeError.message : String(nodeError),
              progress,
            });
            throw nodeError;
          }
        }
      }

      if (!finalState) {
        throw new Error('Flow completed without producing final state');
      }

      const endTime = new Date();

      // Update trace
      if (trace) {
        trace.update({
          output: {
            approved: finalState.approved,
            category: finalState.category,
            impact: finalState.impact,
            effort: finalState.effort,
            usedFastPath: finalState.usedFastPath,
          },
          metadata: {
            complexity: finalState.complexity,
            processingNotes: finalState.processingNotes,
            duration: endTime.getTime() - startTime.getTime(),
          },
        });
      }

      // Decide next status based on autoApprove and flow result
      if (finalState.approved && options.autoApprove) {
        // Auto-approved, move to completed
        await this.updateSessionStatus(sessionId, 'completed', {
          state: finalState,
          result: {
            approved: finalState.approved,
            category: finalState.category,
            impact: finalState.impact,
            effort: finalState.effort,
          },
        });

        // Emit completed event
        this.events.emit('idea:completed', {
          sessionId,
          approved: true,
          autoApproved: true,
          category: finalState.category,
          impact: finalState.impact,
          effort: finalState.effort,
        });
      } else if (finalState.approved) {
        // Needs human approval
        await this.updateSessionStatus(sessionId, 'awaiting_approval', {
          state: finalState,
        });

        // Emit approval-needed event
        this.events.emit('idea:approval-needed', {
          sessionId,
          category: finalState.category,
          impact: finalState.impact,
          effort: finalState.effort,
          countdownSeconds: options.countdownSeconds,
        });
      } else {
        // Flow rejected the idea
        await this.updateSessionStatus(sessionId, 'failed', {
          state: finalState,
          error: finalState.reviewOutput?.reasoning || 'Idea rejected by flow',
        });

        // Emit completed event with rejected status
        this.events.emit('idea:completed', {
          sessionId,
          approved: false,
          reason: finalState.reviewOutput?.reasoning || 'Idea rejected by flow',
        });
      }

      await this.langfuse.flush();
    } catch (error) {
      const endTime = new Date();

      // Log error to trace
      if (trace) {
        trace.update({
          output: {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          metadata: {
            duration: endTime.getTime() - startTime.getTime(),
            failed: true,
          },
        });
      }

      await this.langfuse.flush();
      throw error;
    }
  }

  /**
   * Extract title from idea text (first line or first sentence)
   */
  private extractTitle(idea: string): string {
    const lines = idea.split('\n');
    const firstLine = lines[0].trim();
    if (firstLine.length > 0 && firstLine.length <= 100) {
      return firstLine;
    }
    // Fallback to first sentence
    const sentences = idea.split(/[.!?]/);
    const firstSentence = sentences[0].trim();
    return firstSentence.substring(0, 100);
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId: string): Promise<IdeaSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Resume an interrupted session with user feedback
   */
  async resumeSession(options: ResumeIdeaOptions): Promise<void> {
    const session = this.sessions.get(options.sessionId);
    if (!session) {
      throw new Error(`Session ${options.sessionId} not found`);
    }

    if (session.status !== 'awaiting_approval') {
      throw new Error(
        `Session ${options.sessionId} is not awaiting approval (status: ${session.status})`
      );
    }

    // Emit resume event
    this.events.emit('ideation:stream', {
      sessionId: options.sessionId,
      approved: options.approved,
      feedback: options.feedback,
    });

    if (options.approved) {
      // Mark as completed with user approval
      session.status = 'completed';
      session.updatedAt = new Date().toISOString();
      session.result = {
        approved: true,
        state: session.state,
        userFeedback: options.feedback,
      };
      await this.saveSession(session);

      this.logger.info('Idea session approved by user', { sessionId: options.sessionId });

      // Emit completion event
      this.events.emit('ideation:stream', {
        sessionId: options.sessionId,
        status: 'completed',
        result: session.result,
      });
    } else {
      // Mark as failed if rejected
      session.status = 'failed';
      session.error = options.feedback || 'Rejected by user';
      session.updatedAt = new Date().toISOString();
      await this.saveSession(session);

      this.logger.info('Idea session rejected', { sessionId: options.sessionId });
    }
  }

  /**
   * List all active sessions
   */
  async listSessions(): Promise<IdeaSession[]> {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Clean up completed sessions older than specified days
   */
  async cleanupOldSessions(olderThanDays = 7): Promise<number> {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      const isOld = new Date(session.updatedAt).getTime() < cutoffTime;
      const isTerminal = session.status === 'completed' || session.status === 'failed';

      if (isOld && isTerminal) {
        this.sessions.delete(sessionId);
        await this.deleteSession(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.info(`Cleaned up ${cleaned} old idea sessions`);
    }

    return cleaned;
  }

  /**
   * Update session status (internal helper)
   */
  private async updateSessionStatus(
    sessionId: string,
    status: IdeaSession['status'],
    updates: Partial<IdeaSession> = {}
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.status = status;
    session.updatedAt = new Date().toISOString();
    Object.assign(session, updates);

    await this.saveSession(session);

    // Emit status update event
    this.events.emit('ideation:stream', {
      sessionId,
      status,
      session,
    });

    this.logger.info('Idea session status updated', { sessionId, status });
  }

  /**
   * Refire a node - load checkpoint at target node and re-execute from that point
   */
  async refireNode(options: RefireNodeOptions): Promise<void> {
    const session = this.sessions.get(options.sessionId);
    if (!session) {
      throw new Error(`Session ${options.sessionId} not found`);
    }

    this.logger.info('Refiring node', {
      sessionId: options.sessionId,
      nodeId: options.nodeId,
    });

    // Update session status
    await this.updateSessionStatus(options.sessionId, 'processing');

    // Execute refire flow asynchronously
    this.executeRefireFlow(options).catch((error) => {
      this.logger.error('Refire flow failed', { sessionId: options.sessionId, error });
      this.updateSessionStatus(options.sessionId, 'failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  }

  /**
   * Execute refire flow - loads checkpoint and re-streams from current state
   * Note: LangGraph doesn't support arbitrary node jumping. This resumes from
   * the current checkpoint state and re-executes remaining nodes.
   */
  private async executeRefireFlow(options: RefireNodeOptions): Promise<void> {
    const startTime = new Date();
    const session = this.sessions.get(options.sessionId);

    if (!session) {
      throw new Error(`Session ${options.sessionId} not found`);
    }

    // Create Langfuse trace for refire
    const trace = this.langfuse.createTrace({
      id: `idea-refire-${options.sessionId}-${Date.now()}`,
      name: 'Idea Processing Refire',
      sessionId: options.sessionId,
      metadata: {
        nodeId: options.nodeId,
        originalSessionId: options.sessionId,
      },
      tags: ['idea-processing', 'refire', 'langgraph'],
    });

    try {
      // Resume from checkpoint - passing null tells LangGraph to resume from saved state
      const stream = await ideaProcessingGraph.stream(null, {
        configurable: { thread_id: options.sessionId },
      });

      let finalState: IdeaProcessingState | undefined;

      for await (const event of stream) {
        // Event is a Record<nodeName, Partial<State>>
        const nodeNames = Object.keys(event);
        for (const nodeName of nodeNames) {
          const nodeOutput = event[nodeName];

          // Log span for each node execution
          this.langfuse.createSpan({
            traceId: trace?.id || `idea-refire-${options.sessionId}`,
            name: nodeName,
            input: nodeOutput,
            metadata: {
              sessionId: options.sessionId,
              node: nodeName,
              isRefire: true,
            },
          });

          // Emit streaming event
          this.events.emit('ideation:stream', {
            sessionId: options.sessionId,
            node: nodeName,
            output: nodeOutput,
            isRefire: true,
          });

          // Track final state
          finalState = { ...finalState, ...nodeOutput } as IdeaProcessingState;
        }
      }

      if (!finalState) {
        throw new Error('Refire flow completed without producing final state');
      }

      const endTime = new Date();

      // Update trace
      if (trace) {
        trace.update({
          output: {
            approved: finalState.approved,
            category: finalState.category,
            impact: finalState.impact,
            effort: finalState.effort,
            usedFastPath: finalState.usedFastPath,
          },
          metadata: {
            complexity: finalState.complexity,
            processingNotes: finalState.processingNotes,
            duration: endTime.getTime() - startTime.getTime(),
            isRefire: true,
          },
        });
      }

      // Update session with new state
      await this.updateSessionStatus(options.sessionId, 'completed', {
        state: finalState,
        result: {
          approved: finalState.approved,
          category: finalState.category,
          impact: finalState.impact,
          effort: finalState.effort,
        },
      });

      await this.langfuse.flush();
    } catch (error) {
      const endTime = new Date();

      // Log error to trace
      if (trace) {
        trace.update({
          output: {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          metadata: {
            duration: endTime.getTime() - startTime.getTime(),
            failed: true,
            isRefire: true,
          },
        });
      }

      await this.langfuse.flush();
      throw error;
    }
  }

  /**
   * Edit node - patch state at target node and re-execute
   */
  async editNode(options: EditNodeOptions): Promise<void> {
    const session = this.sessions.get(options.sessionId);
    if (!session) {
      throw new Error(`Session ${options.sessionId} not found`);
    }

    this.logger.info('Editing node', {
      sessionId: options.sessionId,
      nodeId: options.nodeId,
      patch: Object.keys(options.statePatch),
    });

    // Update session status
    await this.updateSessionStatus(options.sessionId, 'processing');

    // Execute edit flow asynchronously
    this.executeEditFlow(options).catch((error) => {
      this.logger.error('Edit flow failed', { sessionId: options.sessionId, error });
      this.updateSessionStatus(options.sessionId, 'failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  }

  /**
   * Execute edit flow - patches state and re-streams from target node
   */
  private async executeEditFlow(options: EditNodeOptions): Promise<void> {
    const startTime = new Date();
    const session = this.sessions.get(options.sessionId);

    if (!session) {
      throw new Error(`Session ${options.sessionId} not found`);
    }

    // Create Langfuse trace for edit
    const trace = this.langfuse.createTrace({
      id: `idea-edit-${options.sessionId}-${Date.now()}`,
      name: 'Idea Processing Edit',
      sessionId: options.sessionId,
      metadata: {
        nodeId: options.nodeId,
        originalSessionId: options.sessionId,
        patchFields: Object.keys(options.statePatch),
      },
      tags: ['idea-processing', 'edit', 'langgraph'],
    });

    try {
      // Get current state from checkpoint
      const checkpointConfig = {
        configurable: { thread_id: options.sessionId },
      };

      // Update the state with the patch before streaming
      // This effectively creates a new checkpoint branch
      await ideaProcessingGraph.updateState(checkpointConfig, options.statePatch);

      // Now stream from the patched state
      const stream = await ideaProcessingGraph.stream(null, {
        configurable: { thread_id: options.sessionId },
        streamMode: 'values',
      });

      let finalState: IdeaProcessingState | undefined;
      let foundTargetNode = false;

      for await (const event of stream) {
        // Event is a Record<nodeName, Partial<State>>
        const nodeNames = Object.keys(event);
        for (const nodeName of nodeNames) {
          // Skip nodes until we reach the target node
          if (!foundTargetNode && nodeName !== options.nodeId) {
            continue;
          }
          foundTargetNode = true;

          const nodeOutput = event[nodeName];

          // Log span for each node execution
          this.langfuse.createSpan({
            traceId: trace?.id || `idea-edit-${options.sessionId}`,
            name: nodeName,
            input: nodeOutput,
            metadata: {
              sessionId: options.sessionId,
              node: nodeName,
              isEdit: true,
            },
          });

          // Emit streaming event
          this.events.emit('ideation:stream', {
            sessionId: options.sessionId,
            node: nodeName,
            output: nodeOutput,
            isEdit: true,
          });

          // Track final state
          finalState = { ...finalState, ...nodeOutput } as IdeaProcessingState;
        }
      }

      if (!finalState) {
        throw new Error('Edit flow completed without producing final state');
      }

      const endTime = new Date();

      // Update trace
      if (trace) {
        trace.update({
          output: {
            approved: finalState.approved,
            category: finalState.category,
            impact: finalState.impact,
            effort: finalState.effort,
            usedFastPath: finalState.usedFastPath,
          },
          metadata: {
            complexity: finalState.complexity,
            processingNotes: finalState.processingNotes,
            duration: endTime.getTime() - startTime.getTime(),
            isEdit: true,
          },
        });
      }

      // Update session with new state
      await this.updateSessionStatus(options.sessionId, 'completed', {
        state: finalState,
        result: {
          approved: finalState.approved,
          category: finalState.category,
          impact: finalState.impact,
          effort: finalState.effort,
        },
      });

      await this.langfuse.flush();
    } catch (error) {
      const endTime = new Date();

      // Log error to trace
      if (trace) {
        trace.update({
          output: {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          metadata: {
            duration: endTime.getTime() - startTime.getTime(),
            failed: true,
            isEdit: true,
          },
        });
      }

      await this.langfuse.flush();
      throw error;
    }
  }
}
