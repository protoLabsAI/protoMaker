/**
 * Linear Webhook Handler
 *
 * Receives AgentSessionEvent webhooks from Linear.
 * Routes mentions and delegations to the appropriate agent.
 *
 * Events:
 * - agent_session.created: Agent mentioned or assigned
 * - agent_session.updated: User provided additional prompt
 *
 * Must respond within 5 seconds (Linear requirement).
 */

import type { RequestHandler, Request, Response } from 'express';
import { createHmac } from 'node:crypto';
import { createLogger } from '@automaker/utils';
import type { SettingsService } from '../../services/settings-service.js';
import type { EventEmitter } from '../../lib/events.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import { linearApprovalHandler } from '../../services/linear-approval-handler.js';
import { linearSyncService } from '../../services/linear-sync-service.js';

const logger = createLogger('linear:webhook');

/** Linear webhook event types we handle */
type LinearWebhookAction = 'create' | 'update' | 'remove';
type LinearWebhookType = 'AgentSession' | 'Issue' | 'Project' | 'Comment';

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
    /** The comment that triggered this session (for mentions) */
    commentId?: string;
    /** How this session was triggered */
    trigger?: AgentSessionTrigger;
    /** The user's prompt/message to the agent */
    prompt?: string;
    /** Current session status */
    status?: string;
    /** Workspace ID */
    organizationId?: string;
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
  featureLoader: FeatureLoader
): RequestHandler {
  return async (req: Request, res: Response) => {
    const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;

    // Verify signature if secret is configured
    if (webhookSecret) {
      const signature = req.headers['linear-signature'] as string | undefined;
      const rawBody = JSON.stringify(req.body);

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
      | LinearCommentWebhookPayload;

    // Must respond within 5 seconds (Linear requirement)
    // Acknowledge immediately, process async
    res.status(200).json({ ok: true });

    // Process asynchronously after responding
    try {
      await processWebhookEvent(payload, settingsService, events, featureLoader);
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
    | LinearCommentWebhookPayload,
  settingsService: SettingsService,
  events: EventEmitter,
  featureLoader: FeatureLoader
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
      await handleIssueEvent(payload as LinearIssueWebhookPayload, action, events, featureLoader);
      break;
    case 'Project':
      await handleProjectEvent(payload as LinearProjectWebhookPayload, action, events);
      break;
    case 'Comment':
      await handleCommentEvent(payload as LinearCommentWebhookPayload, action, events);
      break;
    default:
      logger.debug(`Unhandled event type: ${type}`);
  }
}

/**
 * Handle AgentSession webhook events
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
  featureLoader: FeatureLoader
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
      await handleIssueUpdated(data, events, featureLoader);
      break;
    case 'remove':
      logger.info(`Issue removed: ${data.id}`);
      // Future: handle issue removal if needed
      break;
    default:
      logger.debug(`Unhandled action: ${action}`);
  }
}

/**
 * Handle Issue update events
 * Delegates to LinearSyncService for status, priority, and title sync
 */
async function handleIssueUpdated(
  data: LinearIssueWebhookPayload['data'],
  events: EventEmitter,
  featureLoader: FeatureLoader
): Promise<void> {
  logger.info(`Issue updated: ${data.id}`, {
    title: data.title,
    state: data.state?.name,
    priority: data.priority,
    slaStatus: data.sla?.status,
  });

  // Delegate to sync service for status, title, and priority sync
  // The sync service handles loop prevention, conflict detection, and batched updates
  const stateName = data.state?.name || 'Unknown';
  const projectPath = process.cwd();

  await linearSyncService.onLinearIssueUpdated(data.id, stateName, projectPath, {
    title: data.title,
    priority: data.priority,
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
      // Emit elevated escalation signal
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
      // Emit emergency escalation signal for DM
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
      // 'active' or unknown status - no action needed
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
      // Future: handle project creation if needed
      break;
    case 'update':
      await handleProjectUpdated(data, events);
      break;
    case 'remove':
      logger.info(`Project removed: ${data.id}`);
      // Future: handle project removal if needed
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
}

/**
 * Handle new agent session (mention or delegation)
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
  });

  // Determine agent type based on context
  // Check prompt for GTM-related keywords
  const prompt = data.prompt?.toLowerCase() || '';
  const gtmKeywords = ['gtm', 'marketing', 'positioning', 'messaging', 'go-to-market', 'launch'];
  const isGtmRelated = gtmKeywords.some((keyword) => prompt.includes(keyword));

  // Route to GTM agent if prompt contains GTM keywords, otherwise route to Ava
  const agentType: 'jon' | 'ava' = isGtmRelated ? 'jon' : 'ava';

  events.emit('linear:agent-session:created', {
    sessionId: data.id,
    issueId: data.issueId,
    commentId: data.commentId,
    trigger,
    prompt: data.prompt,
    agentType,
    organizationId: data.organizationId,
  });
}

/**
 * Handle session update (user provided additional prompt)
 */
async function handleSessionUpdated(
  data: LinearAgentSessionPayload['data'],
  events: EventEmitter
): Promise<void> {
  logger.info(`Agent session updated`, {
    sessionId: data.id,
    prompt: data.prompt?.substring(0, 100),
  });

  events.emit('linear:agent-session:updated', {
    sessionId: data.id,
    issueId: data.issueId,
    prompt: data.prompt,
    status: data.status,
  });
}

/**
 * Handle Comment webhook events
 */
async function handleCommentEvent(
  payload: LinearCommentWebhookPayload,
  action: LinearWebhookAction,
  events: EventEmitter
): Promise<void> {
  const { data } = payload;

  switch (action) {
    case 'create':
      await handleCommentCreated(data, events);
      break;
    case 'update':
      logger.debug(`Comment updated: ${data.id}`);
      // Future: handle comment updates if needed
      break;
    case 'remove':
      logger.debug(`Comment removed: ${data.id}`);
      // Future: handle comment removal if needed
      break;
    default:
      logger.debug(`Unhandled action: ${action}`);
  }
}

/**
 * Handle new comment creation
 * Routes comment to LinearSyncService for parsing and routing
 * Also detects human responses to agent elicitation sessions
 */
async function handleCommentCreated(
  data: LinearCommentWebhookPayload['data'],
  events: EventEmitter
): Promise<void> {
  logger.info(`Comment created: ${data.id}`, {
    issueId: data.issueId,
    userName: data.user?.name,
    bodyPreview: data.body?.substring(0, 100),
  });

  // Emit comment event for LinearSyncService to handle
  events.emit('linear:comment:created', {
    commentId: data.id,
    issueId: data.issueId,
    body: data.body,
    user: data.user,
    createdAt: data.createdAt,
  });

  // Check if this is a human response to an agent elicitation
  // Emit escalation signal for the escalation router
  if (data.issueId && data.user) {
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
