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
import { createLogger } from '@automaker/utils';
import { verifyLangfuseWebhookSignature } from '../../lib/langfuse-webhook.js';
import { getPromptResolver } from '../../lib/langfuse-singleton.js';
import type { PromptGitHubSyncService } from '../../services/prompt-github-sync-service.js';
import { promptCITriggerService } from '../../services/prompt-ci-trigger-service.js';

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
 * Process prompt version webhook event
 * Filters by label and dispatches to sync service
 */
async function processPromptVersionEvent(
  payload: LangfuseWebhookPayload,
  targetLabel: string,
  syncService: PromptGitHubSyncService | null
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

  // Check if sync service is available
  if (!syncService || !syncService.isAvailable()) {
    logger.warn('GitHub sync service not available, skipping prompt sync', {
      promptId: data.id,
      name: data.name,
      version: data.version,
    });
    return;
  }

  // Parse prompt name into category.key format
  // Expected format: "category.key" (e.g., "autoMode.planningLite")
  const nameParts = data.name.split('.');
  if (nameParts.length !== 2) {
    logger.warn('Invalid prompt name format, expected category.key', {
      promptId: data.id,
      name: data.name,
      version: data.version,
    });
    return;
  }

  const [category, key] = nameParts;

  // Sync prompt to GitHub
  const result = await syncService.syncPrompt({
    category,
    key,
    content: data.prompt,
    name: data.name,
    version: String(data.version),
  });

  if (result.success) {
    logger.info('Successfully synced prompt to GitHub', {
      promptId: data.id,
      name: data.name,
      version: data.version,
      category,
      key,
    });

    // Invalidate PromptResolver cache so the updated prompt is served immediately
    try {
      getPromptResolver().clearCache();
      logger.debug('PromptResolver cache cleared after prompt sync');
    } catch {
      // Non-fatal — cache will expire naturally via TTL
    }

    // Trigger CI workflow if enabled
    const ciResult = await promptCITriggerService.triggerCIAfterCommit(process.cwd(), {
      name: data.name,
      version: data.version,
      labels: data.labels,
      action: event.replace('prompt-version.', ''),
    });
    if (ciResult.success && !ciResult.skipped) {
      logger.info('CI trigger fired for prompt update', { name: data.name });
    } else if (!ciResult.success) {
      logger.warn('CI trigger failed', { name: data.name, error: ciResult.error });
    }
  } else {
    logger.error('Failed to sync prompt to GitHub', {
      promptId: data.id,
      name: data.name,
      version: data.version,
      category,
      key,
      error: result.error,
    });
  }
}

/**
 * Create webhook handler for Langfuse prompt-version events
 */
export function createWebhookHandler(syncService: PromptGitHubSyncService | null): RequestHandler {
  return async (req: Request, res: Response) => {
    const webhookSecret = process.env.LANGFUSE_WEBHOOK_SECRET;
    const targetLabel = process.env.LANGFUSE_SYNC_LABEL || 'production';

    // Verify signature if secret is configured
    if (webhookSecret) {
      const signature = req.headers['x-langfuse-signature'] as string | undefined;
      const rawBody = (req as any).rawBody
        ? (req as any).rawBody.toString('utf-8')
        : JSON.stringify(req.body);

      const verification = verifyLangfuseWebhookSignature(rawBody, signature, webhookSecret);
      if (!verification.isValid) {
        logger.warn('Invalid webhook signature', { error: verification.error });
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
      await processPromptVersionEvent(payload, targetLabel, syncService);
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
