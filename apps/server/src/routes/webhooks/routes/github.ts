/**
 * GitHub webhook handler
 *
 * Receives and validates GitHub webhook events
 * Implements HMAC-SHA256 signature verification per GitHub's webhook security
 * https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */

import type { Request, Response } from 'express';
import crypto from 'crypto';
import { createLogger } from '@automaker/utils';

const logger = createLogger('WebhookGitHub');

/**
 * Verify GitHub webhook signature using HMAC-SHA256
 *
 * @param payload - Raw request body as string
 * @param signature - X-Hub-Signature-256 header value
 * @param secret - Webhook secret configured in GitHub
 * @returns true if signature is valid, false otherwise
 */
function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  // Extract the signature hash (remove 'sha256=' prefix)
  const signatureHash = signature.substring(7);

  // Calculate expected signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedHash = hmac.digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHash), Buffer.from(expectedHash));
  } catch {
    // Lengths don't match or other error
    return false;
  }
}

/**
 * Create GitHub webhook handler
 */
export function createGitHubWebhookHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      // Get webhook secret from environment
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

      if (!webhookSecret) {
        logger.error('GITHUB_WEBHOOK_SECRET not configured');
        res.status(500).json({
          success: false,
          error: 'Webhook secret not configured',
        });
        return;
      }

      // Get signature from header
      const signature = req.headers['x-hub-signature-256'] as string | undefined;

      if (!signature) {
        logger.warn('Webhook received without signature');
        res.status(401).json({
          success: false,
          error: 'Missing signature',
        });
        return;
      }

      // Get raw body for signature verification
      // express.raw() middleware stores the body as a Buffer in req.body
      const rawBody = req.body as Buffer;
      const rawBodyString = rawBody.toString('utf8');

      // Verify signature
      if (!verifyGitHubSignature(rawBodyString, signature, webhookSecret)) {
        logger.warn('Invalid webhook signature');
        res.status(401).json({
          success: false,
          error: 'Invalid signature',
        });
        return;
      }

      // Parse the JSON payload after signature verification
      const payload = JSON.parse(rawBodyString);

      // Extract event type and delivery ID
      const eventType = req.headers['x-github-event'] as string | undefined;
      const deliveryId = req.headers['x-github-delivery'] as string | undefined;

      // Log webhook event
      logger.info('GitHub webhook received', {
        event: eventType,
        deliveryId,
        action: payload?.action,
        repository: payload?.repository?.full_name,
      });

      // TODO: Process webhook payload based on event type
      // For now, just acknowledge receipt

      res.status(200).json({
        success: true,
        message: 'Webhook received',
      });
    } catch (error) {
      logger.error('Error processing webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}
