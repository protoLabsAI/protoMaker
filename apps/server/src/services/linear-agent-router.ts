/**
 * Linear Agent Router
 *
 * Listens to Linear agent session events and routes them to appropriate agents.
 * Uses 3-tier intelligent routing: Linear labels → AI classifier → team mapping.
 * Fetches issue context via GraphQL, builds system prompt from RoleRegistry,
 * calls simpleQuery, and posts response back to Linear.
 *
 * Follows the same pattern as AgentDiscordRouter.
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

interface LinearAgentSessionEvent {
  sessionId: string;
  issueId: string;
  issueIdentifier?: string;
  agentType: 'jon' | 'ava';
  teamId?: string;
  trigger?: string;
}

/**
 * Maps Linear label names (lowercase) to agent roles.
 * Labels on a Linear issue take highest routing priority.
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
 * Maps Linear team names (lowercase) to default agent roles.
 * Used as tier-3 fallback when labels and AI classifier don't resolve.
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
 * Routing decision with reasoning for observability
 */
export interface RoutingDecision {
  resolvedAgent: string;
  tier: 'label' | 'classifier' | 'team-mapping' | 'explicit' | 'default';
  role?: AgentRole;
  confidence?: number;
  reasoning: string;
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

      // Intelligent routing: determine the best agent for this issue
      const routing = await this.intelligentRoute(agentType, issueContext);

      logger.info(
        `Routing decision for ${issueIdentifier || issueId}: agent="${routing.resolvedAgent}" tier=${routing.tier} confidence=${routing.confidence ?? 'n/a'} reason="${routing.reasoning}"`
      );

      // Build system prompt from resolved agent
      const systemPrompt = this.buildSystemPrompt(routing.resolvedAgent, issueContext);

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
   * 3-tier intelligent routing for Linear issues.
   *
   * Priority order:
   *   1. Explicit agent — if the named agent is registered, use it directly
   *   2. Linear labels — check issue labels for role hints
   *   3. AI classifier — use Haiku to classify title+description
   *   4. Team mapping — map Linear team name to default role
   *   5. Fallback — use the original agentType from the event
   */
  async intelligentRoute(agentType: string, issueContext: IssueContext): Promise<RoutingDecision> {
    // Tier 0: If the explicit agentType resolves to a registered template, use it
    const explicitTemplate = this.roleRegistry.resolve(agentType);
    if (explicitTemplate?.systemPrompt) {
      return {
        resolvedAgent: agentType,
        tier: 'explicit',
        reasoning: `Explicit agent "${agentType}" is registered with a system prompt`,
      };
    }

    // Tier 1: Check Linear labels for role hints
    const labelRole = this.matchLabelToRole(issueContext.labels);
    if (labelRole) {
      const agentName = this.resolveAgentForRole(labelRole);
      return {
        resolvedAgent: agentName,
        tier: 'label',
        role: labelRole,
        confidence: 1.0,
        reasoning: `Label matched role "${labelRole}" from labels: [${issueContext.labels.join(', ')}]`,
      };
    }

    // Tier 2: AI classifier (Haiku) — analyze title + description
    try {
      const classification = await classifyFeature(
        issueContext.title,
        issueContext.description,
        this.projectPath
      );

      if (classification.confidence >= 0.6) {
        const agentName = this.resolveAgentForRole(classification.role);
        return {
          resolvedAgent: agentName,
          tier: 'classifier',
          role: classification.role,
          confidence: classification.confidence,
          reasoning: classification.reasoning,
        };
      }

      logger.debug(
        `Classifier returned low confidence (${classification.confidence}) for ${issueContext.identifier}, trying team mapping`
      );
    } catch (error) {
      logger.warn('AI classifier failed, falling back to team mapping:', error);
    }

    // Tier 3: Team name mapping
    const teamRole = DEFAULT_TEAM_ROLE_MAP[issueContext.team.toLowerCase()];
    if (teamRole) {
      const agentName = this.resolveAgentForRole(teamRole);
      return {
        resolvedAgent: agentName,
        tier: 'team-mapping',
        role: teamRole,
        reasoning: `Team "${issueContext.team}" maps to role "${teamRole}"`,
      };
    }

    // Fallback: use the original agentType
    return {
      resolvedAgent: agentType,
      tier: 'default',
      reasoning: `No routing signals found; using original agent type "${agentType}"`,
    };
  }

  /**
   * Match issue labels against the label-to-role map.
   * Returns the first matching role or undefined.
   */
  private matchLabelToRole(labels: string[]): AgentRole | undefined {
    for (const label of labels) {
      const role = LABEL_TO_ROLE[label.toLowerCase()];
      if (role) return role;
    }
    return undefined;
  }

  /**
   * Find the best registered agent template for a given role.
   * Returns the template name if found, otherwise the role string itself.
   */
  private resolveAgentForRole(role: AgentRole): string {
    const template = this.roleRegistry.resolve(role);
    return template ? template.name : role;
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
   * Build system prompt from RoleRegistry template.
   * Throws if agent type is not registered — no silent fallbacks.
   */
  private buildSystemPrompt(agentType: string, issueContext: IssueContext): string {
    // Resolve by name or role
    const template = this.roleRegistry.resolve(agentType);

    if (template?.systemPrompt) {
      return template.systemPrompt;
    }

    throw new Error(
      `No system prompt found for agent "${agentType}". Agent is not registered or has no prompt configured.`
    );
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
