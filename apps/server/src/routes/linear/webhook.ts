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

const logger = createLogger('linear:webhook');

/** Linear webhook event types we handle */
type LinearWebhookAction = 'create' | 'update' | 'remove';

/** Agent session trigger types */
type AgentSessionTrigger = 'mention' | 'delegation' | 'prompt';

/** Linear AgentSessionEvent webhook payload */
interface LinearAgentSessionPayload {
  action: LinearWebhookAction;
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
  /** URL to respond to (for acknowledging) */
  url?: string;
  /** Webhook signature for verification */
  webhookId?: string;
  /** Timestamp of the event */
  createdAt?: string;
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
  events: EventEmitter
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

    const payload = req.body as LinearAgentSessionPayload;

    // Must respond within 5 seconds (Linear requirement)
    // Acknowledge immediately, process async
    res.status(200).json({ ok: true });

    // Process asynchronously after responding
    try {
      await processWebhookEvent(payload, settingsService, events);
    } catch (error) {
      logger.error('Failed to process webhook event', {
        error: error instanceof Error ? error.message : String(error),
        action: payload.action,
        sessionId: payload.data?.id,
      });
    }
  };
}

async function processWebhookEvent(
  payload: LinearAgentSessionPayload,
  settingsService: SettingsService,
  events: EventEmitter
): Promise<void> {
  const { action, type, data } = payload;

  if (type !== 'AgentSession') {
    logger.debug(`Ignoring non-AgentSession event: ${type}`);
    return;
  }

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
