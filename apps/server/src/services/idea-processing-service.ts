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

interface IdeaSession {
  id: string;
  idea: string;
  status: 'processing' | 'awaiting_approval' | 'completed' | 'failed';
  state?: unknown; // LangGraph state snapshot for resume
  result?: unknown; // Final result when completed
  error?: string;
  createdAt: string;
  updatedAt: string;
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

export class IdeaProcessingService {
  private sessions = new Map<string, IdeaSession>();
  private stateDir: string;
  private events: EventEmitter;
  private logger = createLogger('IdeaProcessingService');

  constructor(dataDir: string, events: EventEmitter) {
    this.stateDir = path.join(dataDir, 'idea-sessions');
    this.events = events;
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

    // Emit event for session created
    this.events.emit('ideation:session-started', {
      sessionId,
      idea: options.idea,
    });

    // TODO: Execute LangGraph flow when available
    // For now, just set to awaiting_approval to simulate HITL checkpoint
    this.logger.info('Idea processing started', { sessionId, idea: options.idea });

    // Simulate processing by setting to awaiting_approval
    setTimeout(() => {
      this.updateSessionStatus(sessionId, 'awaiting_approval', {
        state: { idea: options.idea, checkpoint: 'pre-approval' },
      });
    }, 100);

    return sessionId;
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
      // Update status to processing and continue flow
      session.status = 'processing';
      session.updatedAt = new Date().toISOString();
      await this.saveSession(session);

      this.logger.info('Idea session approved, resuming', { sessionId: options.sessionId });

      // TODO: Resume LangGraph flow execution
      // For now, simulate completion
      setTimeout(() => {
        this.updateSessionStatus(options.sessionId, 'completed', {
          result: { success: true, idea: session.idea },
        });
      }, 100);
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
}
