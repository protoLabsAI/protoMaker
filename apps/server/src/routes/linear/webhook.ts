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

const logger = createLogger('linear:webhook');

/** Linear webhook event types we handle */
type LinearWebhookAction = 'create' | 'update' | 'remove';
type LinearWebhookType = 'AgentSession' | 'Issue' | 'Project';

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
      | LinearProjectWebhookPayload;

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
  payload: LinearAgentSessionPayload | LinearIssueWebhookPayload | LinearProjectWebhookPayload,
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
      // Future: handle issue creation if needed
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
 * Finds the corresponding feature and emits linear:issue:updated event
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
  });

  // Find the feature by Linear issue ID
  const feature = await featureLoader.findByLinearIssueId(data.id);

  if (!feature) {
    logger.debug(`No feature found for Linear issue: ${data.id}`);
    return;
  }

  // Track changes for the event payload
  const changes: Record<string, any> = {};

  // Compare title
  if (feature.title !== data.title) {
    changes.title = { from: feature.title, to: data.title };
  }

  // Map Linear state to Automaker status
  if (data.state) {
    const linearState = data.state.name.toLowerCase();
    let automakerStatus: string | undefined;

    // Map common Linear states to Automaker statuses
    if (linearState.includes('backlog') || linearState.includes('todo')) {
      automakerStatus = 'pending';
    } else if (linearState.includes('progress') || linearState.includes('started')) {
      automakerStatus = 'in_progress';
    } else if (linearState.includes('done') || linearState.includes('completed')) {
      automakerStatus = 'completed';
    } else if (linearState.includes('cancel')) {
      automakerStatus = 'cancelled';
    }

    if (automakerStatus && feature.status !== automakerStatus) {
      changes.status = { from: feature.status, to: automakerStatus };
    }
  }

  // Map Linear priority to Automaker complexity
  if (data.priority !== undefined) {
    const priorityMap: Record<number, string> = {
      0: 'low', // none -> low
      1: 'high', // urgent -> high
      2: 'high', // high -> high
      3: 'medium', // normal -> medium
      4: 'low', // low -> low
    };
    const automakerComplexity = priorityMap[data.priority];
    if (automakerComplexity && feature.complexity !== automakerComplexity) {
      changes.priority = { from: feature.complexity, to: automakerComplexity };
    }
  }

  // Only emit event if there are changes
  if (Object.keys(changes).length > 0) {
    logger.info(`Emitting linear:issue:updated for feature ${feature.id}`, {
      changes,
    });

    events.emit('linear:issue:updated', {
      issueId: data.id,
      featureId: feature.id,
      changes,
      updatedAt: data.updatedAt,
    });
  } else {
    logger.debug(`No relevant changes detected for issue ${data.id}`);
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
