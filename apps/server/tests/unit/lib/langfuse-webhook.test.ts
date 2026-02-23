import { describe, it, expect } from 'vitest';
import {
  verifyLangfuseWebhookSignature,
  parseLangfuseWebhookPayload,
  type LangfusePromptWebhookPayload,
} from '../../../src/lib/langfuse-webhook.js';
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

  describe('parseLangfuseWebhookPayload', () => {
    const validPayload: LangfusePromptWebhookPayload = {
      event: 'prompt.created',
      timestamp: '2024-01-01T00:00:00Z',
      data: {
        id: 'prompt-123',
        name: 'test-prompt',
        version: 1,
        type: 'text',
        prompt: 'Hello {name}',
        projectId: 'project-456',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    };

    it('should parse valid payload', () => {
      const result = parseLangfuseWebhookPayload(validPayload);

      expect(result).toEqual(validPayload);
    });

    it('should reject null payload', () => {
      const result = parseLangfuseWebhookPayload(null);

      expect(result).toBeNull();
    });

    it('should reject non-object payload', () => {
      expect(parseLangfuseWebhookPayload('string')).toBeNull();
      expect(parseLangfuseWebhookPayload(123)).toBeNull();
      expect(parseLangfuseWebhookPayload([])).toBeNull();
    });

    it('should reject payload with invalid event type', () => {
      const invalid = { ...validPayload, event: 'invalid.event' };
      const result = parseLangfuseWebhookPayload(invalid);

      expect(result).toBeNull();
    });

    it('should reject payload without event', () => {
      const invalid = { ...validPayload };
      delete (invalid as Partial<typeof invalid>).event;
      const result = parseLangfuseWebhookPayload(invalid);

      expect(result).toBeNull();
    });

    it('should reject payload without timestamp', () => {
      const invalid = { ...validPayload };
      delete (invalid as Partial<typeof invalid>).timestamp;
      const result = parseLangfuseWebhookPayload(invalid);

      expect(result).toBeNull();
    });

    it('should reject payload without data', () => {
      const invalid = { ...validPayload };
      delete (invalid as Partial<typeof invalid>).data;
      const result = parseLangfuseWebhookPayload(invalid);

      expect(result).toBeNull();
    });

    it('should reject payload with invalid data.id', () => {
      const invalid = {
        ...validPayload,
        data: { ...validPayload.data, id: 123 as unknown as string },
      };
      const result = parseLangfuseWebhookPayload(invalid);

      expect(result).toBeNull();
    });

    it('should reject payload with invalid data.version', () => {
      const invalid = {
        ...validPayload,
        data: { ...validPayload.data, version: '1' as unknown as number },
      };
      const result = parseLangfuseWebhookPayload(invalid);

      expect(result).toBeNull();
    });

    it('should accept all valid event types', () => {
      const events: Array<'prompt.created' | 'prompt.updated' | 'prompt.deleted'> = [
        'prompt.created',
        'prompt.updated',
        'prompt.deleted',
      ];

      for (const event of events) {
        const payload = { ...validPayload, event };
        const result = parseLangfuseWebhookPayload(payload);

        expect(result).toEqual(payload);
      }
    });

    it('should accept payload with optional fields', () => {
      const payloadWithOptionals = {
        ...validPayload,
        data: {
          ...validPayload.data,
          config: { temperature: 0.7 },
          labels: ['production', 'v2'],
          tags: ['important'],
          metadata: { author: 'test-user' },
        },
      };

      const result = parseLangfuseWebhookPayload(payloadWithOptionals);

      expect(result).toEqual(payloadWithOptionals);
    });

    it('should accept chat type prompt', () => {
      const chatPayload = {
        ...validPayload,
        data: {
          ...validPayload.data,
          type: 'chat' as const,
          prompt: { messages: [{ role: 'user', content: 'Hello' }] },
        },
      };

      const result = parseLangfuseWebhookPayload(chatPayload);

      expect(result).toEqual(chatPayload);
    });
  });
});
