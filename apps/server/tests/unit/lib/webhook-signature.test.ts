import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { verifyWebhookSignature, verifySingleSecret } from '@/lib/webhook-signature.js';
import type { WebhookSecrets } from '@/lib/webhook-signature.js';

/** Compute a valid GitHub-format signature for the given payload and secret */
function sign(payload: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

describe('webhook-signature', () => {
  const payload = '{"action":"opened","issue":{"number":1}}';
  const secret = 'current-secret-abc123';
  const previousSecret = 'old-secret-xyz789';

  describe('verifyWebhookSignature', () => {
    it('should accept a valid signature with the current secret', () => {
      const signature = sign(payload, secret);
      const result = verifyWebhookSignature(payload, signature, { current: secret });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject a missing signature', () => {
      const result = verifyWebhookSignature(payload, undefined, { current: secret });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing');
    });

    it('should reject a signature with wrong format (no sha256= prefix)', () => {
      const result = verifyWebhookSignature(payload, 'md5=abc123', { current: secret });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid signature format');
    });

    it('should reject an invalid signature', () => {
      const result = verifyWebhookSignature(payload, 'sha256=deadbeef', { current: secret });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    describe('dual-secret rotation', () => {
      it('should accept signature from previous secret when not expired', () => {
        const signature = sign(payload, previousSecret);
        const futureExpiry = new Date(Date.now() + 3600_000).toISOString(); // 1h from now

        const secrets: WebhookSecrets = {
          current: secret,
          previous: previousSecret,
          previousExpiresAt: futureExpiry,
        };

        const result = verifyWebhookSignature(payload, signature, secrets);

        expect(result.valid).toBe(true);
      });

      it('should reject signature from previous secret when expired', () => {
        const signature = sign(payload, previousSecret);
        const pastExpiry = new Date(Date.now() - 1000).toISOString(); // expired 1s ago

        const secrets: WebhookSecrets = {
          current: secret,
          previous: previousSecret,
          previousExpiresAt: pastExpiry,
        };

        const result = verifyWebhookSignature(payload, signature, secrets);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid signature');
      });

      it('should accept previous secret when no expiry is set (implicit valid)', () => {
        const signature = sign(payload, previousSecret);

        const secrets: WebhookSecrets = {
          current: secret,
          previous: previousSecret,
          // no previousExpiresAt — treated as non-expired
        };

        const result = verifyWebhookSignature(payload, signature, secrets);

        expect(result.valid).toBe(true);
      });

      it('should prefer current secret over previous', () => {
        // Sign with current secret — should validate against current, never reach previous
        const signature = sign(payload, secret);

        const secrets: WebhookSecrets = {
          current: secret,
          previous: previousSecret,
          previousExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        };

        const result = verifyWebhookSignature(payload, signature, secrets);

        expect(result.valid).toBe(true);
      });

      it('should reject when neither current nor previous match', () => {
        const signature = sign(payload, 'completely-wrong-secret');

        const secrets: WebhookSecrets = {
          current: secret,
          previous: previousSecret,
          previousExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        };

        const result = verifyWebhookSignature(payload, signature, secrets);

        expect(result.valid).toBe(false);
      });
    });

    it('should handle Buffer payloads', () => {
      const bufferPayload = Buffer.from(payload);
      const signature = sign(payload, secret);
      const result = verifyWebhookSignature(bufferPayload, signature, { current: secret });

      expect(result.valid).toBe(true);
    });
  });

  describe('verifySingleSecret', () => {
    it('should accept a valid signature', () => {
      const signature = sign(payload, secret);
      const result = verifySingleSecret(payload, signature, secret);

      expect(result.valid).toBe(true);
    });

    it('should reject an invalid signature', () => {
      const result = verifySingleSecret(payload, 'sha256=wrong', secret);

      expect(result.valid).toBe(false);
    });

    it('should reject when signature header is missing', () => {
      const result = verifySingleSecret(payload, undefined, secret);

      expect(result.valid).toBe(false);
    });
  });
});
