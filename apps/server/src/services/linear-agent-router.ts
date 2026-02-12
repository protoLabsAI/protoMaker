/**
 * Linear Agent Router
 *
 * Listens to Linear agent session events and routes them to appropriate agents.
 * Fetches issue context via GraphQL, builds system prompt from RoleRegistry,
 * calls simpleQuery, and posts response back to Linear.
 *
 * Follows the same pattern as AgentDiscordRouter.
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { RoleRegistryService } from './role-registry-service.js';
import type { LinearAgentService } from './linear-agent-service.js';
import type { SettingsService } from './settings-service.js';
import { simpleQuery } from '../providers/simple-query-service.js';

const logger = createLogger('LinearAgentRouter');

interface LinearAgentSessionEvent {
  sessionId: string;
  issueId: string;
  issueIdentifier?: string;
  agentType: 'jon' | 'ava';
  teamId?: string;
  trigger?: string;
}

/**
 * LinearAgentRouter - Routes Linear agent sessions to appropriate agents
 */
export class LinearAgentRouter {
  private events: EventEmitter;
  private roleRegistry: RoleRegistryService;
  private linearAgentService: LinearAgentService;
  private settingsService: SettingsService;
  private projectPath: string;
  private isStarted = false;

  constructor(
    events: EventEmitter,
    roleRegistry: RoleRegistryService,
    linearAgentService: LinearAgentService,
    settingsService: SettingsService,
    projectPath: string
  ) {
    this.events = events;
    this.roleRegistry = roleRegistry;
    this.linearAgentService = linearAgentService;
    this.settingsService = settingsService;
    this.projectPath = projectPath;
  }

  private unsubscribe?: () => void;

  /**
   * Start listening to Linear agent session events
   */
  start(): void {
    if (this.isStarted) {
      logger.warn('LinearAgentRouter already started');
      return;
    }

    logger.info('Starting LinearAgentRouter');
    this.unsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'linear:agent-session:created') {
        void this.handleSessionCreated(payload as LinearAgentSessionEvent);
      } else if (type === 'linear:agent-session:updated') {
        void this.handleSessionUpdated(payload as LinearAgentSessionEvent);
      }
    });
    this.isStarted = true;
  }

  /**
   * Stop listening to events
   */
  stop(): void {
    if (!this.isStarted) {
      return;
    }

    logger.info('Stopping LinearAgentRouter');
    this.unsubscribe?.();
    this.isStarted = false;
  }

  /**
   * Handle agent session created event
   */
  private async handleSessionCreated(event: LinearAgentSessionEvent): Promise<void> {
    const { sessionId, issueId, issueIdentifier, agentType } = event;

    logger.info(
      `Processing Linear agent session ${sessionId} for issue ${issueIdentifier || issueId} (agent: ${agentType})`
    );

    try {
      // Fetch issue context via GraphQL
      const issueContext = await this.fetchIssueContext(issueId);

      // Build system prompt from RoleRegistry
      const systemPrompt = this.buildSystemPrompt(agentType, issueContext);

      // Build user prompt from issue
      const userPrompt = this.buildUserPrompt(issueContext);

      // Call simpleQuery
      const result = await simpleQuery({
        prompt: userPrompt,
        systemPrompt,
        model: 'claude-sonnet-4-5-20250929',
        cwd: this.projectPath,
        maxTurns: 5,
        allowedTools: ['Read', 'Glob', 'Grep'],
      });

      // Post response back to Linear
      await this.linearAgentService.processAgentResponse({
        linearIssueId: issueId,
        linearIssueIdentifier: issueIdentifier,
        agentType,
        response: result.text,
      });

      logger.info(
        `Successfully processed Linear agent session ${sessionId} for issue ${issueIdentifier || issueId}`
      );
    } catch (error) {
      logger.error(`Error processing Linear agent session ${sessionId}:`, error);

      // Post error response to Linear
      await this.linearAgentService
        .processAgentResponse({
          linearIssueId: issueId,
          linearIssueIdentifier: issueIdentifier,
          agentType,
          response: `Error processing request: ${error instanceof Error ? error.message : String(error)}`,
        })
        .catch((postError) => {
          logger.error(`Failed to post error response to Linear:`, postError);
        });
    }
  }

  /**
   * Handle agent session updated event
   */
  private async handleSessionUpdated(event: LinearAgentSessionEvent): Promise<void> {
    logger.debug(`Linear agent session updated: ${event.sessionId}`);
    // For now, we only handle session creation
    // Future: handle session updates for multi-turn conversations
  }

  /**
   * Fetch issue context from Linear via GraphQL
   */
  private async fetchIssueContext(issueId: string): Promise<IssueContext> {
    const settings = await this.settingsService.getProjectSettings(this.projectPath);
    const linearAccessToken = settings.integrations?.linear?.agentToken;

    if (!linearAccessToken) {
      throw new Error('No Linear OAuth token found in settings');
    }

    // GraphQL query to fetch issue details
    const query = `
      query GetIssue($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          state {
            name
          }
          team {
            name
          }
          comments {
            nodes {
              body
              user {
                name
              }
              createdAt
            }
          }
          labels {
            nodes {
              name
            }
          }
        }
      }
    `;

    const variables = { id: issueId };

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${linearAccessToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as {
      data?: { issue: LinearIssue };
      errors?: Array<{ message: string }>;
    };

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    if (!result.data?.issue) {
      throw new Error('Issue not found in Linear response');
    }

    return this.transformIssueData(result.data.issue);
  }

  /**
   * Transform Linear GraphQL response into IssueContext
   */
  private transformIssueData(issue: LinearIssue): IssueContext {
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || '',
      state: issue.state.name,
      team: issue.team.name,
      labels: issue.labels.nodes.map((l) => l.name),
      comments: issue.comments.nodes.map((c) => ({
        body: c.body,
        author: c.user.name,
        createdAt: c.createdAt,
      })),
    };
  }

  /**
   * Build system prompt from RoleRegistry template
   */
  private buildSystemPrompt(agentType: string, issueContext: IssueContext): string {
    // Try to get template from registry
    const template = this.roleRegistry.get(agentType);

    if (template?.systemPrompt) {
      return template.systemPrompt;
    }

    // Fallback to hardcoded prompts
    if (agentType === 'jon') {
      return `You are a Go-To-Market (GTM) agent for Automaker.

Your role is to help with product positioning, messaging, documentation, and customer-facing content.

When responding to Linear issues, provide actionable insights and recommendations based on the issue context.`;
    }

    // Default Ava agent prompt
    return `You are Ava, an AI development assistant for Automaker.

Your role is to help with technical questions, code analysis, and development tasks.

When responding to Linear issues, provide clear technical guidance and code examples when relevant.`;
  }

  /**
   * Build user prompt from issue context
   */
  private buildUserPrompt(issueContext: IssueContext): string {
    let prompt = `# Linear Issue: ${issueContext.identifier}

## Title
${issueContext.title}

## Description
${issueContext.description}

## Status
${issueContext.state}

## Team
${issueContext.team}

## Labels
${issueContext.labels.join(', ') || 'None'}`;

    // Add recent comments if any
    if (issueContext.comments.length > 0) {
      prompt += '\n\n## Recent Comments\n';
      for (const comment of issueContext.comments.slice(-5)) {
        // Last 5 comments
        prompt += `\n**${comment.author}** (${comment.createdAt}):\n${comment.body}\n`;
      }
    }

    prompt += '\n\n---\n\nPlease analyze this issue and provide a helpful response.';

    return prompt;
  }
}

/**
 * Linear GraphQL response types
 */
interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: { name: string };
  team: { name: string };
  comments: {
    nodes: Array<{
      body: string;
      user: { name: string };
      createdAt: string;
    }>;
  };
  labels: {
    nodes: Array<{ name: string }>;
  };
}

/**
 * Transformed issue context for agent
 */
interface IssueContext {
  id: string;
  identifier: string;
  title: string;
  description: string;
  state: string;
  team: string;
  labels: string[];
  comments: Array<{
    body: string;
    author: string;
    createdAt: string;
  }>;
}
