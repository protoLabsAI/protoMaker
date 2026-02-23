/**
 * Langfuse Webhook Handler
 *
 * Provides types and signature verification for Langfuse webhooks.
 * Implements HMAC-SHA256 verification as per Langfuse webhook documentation.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { createLogger } from '@automaker/utils';

const logger = createLogger('LangfuseWebhook');

/**
 * Langfuse prompt webhook payload structure.
 * Based on Langfuse webhook documentation.
 */
export interface LangfusePromptWebhookPayload {
  /** Event type identifier */
  event: 'prompt.created' | 'prompt.updated' | 'prompt.deleted';
  /** Timestamp of the event in ISO format */
  timestamp: string;
  /** Prompt data */
  data: {
    /** Unique prompt identifier */
    id: string;
    /** Prompt name */
    name: string;
    /** Prompt version number */
    version: number;
    /** Prompt type */
    type: 'text' | 'chat';
    /** Prompt content/template */
    prompt: string | Record<string, unknown>;
    /** Optional configuration */
    config?: Record<string, unknown>;
    /** Labels associated with the prompt */
    labels?: string[];
    /** Tags associated with the prompt */
    tags?: string[];
    /** Project identifier */
    projectId: string;
    /** Creation timestamp */
    createdAt: string;
    /** Last update timestamp */
    updatedAt: string;
    /** Optional metadata */
    metadata?: Record<string, unknown>;
  };
}

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

/**
 * Parses and validates Langfuse webhook payload.
 *
 * @param body - Parsed JSON body
 * @returns Typed payload if valid, null otherwise
 */
export function parseLangfuseWebhookPayload(
  body: unknown
): LangfusePromptWebhookPayload | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const payload = body as Record<string, unknown>;

  // Validate required fields
  if (
    !payload.event ||
    typeof payload.event !== 'string' ||
    !['prompt.created', 'prompt.updated', 'prompt.deleted'].includes(payload.event)
  ) {
    return null;
  }

  if (!payload.timestamp || typeof payload.timestamp !== 'string') {
    return null;
  }

  if (!payload.data || typeof payload.data !== 'object') {
    return null;
  }

  const data = payload.data as Record<string, unknown>;

  // Validate data fields
  if (
    !data.id ||
    typeof data.id !== 'string' ||
    !data.name ||
    typeof data.name !== 'string' ||
    typeof data.version !== 'number' ||
    !data.projectId ||
    typeof data.projectId !== 'string'
  ) {
    return null;
  }

  // All validations passed, safe to cast
  return payload as unknown as LangfusePromptWebhookPayload;
}
