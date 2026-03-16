/**
 * Webhook Signature Verification
 *
 * Shared HMAC-SHA256 signature verification for GitHub webhook endpoints.
 * Supports dual-secret verification for zero-downtime secret rotation:
 * the current secret is tried first, and if it fails, the previous secret
 * is tried (provided it has not expired).
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { createLogger } from '@protolabsai/utils';
import type { WebhookVerificationResult } from '@protolabsai/types';

const logger = createLogger('WebhookSignature');

/**
 * Secrets available for webhook verification.
 * During rotation, both current and previous secrets are valid.
 */
export interface WebhookSecrets {
  /** The active webhook secret */
  current: string;
  /** The previous webhook secret (from before the last rotation) */
  previous?: string;
  /** ISO 8601 expiry for the previous secret */
  previousExpiresAt?: string;
}

/**
 * Compute the HMAC-SHA256 signature for a payload using the given secret.
 */
function computeSignature(payload: string | Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

/**
 * Timing-safe comparison of two signature strings.
 * Returns false if lengths differ or content does not match.
 */
function signaturesMatch(actual: string, expected: string): boolean {
  try {
    const actualBuf = Buffer.from(actual);
    const expectedBuf = Buffer.from(expected);
    if (actualBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Verify a GitHub webhook signature against one or more secrets.
 *
 * Tries the current secret first. If that fails and a non-expired previous
 * secret is available, tries that as a fallback. This enables zero-downtime
 * secret rotation where GitHub may still be sending signatures with the
 * old secret for a short window after rotation.
 *
 * @param payload - Raw request body (string or Buffer)
 * @param signature - The X-Hub-Signature-256 header value
 * @param secrets - Current and optional previous secrets
 * @returns Verification result with valid flag and optional error
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string | undefined,
  secrets: WebhookSecrets
): WebhookVerificationResult {
  if (!signature) {
    return { valid: false, error: 'Missing X-Hub-Signature-256 header' };
  }

  if (!signature.startsWith('sha256=')) {
    return { valid: false, error: 'Invalid signature format (expected sha256=...)' };
  }

  // Try current secret
  const expectedCurrent = computeSignature(payload, secrets.current);
  if (signaturesMatch(signature, expectedCurrent)) {
    return { valid: true };
  }

  // Try previous secret if available and not expired
  if (secrets.previous) {
    const isExpired =
      secrets.previousExpiresAt && new Date(secrets.previousExpiresAt).getTime() < Date.now();

    if (isExpired) {
      logger.debug('Previous webhook secret has expired, not attempting fallback verification');
    } else {
      const expectedPrevious = computeSignature(payload, secrets.previous);
      if (signaturesMatch(signature, expectedPrevious)) {
        logger.info('Webhook signature verified using previous (rotated) secret');
        return { valid: true };
      }
    }
  }

  return { valid: false, error: 'Invalid signature' };
}

/**
 * Simplified verification for a single secret (no rotation support).
 * Used when only one secret is available (e.g., per-project webhook settings).
 */
export function verifySingleSecret(
  payload: string | Buffer,
  signature: string | undefined,
  secret: string
): WebhookVerificationResult {
  return verifyWebhookSignature(payload, signature, { current: secret });
}
