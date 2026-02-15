/**
 * Linear Agent Router — Activity-Based Agent Interaction
 *
 * Routes Linear agent sessions to appropriate agents and communicates
 * via Agent Activities (not comments). Supports multi-turn conversations
 * via prompted webhook events.
 *
 * Features:
 * - Intelligent multi-tier routing (explicit → labels → AI classifier → team → default)
 * - Rich issue context (relations, project, parent/children, priority)
 * - Priority-based model selection (urgent → Opus, normal → Sonnet, low → Haiku)
 * - Plan display in Linear's session UI
 * - Streaming thoughts during processing
 * - Full conversation history reconstruction for multi-turn
 *
 * Flow:
 *   1. Webhook fires (created/prompted) → event emitted
 *   2. Router acknowledges within 10s (thought activity)
 *   3. Intelligent routing determines agent role
 *   4. Agent processes with codebase tools and responds via activities
 *   5. If elicitation sent → session awaits input → user responds → prompted webhook → loop
 */

import { createLogger } from '@automaker/utils';
import type { AgentRole } from '@automaker/types';
import type { EventEmitter } from '../lib/events.js';
import type { RoleRegistryService } from './role-registry-service.js';
import type { LinearAgentService } from './linear-agent-service.js';
import type { SettingsService } from './settings-service.js';
import { simpleQuery } from '../providers/simple-query-service.js';
import { classifyFeature } from './feature-classifier.js';

const logger = createLogger('LinearAgentRouter');

/**
 * Inbound event from webhook handler
 */
export interface LinearSessionEvent {
  sessionId: string;
  issueId: string;
  issueIdentifier?: string;
  agentType: string;
  teamId?: string;
  trigger?: string;
  /** The user's message (for prompted events) */
  prompt?: string;
  /** Full promptContext XML from Linear (for created events) */
  promptContext?: string;
}

/**
 * Maps Linear label names (lowercase) to agent roles
 */
const LABEL_TO_ROLE: Record<string, AgentRole> = {
  frontend: 'frontend-engineer',
  'frontend-engineer': 'frontend-engineer',
  ui: 'frontend-engineer',
  react: 'frontend-engineer',
  backend: 'backend-engineer',
  'backend-engineer': 'backend-engineer',
  api: 'backend-engineer',
  server: 'backend-engineer',
  infrastructure: 'devops-engineer',
  'devops-engineer': 'devops-engineer',
  devops: 'devops-engineer',
  'ci/cd': 'devops-engineer',
  deployment: 'devops-engineer',
  marketing: 'gtm-specialist',
  'gtm-specialist': 'gtm-specialist',
  gtm: 'gtm-specialist',
  content: 'gtm-specialist',
};

/**
 * Maps Linear team names (lowercase) to default agent roles
 */
const DEFAULT_TEAM_ROLE_MAP: Record<string, AgentRole> = {
  engineering: 'backend-engineer',
  frontend: 'frontend-engineer',
  infrastructure: 'devops-engineer',
  devops: 'devops-engineer',
  marketing: 'gtm-specialist',
  growth: 'gtm-specialist',
};

/**
 * Maps Linear priority levels to Claude models.
 * Urgent/High get Opus for maximum quality.
 */
const PRIORITY_MODEL_MAP: Record<number, string> = {
  1: 'claude-opus-4-5-20251101', // Urgent
  2: 'claude-opus-4-5-20251101', // High
  3: 'claude-sonnet-4-5-20250929', // Medium (default)
  4: 'claude-haiku-4-5-20251001', // Low
  0: 'claude-sonnet-4-5-20250929', // No priority
};

export interface RoutingDecision {
  resolvedAgent: string;
  tier: 'label' | 'classifier' | 'team-mapping' | 'explicit' | 'default';
  role?: AgentRole;
  confidence?: number;
  reasoning: string;
}

/**
 * Enriched issue context fetched from Linear
 */
interface IssueContext {
  id: string;
  identifier: string;
  title: string;
  description: string;
  state: string;
  team: string;
  labels: string[];
  priority: number;
  priorityLabel: string;
  estimate?: number;
  dueDate?: string;
  comments: Array<{ body: string; author: string; createdAt: string }>;
  /** Parent issue (if this is a sub-issue) */
  parent?: { id: string; identifier: string; title: string };
  /** Child sub-issues */
  children: Array<{ identifier: string; title: string; state: string }>;
  /** Related issues (blocking, blocked by, related) */
  relations: Array<{ type: string; identifier: string; title: string; state: string }>;
  /** Project this issue belongs to */
  project?: { id: string; name: string; state: string };
}

/**
 * Session metadata for conversation tracking
 */
interface SessionMetadata {
  routing: RoutingDecision;
  model: string;
  issueContext: IssueContext;
  turnCount: number;
}

export class LinearAgentRouter {
  private events: EventEmitter;
  private roleRegistry: RoleRegistryService;
  private agentService: LinearAgentService;
  private settingsService: SettingsService;
  private projectPath: string;
  private isStarted = false;
  private unsubscribe?: () => void;

  /** Track metadata per session for richer multi-turn context */
  private sessionMeta = new Map<string, SessionMetadata>();

  constructor(
    events: EventEmitter,
    roleRegistry: RoleRegistryService,
    agentService: LinearAgentService,
    settingsService: SettingsService,
    projectPath: string
  ) {
    this.events = events;
    this.roleRegistry = roleRegistry;
    this.agentService = agentService;
    this.settingsService = settingsService;
    this.projectPath = projectPath;
  }

  start(): void {
    if (this.isStarted) return;

    logger.info('Starting LinearAgentRouter (activity-based)');
    this.unsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'linear:agent-session:created') {
        void this.handleSessionCreated(payload as LinearSessionEvent);
      } else if (type === 'linear:agent-session:prompted') {
        void this.handleSessionPrompted(payload as LinearSessionEvent);
      }
    });
    this.isStarted = true;
  }

  stop(): void {
    if (!this.isStarted) return;
    logger.info('Stopping LinearAgentRouter');
    this.unsubscribe?.();
    this.isStarted = false;
  }

  /**
   * Handle new session — @mention or delegation.
   * Must acknowledge within 10 seconds.
   */
  private async handleSessionCreated(event: LinearSessionEvent): Promise<void> {
    const { sessionId, issueId, issueIdentifier, agentType } = event;

    logger.info(
      `New session ${sessionId} for ${issueIdentifier || issueId} (trigger: ${event.trigger})`
    );

    try {
      // Step 1: Acknowledge immediately (< 10s requirement)
      await this.agentService.acknowledge(sessionId, 'Analyzing this issue...');

      // Step 2: Track the session
      this.agentService.trackSession({
        sessionId,
        issueId,
        issueIdentifier,
        agentType,
        createdAt: new Date().toISOString(),
      });

      // Step 3: Set plan — show progress steps to the user
      await this.agentService.updatePlan(sessionId, [
        { content: 'Fetch issue context & relations', status: 'inProgress' },
        { content: 'Route to specialist agent', status: 'pending' },
        { content: 'Research codebase', status: 'pending' },
        { content: 'Respond', status: 'pending' },
      ]);

      // Step 4: Fetch enriched issue context
      const issueContext = await this.fetchIssueContext(issueId);
      await this.agentService.updatePlan(sessionId, [
        { content: 'Fetch issue context & relations', status: 'completed' },
        { content: 'Route to specialist agent', status: 'inProgress' },
        { content: 'Research codebase', status: 'pending' },
        { content: 'Respond', status: 'pending' },
      ]);

      // Step 5: Intelligent routing
      const routing = await this.intelligentRoute(agentType, issueContext);
      const model = this.selectModel(issueContext.priority);

      logger.info(
        `Routing: agent="${routing.resolvedAgent}" tier=${routing.tier} model=${model} ` +
          `priority=${issueContext.priorityLabel} reason="${routing.reasoning}"`
      );

      await this.agentService.emitThought(
        sessionId,
        `Routing to **${routing.resolvedAgent}** (${routing.tier}: ${routing.reasoning})`,
        true
      );

      // Step 6: Track session metadata
      this.sessionMeta.set(sessionId, {
        routing,
        model,
        issueContext,
        turnCount: 1,
      });

      await this.agentService.updatePlan(sessionId, [
        { content: 'Fetch issue context & relations', status: 'completed' },
        { content: 'Route to specialist agent', status: 'completed' },
        { content: 'Research codebase', status: 'inProgress' },
        { content: 'Respond', status: 'pending' },
      ]);

      // Step 7: Show research action
      await this.agentService.emitAction(sessionId, 'Researching', issueContext.title);

      // Step 8: Process with agent
      const systemPrompt = this.buildSystemPrompt(routing.resolvedAgent, issueContext);
      const userPrompt = event.promptContext || this.buildUserPrompt(issueContext);

      const result = await simpleQuery({
        prompt: userPrompt,
        systemPrompt,
        model,
        cwd: this.projectPath,
        maxTurns: 8,
        allowedTools: ['Read', 'Glob', 'Grep'],
      });

      // Step 9: Complete plan and send response
      await this.agentService.updatePlan(sessionId, [
        { content: 'Fetch issue context & relations', status: 'completed' },
        { content: 'Route to specialist agent', status: 'completed' },
        { content: 'Research codebase', status: 'completed' },
        { content: 'Respond', status: 'completed' },
      ]);

      await this.agentService.sendResponse(sessionId, result.text);
    } catch (error) {
      logger.error(`Error processing session ${sessionId}:`, error);
      await this.agentService
        .reportError(
          sessionId,
          `Failed to process: ${error instanceof Error ? error.message : String(error)}`
        )
        .catch((e) => logger.error('Failed to report error to Linear:', e));
    }
  }

  /**
   * Handle user follow-up message in an existing session.
   * Reconstructs full conversation context for multi-turn continuity.
   */
  private async handleSessionPrompted(event: LinearSessionEvent): Promise<void> {
    const { sessionId, issueId, prompt } = event;

    logger.info(`Follow-up on session ${sessionId}: ${prompt?.substring(0, 80)}`);

    try {
      // Acknowledge the follow-up
      await this.agentService.acknowledge(sessionId, 'Processing your response...');

      // Get conversation history for context
      const history = await this.agentService.getConversationHistory(sessionId);

      // Reconstruct conversation context
      const conversationContext = history
        .map((activity) => {
          const content = activity.content;
          if (content.type === 'thought') return `[Agent thinking]: ${content.body}`;
          if (content.type === 'response') return `[Agent]: ${content.body}`;
          if (content.type === 'elicitation') return `[Agent asked]: ${content.body}`;
          if (content.type === 'error') return `[Agent error]: ${content.body}`;
          if (content.type === 'action')
            return `[Agent action]: ${content.action} ${content.parameter || ''}`;
          return '';
        })
        .filter(Boolean)
        .join('\n\n');

      // Get or refresh metadata
      let meta = this.sessionMeta.get(sessionId);
      const issueContext = await this.fetchIssueContext(issueId);

      if (!meta) {
        // Session metadata lost (e.g., server restart) — reconstruct
        const session = this.agentService.getSession(sessionId);
        const agentType = session?.agentType || 'ava';
        const routing = await this.intelligentRoute(agentType, issueContext);
        meta = {
          routing,
          model: this.selectModel(issueContext.priority),
          issueContext,
          turnCount: 1,
        };
        this.sessionMeta.set(sessionId, meta);
      }

      meta.turnCount += 1;
      meta.issueContext = issueContext; // Refresh with latest state

      // Build context-rich prompt
      const systemPrompt = this.buildSystemPrompt(meta.routing.resolvedAgent, issueContext);
      const userPrompt = this.buildFollowUpPrompt(conversationContext, prompt || '', issueContext);

      await this.agentService.emitAction(
        sessionId,
        'Processing follow-up',
        `Turn ${meta.turnCount}`
      );

      const result = await simpleQuery({
        prompt: userPrompt,
        systemPrompt,
        model: meta.model,
        cwd: this.projectPath,
        maxTurns: 8,
        allowedTools: ['Read', 'Glob', 'Grep'],
      });

      await this.agentService.sendResponse(sessionId, result.text);
    } catch (error) {
      logger.error(`Error processing follow-up on session ${sessionId}:`, error);
      await this.agentService
        .reportError(
          sessionId,
          `Failed to process follow-up: ${error instanceof Error ? error.message : String(error)}`
        )
        .catch((e) => logger.error('Failed to report error to Linear:', e));
    }
  }

  // ─── Routing ──────────────────────────────────────────────────────

  async intelligentRoute(agentType: string, issueContext: IssueContext): Promise<RoutingDecision> {
    // Tier 0: Explicit registered agent
    const explicitTemplate = this.roleRegistry.resolve(agentType);
    if (explicitTemplate?.systemPrompt) {
      return {
        resolvedAgent: agentType,
        tier: 'explicit',
        reasoning: `Explicit agent "${agentType}" is registered`,
      };
    }

    // Tier 1: Label matching
    for (const label of issueContext.labels) {
      const role = LABEL_TO_ROLE[label.toLowerCase()];
      if (role) {
        return {
          resolvedAgent: this.resolveAgentForRole(role),
          tier: 'label',
          role,
          confidence: 1.0,
          reasoning: `Label "${label}" → role "${role}"`,
        };
      }
    }

    // Tier 2: AI classifier
    try {
      const classification = await classifyFeature(
        issueContext.title,
        issueContext.description,
        this.projectPath
      );
      if (classification.confidence >= 0.6) {
        return {
          resolvedAgent: this.resolveAgentForRole(classification.role),
          tier: 'classifier',
          role: classification.role,
          confidence: classification.confidence,
          reasoning: classification.reasoning,
        };
      }
    } catch (error) {
      logger.warn('AI classifier failed:', error);
    }

    // Tier 3: Team mapping
    const teamRole = DEFAULT_TEAM_ROLE_MAP[issueContext.team.toLowerCase()];
    if (teamRole) {
      return {
        resolvedAgent: this.resolveAgentForRole(teamRole),
        tier: 'team-mapping',
        role: teamRole,
        reasoning: `Team "${issueContext.team}" → role "${teamRole}"`,
      };
    }

    // Fallback
    return {
      resolvedAgent: agentType,
      tier: 'default',
      reasoning: `No routing signals; using "${agentType}"`,
    };
  }

  private resolveAgentForRole(role: AgentRole): string {
    const template = this.roleRegistry.resolve(role);
    return template ? template.name : role;
  }

  /**
   * Select model based on Linear issue priority.
   * Higher priority issues get more powerful models.
   */
  private selectModel(priority: number): string {
    return PRIORITY_MODEL_MAP[priority] || 'claude-sonnet-4-5-20250929';
  }

  // ─── Context Building ─────────────────────────────────────────────

  /**
   * Fetch enriched issue context from Linear.
   * Includes relations, parent/children, project, and priority.
   */
  private async fetchIssueContext(issueId: string): Promise<IssueContext> {
    const { LinearMCPClient } = await import('./linear-mcp-client.js');
    const client = new LinearMCPClient(this.settingsService, this.projectPath);

    const query = `
      query GetIssueEnriched($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          priority
          priorityLabel
          estimate
          dueDate
          state { name }
          team { name }
          labels { nodes { name } }
          comments(last: 10) { nodes { body user { name } createdAt } }
          parent { id identifier title }
          children { nodes { identifier title state { name } } }
          relations {
            nodes {
              type
              relatedIssue { identifier title state { name } }
            }
          }
          project { id name state }
        }
      }
    `;

    interface IssueResponse {
      issue: {
        id: string;
        identifier: string;
        title: string;
        description: string | null;
        priority: number;
        priorityLabel: string;
        estimate: number | null;
        dueDate: string | null;
        state: { name: string };
        team: { name: string };
        labels: { nodes: Array<{ name: string }> };
        comments: { nodes: Array<{ body: string; user: { name: string }; createdAt: string }> };
        parent: { id: string; identifier: string; title: string } | null;
        children: { nodes: Array<{ identifier: string; title: string; state: { name: string } }> };
        relations: {
          nodes: Array<{
            type: string;
            relatedIssue: { identifier: string; title: string; state: { name: string } };
          }>;
        };
        project: { id: string; name: string; state: string } | null;
      };
    }

    const data = await client.executeGraphQL<IssueResponse>(query, { id: issueId });
    const issue = data.issue;

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || '',
      state: issue.state.name,
      team: issue.team.name,
      priority: issue.priority,
      priorityLabel: issue.priorityLabel,
      estimate: issue.estimate ?? undefined,
      dueDate: issue.dueDate ?? undefined,
      labels: issue.labels.nodes.map((l) => l.name),
      comments: issue.comments.nodes.map((c) => ({
        body: c.body,
        author: c.user.name,
        createdAt: c.createdAt,
      })),
      parent: issue.parent
        ? {
            id: issue.parent.id,
            identifier: issue.parent.identifier,
            title: issue.parent.title,
          }
        : undefined,
      children: issue.children.nodes.map((c) => ({
        identifier: c.identifier,
        title: c.title,
        state: c.state.name,
      })),
      relations: issue.relations.nodes.map((r) => ({
        type: r.type,
        identifier: r.relatedIssue.identifier,
        title: r.relatedIssue.title,
        state: r.relatedIssue.state.name,
      })),
      project: issue.project
        ? {
            id: issue.project.id,
            name: issue.project.name,
            state: issue.project.state,
          }
        : undefined,
    };
  }

  private buildSystemPrompt(agentType: string, issueContext: IssueContext): string {
    const template = this.roleRegistry.resolve(agentType);
    const basePrompt = template?.systemPrompt;
    if (!basePrompt) {
      throw new Error(`No system prompt for agent "${agentType}"`);
    }

    // Append issue awareness context
    const contextSuffix = `

## Current Issue Context

You are responding to a Linear issue interaction. The user has @mentioned you on issue **${issueContext.identifier}**.

**Priority:** ${issueContext.priorityLabel} | **Status:** ${issueContext.state} | **Team:** ${issueContext.team}
${issueContext.project ? `**Project:** ${issueContext.project.name} (${issueContext.project.state})` : ''}
${issueContext.parent ? `**Parent Issue:** ${issueContext.parent.identifier} — ${issueContext.parent.title}` : ''}

When responding:
- Be concise and actionable — this is a work issue, not a chat
- Reference specific files, functions, or code paths when relevant
- If you can answer from codebase analysis, do so directly
- If the issue needs implementation, outline a clear plan with specific files to modify
- Consider the issue's priority level when determining response depth`;

    return basePrompt + contextSuffix;
  }

  private buildUserPrompt(issueContext: IssueContext): string {
    const sections: string[] = [];

    // Header
    sections.push(`# Linear Issue: ${issueContext.identifier}`);
    sections.push(`## ${issueContext.title}`);

    // Description
    if (issueContext.description) {
      sections.push(issueContext.description);
    }

    // Metadata
    const meta = [
      `**Status:** ${issueContext.state}`,
      `**Priority:** ${issueContext.priorityLabel}`,
      `**Team:** ${issueContext.team}`,
    ];
    if (issueContext.labels.length) meta.push(`**Labels:** ${issueContext.labels.join(', ')}`);
    if (issueContext.estimate) meta.push(`**Estimate:** ${issueContext.estimate} points`);
    if (issueContext.dueDate) meta.push(`**Due:** ${issueContext.dueDate}`);
    sections.push(meta.join(' | '));

    // Project
    if (issueContext.project) {
      sections.push(`\n**Project:** ${issueContext.project.name} (${issueContext.project.state})`);
    }

    // Parent issue
    if (issueContext.parent) {
      sections.push(
        `\n**Parent Issue:** ${issueContext.parent.identifier} — ${issueContext.parent.title}`
      );
    }

    // Sub-issues
    if (issueContext.children.length > 0) {
      sections.push('\n## Sub-Issues');
      for (const child of issueContext.children) {
        sections.push(`- ${child.identifier}: ${child.title} (${child.state})`);
      }
    }

    // Relations
    if (issueContext.relations.length > 0) {
      sections.push('\n## Related Issues');
      for (const rel of issueContext.relations) {
        sections.push(`- ${rel.type}: ${rel.identifier} — ${rel.title} (${rel.state})`);
      }
    }

    // Recent comments
    if (issueContext.comments.length > 0) {
      sections.push('\n## Recent Comments');
      for (const c of issueContext.comments.slice(-5)) {
        sections.push(`\n**${c.author}** (${c.createdAt}):\n${c.body}`);
      }
    }

    return sections.join('\n');
  }

  /**
   * Build a follow-up prompt with full conversation context
   */
  private buildFollowUpPrompt(
    conversationContext: string,
    newMessage: string,
    issueContext: IssueContext
  ): string {
    const sections: string[] = [];

    sections.push('# Conversation History');
    sections.push(conversationContext);

    sections.push('\n# Current Issue State');
    sections.push(`**${issueContext.identifier}:** ${issueContext.title}`);
    sections.push(
      `**Status:** ${issueContext.state} | **Priority:** ${issueContext.priorityLabel}`
    );

    // Include any state changes since last turn
    if (issueContext.children.length > 0) {
      const stateSummary = issueContext.children
        .map((c) => `${c.identifier}: ${c.state}`)
        .join(', ');
      sections.push(`**Sub-issues:** ${stateSummary}`);
    }

    sections.push('\n# New Message from User');
    sections.push(newMessage);

    sections.push(
      "\n---\n\nRespond to the user's latest message, taking the full conversation context into account."
    );

    return sections.join('\n');
  }
}
