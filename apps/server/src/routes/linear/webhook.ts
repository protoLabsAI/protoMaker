/**
 * Linear Webhook Handler
 *
 * Receives webhooks from Linear for agent sessions, issues, projects, and comments.
 * Routes events to appropriate handlers via the event emitter.
 *
 * Agent Session Events (Linear Agent Interaction SDK):
 * - create: New agent session (mention or delegation). Must acknowledge < 10s.
 * - update: Session state changed. If `prompt` present, user responded to elicitation.
 * - remove: Session deleted.
 *
 * Must respond to Linear within 5 seconds — all processing is async after 200 OK.
 */

import type { RequestHandler, Request, Response } from 'express';
import { createHmac } from 'node:crypto';
import { createLogger } from '@protolabs-ai/utils';
import type { SettingsService } from '../../services/settings-service.js';
import type { EventEmitter } from '../../lib/events.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import { linearApprovalHandler } from '../../services/linear-approval-handler.js';
import { linearSyncService } from '../../services/linear-sync-service.js';

const logger = createLogger('linear:webhook');

/** Linear webhook event types we handle */
type LinearWebhookAction = 'create' | 'update' | 'remove';
type LinearWebhookType = 'AgentSession' | 'Issue' | 'Project' | 'ProjectUpdate' | 'Comment';

/** Agent session trigger types */
type AgentSessionTrigger = 'mention' | 'delegation' | 'prompt';

/** Base webhook payload structure */
interface LinearWebhookPayload {
  action: LinearWebhookAction;
  type: LinearWebhookType;
  url?: string;
  webhookId?: string;
  createdAt?: string;
}

/** Linear AgentSessionEvent webhook payload */
interface LinearAgentSessionPayload extends LinearWebhookPayload {
  type: 'AgentSession';
  data: {
    id: string;
    /** The issue this session is associated with */
    issueId?: string;
    /** How this session was triggered */
    trigger?: AgentSessionTrigger;
    /** The user's prompt/message to the agent */
    prompt?: string;
    /** Rich XML context from Linear (issue details, comments, team guidance) */
    promptContext?: string;
    /** Current session status */
    status?: string;
    /** Workspace ID */
    organizationId?: string;
    /** The latest agent activity that triggered this update */
    agentActivity?: {
      id: string;
      type: string;
      body?: string;
    };
    /** Timestamps */
    createdAt?: string;
    updatedAt?: string;
  };
}

/** Linear Issue webhook payload */
interface LinearIssueWebhookPayload extends LinearWebhookPayload {
  type: 'Issue';
  data: {
    id: string;
    title: string;
    description?: string;
    /** Linear state (e.g., "Todo", "In Progress", "Done") */
    state?: {
      id: string;
      name: string;
      type: string;
    };
    /** Priority: 0=none, 1=urgent, 2=high, 3=normal, 4=low */
    priority?: number;
    /** Assignee information */
    assignee?: {
      id: string;
      name: string;
      email?: string;
    };
    /** Project information */
    project?: {
      id: string;
      name: string;
    };
    /** Team information */
    team?: {
      id: string;
      name: string;
    };
    /** SLA information (Business plan feature) */
    sla?: {
      /** SLA status: 'active', 'highRisk', 'breached' */
      status?: 'active' | 'highRisk' | 'breached';
      /** When SLA breach is expected */
      breachesAt?: string;
    };
    /** Due date (YYYY-MM-DD format, set when issue has a due date in Linear) */
    dueDate?: string;
    /** Timestamps */
    createdAt: string;
    updatedAt: string;
    /** Issue URL */
    url: string;
  };
}

/** Linear Project webhook payload */
interface LinearProjectWebhookPayload extends LinearWebhookPayload {
  type: 'Project';
  data: {
    id: string;
    name: string;
    description?: string;
    /** Project state */
    state: string;
    /** Team that owns the project */
    team?: {
      id: string;
      name: string;
    };
    /** Timestamps */
    createdAt: string;
    updatedAt: string;
    /** Project URL */
    url: string;
  };
}

/** Linear Comment webhook payload */
interface LinearCommentWebhookPayload extends LinearWebhookPayload {
  type: 'Comment';
  data: {
    id: string;
    /** Comment body (markdown) */
    body: string;
    /** The issue this comment is on */
    issueId?: string;
    /** The user who created the comment */
    user?: {
      id: string;
      name: string;
      email?: string;
    };
    /** Timestamps */
    createdAt: string;
    updatedAt: string;
  };
}

/** Linear ProjectUpdate webhook payload */
interface LinearProjectUpdateWebhookPayload extends LinearWebhookPayload {
  type: 'ProjectUpdate';
  data: {
    id: string;
    /** Update body (markdown) */
    body: string;
    /** Health status */
    health?: 'onTrack' | 'atRisk' | 'offTrack';
    /** The project this update belongs to */
    projectId: string;
    /** The user who created the update */
    userId?: string;
    user?: {
      id: string;
      name: string;
      email?: string;
    };
    /** Timestamps */
    createdAt: string;
    updatedAt: string;
    /** Update URL */
    url?: string;
  };
}

/**
 * Verify webhook signature from Linear
 */
function verifyWebhookSignature(
  body: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;
  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  const expected = hmac.digest('hex');
  return signature === expected;
}

export function createWebhookHandler(
  settingsService: SettingsService,
  events: EventEmitter,
  featureLoader: FeatureLoader,
  repoRoot: string
): RequestHandler {
  return async (req: Request, res: Response) => {
    const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;

    // Verify signature if secret is configured
    if (webhookSecret) {
      const signature = req.headers['linear-signature'] as string | undefined;
      const reqWithRaw = req as Request & { rawBody?: Buffer };
      const rawBody = reqWithRaw.rawBody
        ? reqWithRaw.rawBody.toString('utf-8')
        : JSON.stringify(req.body);

      if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        logger.warn('Invalid webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    const payload = req.body as
      | LinearAgentSessionPayload
      | LinearIssueWebhookPayload
      | LinearProjectWebhookPayload
      | LinearProjectUpdateWebhookPayload
      | LinearCommentWebhookPayload;

    // Must respond within 5 seconds (Linear requirement)
    // Acknowledge immediately, process async
    res.status(200).json({ ok: true });

    // Process asynchronously after responding
    try {
      await processWebhookEvent(payload, settingsService, events, featureLoader, repoRoot);
    } catch (error) {
      logger.error('Failed to process webhook event', {
        error: error instanceof Error ? error.message : String(error),
        action: payload.action,
        type: payload.type,
        dataId: payload.data?.id,
      });
    }
  };
}

async function processWebhookEvent(
  payload:
    | LinearAgentSessionPayload
    | LinearIssueWebhookPayload
    | LinearProjectWebhookPayload
    | LinearProjectUpdateWebhookPayload
    | LinearCommentWebhookPayload,
  settingsService: SettingsService,
  events: EventEmitter,
  featureLoader: FeatureLoader,
  repoRoot: string
): Promise<void> {
  const { action, type, data } = payload;

  logger.info(`Processing ${type} ${action}`, {
    dataId: data.id,
  });

  // Route to appropriate handler based on type
  switch (type) {
    case 'AgentSession':
      await handleAgentSessionEvent(payload as LinearAgentSessionPayload, action, events);
      break;
    case 'Issue':
      await handleIssueEvent(
        payload as LinearIssueWebhookPayload,
        action,
        events,
        featureLoader,
        settingsService,
        repoRoot
      );
      break;
    case 'Project':
      await handleProjectEvent(payload as LinearProjectWebhookPayload, action, events);
      break;
    case 'ProjectUpdate':
      await handleProjectUpdateEvent(payload as LinearProjectUpdateWebhookPayload, action, events);
      break;
    case 'Comment':
      await handleCommentEvent(
        payload as LinearCommentWebhookPayload,
        action,
        events,
        featureLoader,
        repoRoot
      );
      break;
    default:
      logger.debug(`Unhandled event type: ${type}`);
  }
}

/**
 * Handle AgentSession webhook events
 *
 * Linear Agent Interaction SDK sends these when:
 * - create: User @mentions the agent or delegates an issue
 * - update: Session state changes (including user responding to elicitation)
 * - remove: Session is deleted
 */
async function handleAgentSessionEvent(
  payload: LinearAgentSessionPayload,
  action: LinearWebhookAction,
  events: EventEmitter
): Promise<void> {
  const { data } = payload;

  logger.info(`Processing AgentSession ${action}`, {
    sessionId: data.id,
    trigger: data.trigger,
    issueId: data.issueId,
    hasPrompt: !!data.prompt,
  });

  switch (action) {
    case 'create':
      await handleSessionCreated(data, events);
      break;
    case 'update':
      await handleSessionUpdated(data, events);
      break;
    case 'remove':
      logger.info(`Agent session removed: ${data.id}`);
      events.emit('linear:agent-session:removed', { sessionId: data.id });
      break;
    default:
      logger.debug(`Unhandled action: ${action}`);
  }
}

/**
 * Handle Issue webhook events
 */
async function handleIssueEvent(
  payload: LinearIssueWebhookPayload,
  action: LinearWebhookAction,
  events: EventEmitter,
  featureLoader: FeatureLoader,
  settingsService: SettingsService,
  repoRoot: string
): Promise<void> {
  const { data } = payload;

  switch (action) {
    case 'create':
      logger.info(`Issue created: ${data.id}`, {
        title: data.title,
        state: data.state?.name,
      });
      // Emit issue detected event for signal intake
      events.emit('linear:issue:detected', {
        issueId: data.id,
        title: data.title,
        description: data.description,
        state: data.state,
        createdAt: data.createdAt,
      });
      break;
    case 'update':
      await handleIssueUpdated(data, events, featureLoader, settingsService, repoRoot);
      break;
    case 'remove':
      logger.info(`Issue removed: ${data.id}`);
      break;
    default:
      logger.debug(`Unhandled action: ${action}`);
  }
}

/**
 * Handle Issue update events
 * Delegates to LinearSyncService for status, priority, title, and relation sync
 */
async function handleIssueUpdated(
  data: LinearIssueWebhookPayload['data'],
  events: EventEmitter,
  _featureLoader: FeatureLoader,
  settingsService: SettingsService,
  repoRoot: string
): Promise<void> {
  logger.info(`Issue updated: ${data.id}`, {
    title: data.title,
    state: data.state?.name,
    priority: data.priority,
    slaStatus: data.sla?.status,
  });

  // Delegate to sync service for status, title, priority, and relation sync
  const stateName = data.state?.name || 'Unknown';

  // Resolve projectPath: check linearTeamRoutes mapping first, then fallback
  const defaultPath = process.env.AUTOMAKER_PROJECT_PATH || repoRoot;

  let projectPath = defaultPath;
  if (data.team?.id) {
    try {
      const globalSettings = await settingsService.getGlobalSettings();
      const mapped = globalSettings.linearTeamRoutes?.[data.team.id];
      if (mapped) {
        projectPath = mapped;
        logger.info(`Routed team ${data.team.name} (${data.team.id}) to ${mapped}`);
      }
    } catch (err) {
      logger.warn('Failed to resolve linearTeamRoutes, using default', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await linearSyncService.onLinearIssueUpdated(data.id, stateName, projectPath, {
    title: data.title,
    priority: data.priority,
    dueDate: data.dueDate,
  });

  // Also emit event for other listeners (UI, logging, etc.)
  events.emit('linear:issue:updated', {
    issueId: data.id,
    title: data.title,
    state: data.state?.name,
    priority: data.priority,
    updatedAt: data.updatedAt,
  });

  // Check for approval state transitions
  if (data.state?.name) {
    await linearApprovalHandler.onIssueStateChange(data.id, data.state.name, projectPath, {
      title: data.title,
      description: data.description,
      priority: data.priority,
      team: data.team,
      project: data.project,
      assignee: data.assignee ? { id: data.assignee.id, name: data.assignee.name } : undefined,
    });
  }

  // Handle SLA events (Business plan feature - graceful degradation)
  if (data.sla?.status) {
    await handleSLAEvent(data, events);
  }
}

/**
 * Handle SLA webhook events (Business plan feature)
 * Emits escalation signals based on SLA status
 */
async function handleSLAEvent(
  data: LinearIssueWebhookPayload['data'],
  events: EventEmitter
): Promise<void> {
  const slaStatus = data.sla?.status;

  if (!slaStatus) {
    return;
  }

  logger.info(`SLA event for issue ${data.id}: ${slaStatus}`, {
    breachesAt: data.sla?.breachesAt,
    title: data.title,
  });

  switch (slaStatus) {
    case 'highRisk':
      events.emit('linear:sla:highRisk', {
        issueId: data.id,
        title: data.title,
        url: data.url,
        breachesAt: data.sla?.breachesAt,
        severity: 'elevated',
        timestamp: new Date().toISOString(),
      });
      logger.warn(`SLA high risk for issue ${data.id}: ${data.title}`);
      break;

    case 'breached':
      events.emit('linear:sla:breached', {
        issueId: data.id,
        title: data.title,
        url: data.url,
        severity: 'emergency',
        timestamp: new Date().toISOString(),
      });
      logger.error(`SLA BREACHED for issue ${data.id}: ${data.title}`);
      break;

    default:
      break;
  }
}

/**
 * Handle Project webhook events
 */
async function handleProjectEvent(
  payload: LinearProjectWebhookPayload,
  action: LinearWebhookAction,
  events: EventEmitter
): Promise<void> {
  const { data } = payload;

  switch (action) {
    case 'create':
      logger.info(`Project created: ${data.id}`, {
        name: data.name,
        state: data.state,
      });
      // Emit project created event — triggers planning flow
      events.emit('linear:project:created', {
        projectId: data.id,
        name: data.name,
        description: data.description,
        state: data.state,
        teamId: data.team?.id,
        teamName: data.team?.name,
        url: data.url,
        createdAt: data.createdAt,
      });
      break;
    case 'update':
      await handleProjectUpdated(data, events);
      break;
    case 'remove':
      logger.info(`Project removed: ${data.id}`);
      break;
    default:
      logger.debug(`Unhandled action: ${action}`);
  }
}

/**
 * Handle Project update events
 */
async function handleProjectUpdated(
  data: LinearProjectWebhookPayload['data'],
  events: EventEmitter
): Promise<void> {
  logger.info(`Project updated: ${data.id}`, {
    name: data.name,
    state: data.state,
  });

  // Emit project updated event
  events.emit('linear:project:updated', {
    projectId: data.id,
    name: data.name,
    state: data.state,
    updatedAt: data.updatedAt,
  });

  // Emit lifecycle phase change events based on Linear project state
  if (data.state === 'started' || data.state === 'completed' || data.state === 'canceled') {
    events.emit('project:lifecycle:phase-changed', {
      linearProjectId: data.id,
      name: data.name,
      phase: data.state,
      updatedAt: data.updatedAt,
    });
  }
}

/**
 * Handle new agent session (mention or delegation).
 *
 * Per Linear Agent API: Must acknowledge within 10 seconds by emitting
 * a thought activity. The router handles this after receiving the event.
 */
async function handleSessionCreated(
  data: LinearAgentSessionPayload['data'],
  events: EventEmitter
): Promise<void> {
  const trigger = data.trigger || 'mention';

  logger.info(`Agent session created via ${trigger}`, {
    sessionId: data.id,
    issueId: data.issueId,
    prompt: data.prompt?.substring(0, 100),
    hasPromptContext: !!data.promptContext,
  });

  // Determine agent type based on context
  const prompt = data.prompt?.toLowerCase() || '';
  const gtmKeywords = ['gtm', 'marketing', 'positioning', 'messaging', 'go-to-market', 'launch'];
  const isGtmRelated = gtmKeywords.some((keyword) => prompt.includes(keyword));
  const agentType: 'jon' | 'ava' = isGtmRelated ? 'jon' : 'ava';

  events.emit('linear:agent-session:created', {
    sessionId: data.id,
    issueId: data.issueId,
    trigger,
    prompt: data.prompt,
    promptContext: data.promptContext,
    agentType,
    organizationId: data.organizationId,
  });
}

/**
 * Handle session update.
 *
 * When the update includes a `prompt` field, this means the user responded
 * to an elicitation (agent asked a question, user answered). This is the
 * multi-turn conversation mechanism in Linear's Agent SDK.
 *
 * When no prompt is present, this is a status-only update (e.g., session
 * transitioning to complete/error/stale).
 */
async function handleSessionUpdated(
  data: LinearAgentSessionPayload['data'],
  events: EventEmitter
): Promise<void> {
  if (data.prompt) {
    // User responded to an elicitation — this is a multi-turn follow-up
    logger.info(`Agent session prompted (user responded)`, {
      sessionId: data.id,
      issueId: data.issueId,
      prompt: data.prompt.substring(0, 100),
    });

    events.emit('linear:agent-session:prompted', {
      sessionId: data.id,
      issueId: data.issueId,
      prompt: data.prompt,
      agentType: 'ava',
    });
  } else {
    // Status-only update (no user message)
    logger.info(`Agent session updated`, {
      sessionId: data.id,
      status: data.status,
    });

    events.emit('linear:agent-session:updated', {
      sessionId: data.id,
      issueId: data.issueId,
      status: data.status,
    });
  }
}

/**
 * Handle ProjectUpdate webhook events
 * These fire when someone posts a project update in Linear (status reports, approvals, etc.)
 */
async function handleProjectUpdateEvent(
  payload: LinearProjectUpdateWebhookPayload,
  action: LinearWebhookAction,
  events: EventEmitter
): Promise<void> {
  const { data } = payload;

  switch (action) {
    case 'create':
      logger.info(`ProjectUpdate created: ${data.id}`, {
        projectId: data.projectId,
        health: data.health,
        userName: data.user?.name,
        bodyPreview: data.body?.substring(0, 100),
      });
      events.emit('linear:project-update:created', {
        updateId: data.id,
        projectId: data.projectId,
        body: data.body,
        health: data.health,
        user: data.user,
        userId: data.userId,
        url: data.url,
        createdAt: data.createdAt,
      });
      break;
    case 'update':
      logger.info(`ProjectUpdate updated: ${data.id}`, {
        projectId: data.projectId,
        health: data.health,
      });
      events.emit('linear:project-update:updated', {
        updateId: data.id,
        projectId: data.projectId,
        body: data.body,
        health: data.health,
        user: data.user,
        userId: data.userId,
        url: data.url,
        updatedAt: data.updatedAt,
      });
      break;
    case 'remove':
      logger.debug(`ProjectUpdate removed: ${data.id}`);
      break;
    default:
      logger.debug(`Unhandled action: ${action}`);
  }
}

/**
 * Handle Comment webhook events
 */
async function handleCommentEvent(
  payload: LinearCommentWebhookPayload,
  action: LinearWebhookAction,
  events: EventEmitter,
  featureLoader: FeatureLoader,
  repoRoot: string
): Promise<void> {
  const { data } = payload;

  switch (action) {
    case 'create':
      await handleCommentCreated(data, events, featureLoader, repoRoot);
      break;
    case 'update':
      logger.debug(`Comment updated: ${data.id}`);
      break;
    case 'remove':
      logger.debug(`Comment removed: ${data.id}`);
      break;
    default:
      logger.debug(`Unhandled action: ${action}`);
  }
}

/**
 * Handle new comment creation
 * Routes comment to LinearSyncService for parsing and routing.
 * When the comment is on an issue with an in_progress or blocked feature,
 * the linear:comment:created event handles agent routing — escalation is skipped.
 * Falls back to escalation signal only when no active feature is found.
 */
async function handleCommentCreated(
  data: LinearCommentWebhookPayload['data'],
  events: EventEmitter,
  featureLoader: FeatureLoader,
  repoRoot: string
): Promise<void> {
  logger.info(`Comment created: ${data.id}`, {
    issueId: data.issueId,
    userName: data.user?.name,
    bodyPreview: data.body?.substring(0, 100),
  });

  // Emit comment event for LinearCommentService to handle routing
  events.emit('linear:comment:created', {
    commentId: data.id,
    issueId: data.issueId,
    body: data.body,
    user: data.user,
    createdAt: data.createdAt,
  });

  // Check if this is a human response to an agent elicitation
  if (data.issueId && data.user) {
    // Look up the feature for this Linear issue
    const projectPath = process.env.AUTOMAKER_PROJECT_PATH || repoRoot;
    const feature = await featureLoader.findByLinearIssueId(projectPath, data.issueId);

    if (feature && (feature.status === 'in_progress' || feature.status === 'blocked')) {
      // Active feature found — LinearCommentService already handles routing this comment
      // to the running agent via linear:comment:followup → followUpFeature().
      // Skip the escalation signal to avoid the dead-end path.
      logger.info(
        `Linear comment routed to active feature ${feature.id} (status: ${feature.status})`,
        {
          issueId: data.issueId,
          commentId: data.id,
        }
      );
      return;
    }

    // No active feature found — fall back to escalation signal
    events.emit('escalation:signal-received', {
      source: 'agent_needs_input',
      severity: 'medium',
      type: 'human_response_to_elicitation',
      context: {
        issueId: data.issueId,
        commentId: data.id,
        userName: data.user.name,
        userEmail: data.user.email,
        body: data.body,
        createdAt: data.createdAt,
      },
      deduplicationKey: `elicitation-response:${data.issueId}:${data.id}`,
      timestamp: data.createdAt,
    });
  }
}
