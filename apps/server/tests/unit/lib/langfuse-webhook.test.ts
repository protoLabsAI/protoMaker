import { describe, it, expect } from 'vitest';
import { verifyLangfuseWebhookSignature } from '../../../src/lib/langfuse-webhook.js';
import { createHmac } from 'crypto';

/**
 * Helper to generate valid HMAC-SHA256 signature
 */
function generateSignature(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  return hmac.digest('hex');
}

describe('langfuse-webhook', () => {
  describe('verifyLangfuseWebhookSignature', () => {
    const testSecret = 'test-webhook-secret';
    const testPayload = JSON.stringify({ event: 'prompt.created', data: { id: '123' } });

    it('should reject when signature is missing', () => {
      const result = verifyLangfuseWebhookSignature(testPayload, undefined, testSecret);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('signature');
    });

    it('should reject when webhook secret is not configured', () => {
      const signature = generateSignature(testPayload, testSecret);
      const result = verifyLangfuseWebhookSignature(testPayload, signature, undefined);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('secret not configured');
    });

    it('should reject when signature is invalid', () => {
      const result = verifyLangfuseWebhookSignature(
        testPayload,
        'invalid-signature-1234567890abcdef',
        testSecret
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should reject when signature length is wrong', () => {
      const result = verifyLangfuseWebhookSignature(testPayload, 'abc123', testSecret);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('signature format');
    });

    it('should accept valid signature', () => {
      const signature = generateSignature(testPayload, testSecret);
      const result = verifyLangfuseWebhookSignature(testPayload, signature, testSecret);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject tampered payload with valid-looking signature', () => {
      const originalPayload = JSON.stringify({ event: 'prompt.created', data: { id: '123' } });
      const signature = generateSignature(originalPayload, testSecret);

      // Tamper with payload
      const tamperedPayload = JSON.stringify({ event: 'prompt.deleted', data: { id: '456' } });

      const result = verifyLangfuseWebhookSignature(tamperedPayload, signature, testSecret);

      expect(result.isValid).toBe(false);
    });

    it('should use timing-safe comparison', () => {
      // This test verifies that the function doesn't fail on different-length buffers
      const signature = generateSignature(testPayload, testSecret);
      const truncatedSignature = signature.slice(0, -4);

      const result = verifyLangfuseWebhookSignature(testPayload, truncatedSignature, testSecret);

      expect(result.isValid).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });
});
