/**
 * Langfuse Webhook Handler
 *
 * Provides signature verification for Langfuse webhooks.
 * Implements HMAC-SHA256 verification as per Langfuse webhook documentation.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { createLogger } from '@automaker/utils';

const logger = createLogger('LangfuseWebhook');

/**
 * Webhook signature verification result
 */
export interface WebhookVerificationResult {
  /** Whether the signature is valid */
  isValid: boolean;
  /** Error message if verification failed */
  error?: string;
}

/**
 * Verifies Langfuse webhook signature using HMAC-SHA256.
 *
 * @param rawBody - Raw request body as string (must be the exact body sent, not parsed)
 * @param signature - Signature from x-langfuse-signature header
 * @param secret - Webhook secret from Langfuse settings
 * @returns Verification result with isValid flag and optional error
 */
export function verifyLangfuseWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string | undefined
): WebhookVerificationResult {
  // Check if signature header is present
  if (!signature) {
    logger.warn('Webhook signature missing');
    return { isValid: false, error: 'Missing x-langfuse-signature header' };
  }

  // Check if webhook secret is configured
  if (!secret) {
    logger.error('Webhook secret not configured');
    return { isValid: false, error: 'Webhook secret not configured' };
  }

  try {
    // Compute HMAC-SHA256 of the raw body
    const hmac = createHmac('sha256', secret);
    hmac.update(rawBody, 'utf8');
    const expectedSignature = hmac.digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    // Ensure buffers are same length before comparison
    if (signatureBuffer.length !== expectedBuffer.length) {
      logger.warn('Webhook signature length mismatch');
      return { isValid: false, error: 'Invalid signature format' };
    }

    const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      logger.warn('Webhook signature verification failed');
      return { isValid: false, error: 'Invalid signature' };
    }

    logger.debug('Webhook signature verified successfully');
    return { isValid: true };
  } catch (error) {
    logger.error('Webhook signature verification error:', error);
    return { isValid: false, error: 'Signature verification failed' };
  }
}
