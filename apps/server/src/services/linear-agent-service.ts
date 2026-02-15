/**
 * Linear Agent Service — Agent Activity Protocol
 *
 * Communicates with Linear users via Agent Activities (not comments).
 * Supports the full activity lifecycle: thought → action → elicitation → response/error.
 * Manages session plans and multi-turn conversations.
 */

import { createLogger } from '@automaker/utils';
import {
  LinearMCPClient,
  type AgentActivityContent,
  type AgentActivitySignal,
  type AgentPlanStep,
  type CreateAgentActivityOptions,
} from './linear-mcp-client.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('LinearAgentService');

/**
 * Select option for elicitation signals
 */
export interface SelectOption {
  label: string;
  description?: string;
  value: string;
}

/**
 * Session context for tracking active conversations
 */
export interface ActiveSession {
  sessionId: string;
  issueId: string;
  issueIdentifier?: string;
  agentType: string;
  plan?: AgentPlanStep[];
  createdAt: string;
}

/**
 * LinearAgentService — Full Agent Activity Protocol implementation
 *
 * Replaces the old comment-based response system with proper Linear agent activities.
 * Each method maps directly to a Linear agent activity type.
 */
export class LinearAgentService {
  private client: LinearMCPClient | null = null;
  private activeSessions = new Map<string, ActiveSession>();

  constructor(
    private settingsService?: SettingsService,
    private projectPath?: string
  ) {
    if (settingsService && projectPath) {
      this.client = new LinearMCPClient(settingsService, projectPath);
    }
  }

  /**
   * Initialize or reconfigure the service
   */
  configure(settingsService: SettingsService, projectPath: string): void {
    this.settingsService = settingsService;
    this.projectPath = projectPath;
    this.client = new LinearMCPClient(settingsService, projectPath);
  }

  private getClient(): LinearMCPClient {
    if (!this.client) {
      throw new Error('LinearAgentService not configured — call configure() first');
    }
    return this.client;
  }

  // ─── Activity Methods ────────────────────────────────────────────

  /**
   * Acknowledge a session — MUST be called within 10s of session creation.
   * Emits a thought activity to prevent the session from being marked unresponsive.
   */
  async acknowledge(sessionId: string, thought: string): Promise<void> {
    await this.getClient().createAgentActivity({
      agentSessionId: sessionId,
      content: { type: 'thought', body: thought },
      ephemeral: true,
    });
    logger.debug(`Acknowledged session ${sessionId}`);
  }

  /**
   * Emit a thought (visible reasoning step).
   * Use ephemeral=true for transient thoughts that get replaced.
   */
  async emitThought(sessionId: string, thought: string, ephemeral = false): Promise<string> {
    const result = await this.getClient().createAgentActivity({
      agentSessionId: sessionId,
      content: { type: 'thought', body: thought },
      ephemeral,
    });
    return result.activityId;
  }

  /**
   * Emit an action (tool invocation).
   * Call without result first, then with result when done.
   */
  async emitAction(
    sessionId: string,
    action: string,
    parameter?: string,
    result?: string
  ): Promise<string> {
    const content: AgentActivityContent = { type: 'action', action };
    if (parameter) (content as { parameter?: string }).parameter = parameter;
    if (result) (content as { result?: string }).result = result;

    const res = await this.getClient().createAgentActivity({
      agentSessionId: sessionId,
      content,
      ephemeral: !result, // ephemeral while in-progress, persistent when done
    });
    return res.activityId;
  }

  /**
   * Ask the user a question. Optionally present selectable options.
   * Session automatically transitions to awaitingInput.
   * User response comes back as a 'prompted' webhook event.
   */
  async askQuestion(
    sessionId: string,
    question: string,
    options?: SelectOption[]
  ): Promise<string> {
    const activityOptions: CreateAgentActivityOptions = {
      agentSessionId: sessionId,
      content: { type: 'elicitation', body: question },
    };

    if (options && options.length > 0) {
      activityOptions.signal = 'select';
      activityOptions.signalMetadata = {
        options: options.map((o) => ({
          label: o.label,
          description: o.description,
          value: o.value,
        })),
      };
    }

    const result = await this.getClient().createAgentActivity(activityOptions);
    logger.info(`Asked question on session ${sessionId}: ${question.substring(0, 80)}`);
    return result.activityId;
  }

  /**
   * Send a final response. Session automatically transitions to complete.
   */
  async sendResponse(sessionId: string, body: string): Promise<string> {
    const result = await this.getClient().createAgentActivity({
      agentSessionId: sessionId,
      content: { type: 'response', body },
    });
    logger.info(`Sent response on session ${sessionId}`);
    this.activeSessions.delete(sessionId);
    return result.activityId;
  }

  /**
   * Report an error. Session automatically transitions to error state.
   */
  async reportError(sessionId: string, error: string): Promise<string> {
    const result = await this.getClient().createAgentActivity({
      agentSessionId: sessionId,
      content: { type: 'error', body: error },
    });
    logger.error(`Reported error on session ${sessionId}: ${error}`);
    this.activeSessions.delete(sessionId);
    return result.activityId;
  }

  // ─── Plan Management ─────────────────────────────────────────────

  /**
   * Set or update the plan for a session.
   * Plans must be replaced in their entirety.
   */
  async updatePlan(sessionId: string, steps: AgentPlanStep[]): Promise<void> {
    await this.getClient().updateAgentSession({
      agentSessionId: sessionId,
      plan: steps,
    });

    // Track locally
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.plan = steps;
    }

    logger.debug(`Updated plan for session ${sessionId}: ${steps.length} steps`);
  }

  // ─── Session Management ──────────────────────────────────────────

  /**
   * Create a proactive session on an issue (without being @mentioned).
   */
  async createSession(issueId: string, issueIdentifier?: string): Promise<string> {
    const client = this.getClient();
    const appUserId = await client.getAppUserId();

    const sessionId = await client.createAgentSession({
      issueId,
      appUserId,
    });

    this.activeSessions.set(sessionId, {
      sessionId,
      issueId,
      issueIdentifier,
      agentType: 'ava',
      createdAt: new Date().toISOString(),
    });

    logger.info(`Created proactive session ${sessionId} on issue ${issueIdentifier || issueId}`);
    return sessionId;
  }

  /**
   * Track an externally-created session (from webhook).
   */
  trackSession(session: ActiveSession): void {
    this.activeSessions.set(session.sessionId, session);
  }

  /**
   * Get an active session by ID.
   */
  getSession(sessionId: string): ActiveSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get conversation history for a session (for multi-turn context reconstruction).
   * Per Linear best practices: read from activities, not comments.
   */
  async getConversationHistory(sessionId: string): Promise<
    Array<{
      id: string;
      content: AgentActivityContent;
      createdAt: string;
      signal?: AgentActivitySignal;
    }>
  > {
    return this.getClient().listAgentActivities(sessionId);
  }

  // ─── Document Operations ─────────────────────────────────────────

  /**
   * Create a document linked to a project.
   */
  async createProjectDocument(
    projectId: string,
    title: string,
    content: string
  ): Promise<{ id: string; title: string; url?: string }> {
    return this.getClient().createDocument({ title, content, projectId });
  }

  /**
   * Update an existing document's content.
   */
  async updateDocument(documentId: string, content: string, title?: string): Promise<boolean> {
    const opts: { content: string; title?: string } = { content };
    if (title) opts.title = title;
    return this.getClient().updateDocument(documentId, opts);
  }

  /**
   * Get a document's content.
   */
  async getDocument(documentId: string) {
    return this.getClient().getDocument(documentId);
  }

  /**
   * List all documents for a project.
   */
  async listProjectDocuments(projectId: string) {
    return this.getClient().listProjectDocuments(projectId);
  }
}
