/**
 * Integration tests for Discord webhook notification delivery.
 *
 * These tests verify that sendToChannelViaWebhook and sendEmbedViaWebhook
 * correctly route messages via webhook HTTP POSTs when webhook URLs are configured,
 * and gracefully no-op when no webhook URL is mapped for the channel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendToChannelViaWebhook,
  sendEmbedViaWebhook,
  hasWebhooksConfigured,
} from '../../src/services/discord-webhook.service.js';

// Minimal fetch mock
function makeFetchMock(status: number, body = ''): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response);
}

describe('discord-webhook.service', () => {
  const CHANNEL_INFRA = '1469109809939742814';
  const WEBHOOK_INFRA = 'https://discord.com/api/webhooks/test/infra-token';

  let originalFetch: typeof globalThis.fetch;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = {
      DISCORD_CHANNEL_INFRA: process.env.DISCORD_CHANNEL_INFRA,
      DISCORD_WEBHOOK_INFRA: process.env.DISCORD_WEBHOOK_INFRA,
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.restoreAllMocks();
  });

  describe('sendToChannelViaWebhook', () => {
    it('returns false and logs warning when no webhook URL configured for channel', async () => {
      delete process.env.DISCORD_WEBHOOK_INFRA;
      globalThis.fetch = makeFetchMock(204);

      const result = await sendToChannelViaWebhook('999999999999999999', 'hello');

      expect(result).toBe(false);
      // fetch should not have been called
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('returns false when content is empty', async () => {
      process.env.DISCORD_CHANNEL_INFRA = CHANNEL_INFRA;
      process.env.DISCORD_WEBHOOK_INFRA = WEBHOOK_INFRA;
      globalThis.fetch = makeFetchMock(204);

      const result = await sendToChannelViaWebhook(CHANNEL_INFRA, '');

      expect(result).toBe(false);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('POSTs to webhook URL and returns true on 2xx', async () => {
      process.env.DISCORD_CHANNEL_INFRA = CHANNEL_INFRA;
      process.env.DISCORD_WEBHOOK_INFRA = WEBHOOK_INFRA;
      globalThis.fetch = makeFetchMock(204);

      const result = await sendToChannelViaWebhook(CHANNEL_INFRA, 'Test message');

      expect(result).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(url).toBe(WEBHOOK_INFRA);
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.content).toBe('Test message');
    });

    it('returns false on non-2xx HTTP response', async () => {
      process.env.DISCORD_CHANNEL_INFRA = CHANNEL_INFRA;
      process.env.DISCORD_WEBHOOK_INFRA = WEBHOOK_INFRA;
      globalThis.fetch = makeFetchMock(429, 'rate limited');

      const result = await sendToChannelViaWebhook(CHANNEL_INFRA, 'Test message');

      expect(result).toBe(false);
    });

    it('truncates messages longer than 2000 characters', async () => {
      process.env.DISCORD_CHANNEL_INFRA = CHANNEL_INFRA;
      process.env.DISCORD_WEBHOOK_INFRA = WEBHOOK_INFRA;
      globalThis.fetch = makeFetchMock(204);

      const longContent = 'a'.repeat(2100);
      await sendToChannelViaWebhook(CHANNEL_INFRA, longContent);

      const body = JSON.parse(
        ((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1]
          .body as string
      );
      expect(body.content.length).toBe(2000);
      expect(body.content.endsWith('...')).toBe(true);
    });
  });

  describe('sendEmbedViaWebhook', () => {
    it('POSTs embed payload to webhook URL', async () => {
      process.env.DISCORD_CHANNEL_INFRA = CHANNEL_INFRA;
      process.env.DISCORD_WEBHOOK_INFRA = WEBHOOK_INFRA;
      globalThis.fetch = makeFetchMock(204);

      const embed = {
        title: 'Test embed',
        description: 'Test description',
        color: 0x2ecc71,
      };

      const result = await sendEmbedViaWebhook(CHANNEL_INFRA, embed);

      expect(result).toBe(true);
      const body = JSON.parse(
        ((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1]
          .body as string
      );
      expect(body.embeds).toHaveLength(1);
      expect(body.embeds[0].title).toBe('Test embed');
    });

    it('returns false when no webhook configured', async () => {
      delete process.env.DISCORD_WEBHOOK_INFRA;

      const result = await sendEmbedViaWebhook(CHANNEL_INFRA, { title: 'Test' });

      expect(result).toBe(false);
    });
  });

  describe('hasWebhooksConfigured', () => {
    it('returns false when no webhook env vars set', () => {
      delete process.env.DISCORD_WEBHOOK_INFRA;
      delete process.env.DISCORD_WEBHOOK_AGENT_LOGS;
      delete process.env.DISCORD_WEBHOOK_CODE_REVIEW;
      delete process.env.DISCORD_WEBHOOK_SUGGESTIONS;

      expect(hasWebhooksConfigured()).toBe(false);
    });

    it('returns true when at least one webhook URL is set', () => {
      process.env.DISCORD_WEBHOOK_INFRA = WEBHOOK_INFRA;

      expect(hasWebhooksConfigured()).toBe(true);
    });
  });
});
