/**
 * LinearSurface — ConversationSurface implementation for Linear
 *
 * Wraps LinearAgentService to implement the platform-agnostic ConversationSurface
 * interface. Linear is the primary platform, so this is the reference implementation
 * that other surfaces are modeled after.
 *
 * Linear-specific features:
 * - Agent Activities (thought, action, elicitation, response, error)
 * - Agent Plans (session-level step checklists)
 * - Documents API (persistent artifacts linked to projects)
 * - Select signal (structured choice presentation)
 * - 10-second acknowledgment requirement
 */

import type {
  ConversationSurface,
  SurfaceCapabilities,
  SurfaceChoiceOption,
  SurfaceDocument,
  SurfaceMessage,
  SurfacePlanStep,
} from '@automaker/types';
import type { LinearAgentService } from '../linear-agent-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('LinearSurface');

export class LinearSurface implements ConversationSurface {
  readonly platform = 'linear' as const;

  readonly capabilities: SurfaceCapabilities = {
    structuredChoices: true,
    documents: true,
    ephemeralProgress: true,
    plans: true,
    multiTurn: true,
    maxMessageLength: 0, // Linear has no practical limit for activities
  };

  /** Maps session IDs to Linear project IDs (for document creation) */
  private sessionProjectMap = new Map<string, string>();

  constructor(private agentService: LinearAgentService) {}

  /**
   * Associate a session with a Linear project (for document operations).
   */
  setSessionProject(sessionId: string, projectId: string): void {
    this.sessionProjectMap.set(sessionId, projectId);
  }

  // ─── Lifecycle Methods ───────────────────────────────────────

  async acknowledge(sessionId: string, message: string): Promise<void> {
    await this.agentService.acknowledge(sessionId, message);
  }

  async showProgress(sessionId: string, action: string, detail?: string): Promise<void> {
    await this.agentService.emitAction(sessionId, action, detail);
  }

  async askQuestion(
    sessionId: string,
    question: string,
    options?: SurfaceChoiceOption[]
  ): Promise<string> {
    const selectOptions = options?.map((o) => ({
      label: o.label,
      description: o.description,
      value: o.value,
    }));
    return this.agentService.askQuestion(sessionId, question, selectOptions);
  }

  async sendResponse(sessionId: string, body: string): Promise<string> {
    return this.agentService.sendResponse(sessionId, body);
  }

  async reportError(sessionId: string, error: string): Promise<string> {
    return this.agentService.reportError(sessionId, error);
  }

  // ─── Context Methods ─────────────────────────────────────────

  async getHistory(sessionId: string): Promise<SurfaceMessage[]> {
    const activities = await this.agentService.getConversationHistory(sessionId);

    return activities.map((activity) => {
      const content = activity.content;
      let type: SurfaceMessage['type'];
      let messageContent: string;
      const metadata: Record<string, unknown> = {};

      switch (content.type) {
        case 'thought':
          type = 'thought';
          messageContent = content.body;
          break;
        case 'action':
          type = 'action';
          messageContent = content.action;
          if ('parameter' in content && content.parameter) metadata.parameter = content.parameter;
          if ('result' in content && content.result) metadata.result = content.result;
          break;
        case 'elicitation':
          type = 'question';
          messageContent = content.body;
          break;
        case 'response':
          type = 'response';
          messageContent = content.body;
          break;
        case 'error':
          type = 'error';
          messageContent = content.body;
          break;
        default:
          type = 'message';
          messageContent = JSON.stringify(content);
      }

      return {
        id: activity.id,
        role: 'agent' as const,
        type,
        content: messageContent,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        timestamp: activity.createdAt,
      };
    });
  }

  // ─── Documents ───────────────────────────────────────────────

  async createDocument(
    sessionId: string,
    title: string,
    content: string
  ): Promise<SurfaceDocument> {
    const projectId = this.sessionProjectMap.get(sessionId);
    if (!projectId) {
      logger.warn(`No project ID mapped for session ${sessionId} — creating unlinked document`);
    }

    const result = await this.agentService.createProjectDocument(projectId || '', title, content);

    return {
      id: result.id,
      title: result.title,
      url: result.url,
    };
  }

  async updateDocument(documentId: string, content: string, title?: string): Promise<boolean> {
    return this.agentService.updateDocument(documentId, content, title);
  }

  async getDocument(documentId: string): Promise<SurfaceDocument | null> {
    const doc = await this.agentService.getDocument(documentId);
    if (!doc) return null;

    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      url: doc.url,
    };
  }

  // ─── Plans ───────────────────────────────────────────────────

  async updatePlan(sessionId: string, steps: SurfacePlanStep[]): Promise<void> {
    await this.agentService.updatePlan(
      sessionId,
      steps.map((s) => ({
        content: s.content,
        status: s.status,
      }))
    );
  }
}
