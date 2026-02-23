/**
 * Langfuse Webhook Handler
 *
 * Receives webhooks from Langfuse for prompt version events.
 * Filters by label (default: 'production') and dispatches to sync service.
 * Uses raw body buffer for signature verification.
 *
 * Must respond within 5 seconds — all processing is async after 200 OK.
 */

import type { RequestHandler, Request, Response } from 'express';
import { createHmac } from 'node:crypto';
import { createLogger } from '@automaker/utils';

const logger = createLogger('langfuse:webhook');

/** Langfuse webhook event types */
type LangfuseWebhookEvent = 'prompt-version.created' | 'prompt-version.updated';

/** Base webhook payload structure */
interface LangfuseWebhookPayload {
  event: LangfuseWebhookEvent;
  data: {
    id: string;
    name: string;
    version: number;
    prompt: string;
    labels: string[];
    config?: Record<string, unknown>;
    createdAt: string;
    updatedAt?: string;
  };
}

/**
 * Verify webhook signature from Langfuse
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

/**
 * Process prompt version webhook event
 * Filters by label and dispatches to sync service
 */
async function processPromptVersionEvent(
  payload: LangfuseWebhookPayload,
  targetLabel: string
): Promise<void> {
  const { event, data } = payload;

  logger.info(`Processing ${event}`, {
    promptId: data.id,
    name: data.name,
    version: data.version,
    labels: data.labels,
  });

  // Filter by label (default: 'production')
  if (!data.labels.includes(targetLabel)) {
    logger.debug(`Skipping prompt version - label '${targetLabel}' not found`, {
      promptId: data.id,
      name: data.name,
      version: data.version,
      labels: data.labels,
    });
    return;
  }

  // TODO: Dispatch to sync service when implemented
  // For now, just log that we would sync this prompt
  logger.info(`Would sync prompt version to GitHub`, {
    promptId: data.id,
    name: data.name,
    version: data.version,
    label: targetLabel,
  });
}

/**
 * Create webhook handler for Langfuse prompt-version events
 */
export function createWebhookHandler(): RequestHandler {
  return async (req: Request, res: Response) => {
    const webhookSecret = process.env.LANGFUSE_WEBHOOK_SECRET;
    const targetLabel = process.env.LANGFUSE_WEBHOOK_LABEL || 'production';

    // Verify signature if secret is configured
    if (webhookSecret) {
      const signature = req.headers['x-langfuse-signature'] as string | undefined;
      const rawBody = (req as any).rawBody
        ? (req as any).rawBody.toString('utf-8')
        : JSON.stringify(req.body);

      if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        logger.warn('Invalid webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    const payload = req.body as LangfuseWebhookPayload;

    // Filter to prompt-version events only
    if (!payload.event?.startsWith('prompt-version.')) {
      logger.debug(`Ignoring non-prompt-version event: ${payload.event}`);
      res.status(200).json({ ok: true });
      return;
    }

    // Must respond within 5 seconds (webhook requirement)
    // Acknowledge immediately, process async
    res.status(200).json({ ok: true });

    // Process asynchronously after responding
    try {
      await processPromptVersionEvent(payload, targetLabel);
    } catch (error) {
      // Log sync outcome without crashing on errors
      logger.error('Failed to process prompt-version webhook', {
        error: error instanceof Error ? error.message : String(error),
        event: payload.event,
        promptId: payload.data?.id,
        name: payload.data?.name,
        version: payload.data?.version,
      });
    }
  };
}
