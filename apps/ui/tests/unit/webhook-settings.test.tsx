/**
 * Unit tests for Discord webhook URL validation logic.
 *
 * Tests cover:
 * - Valid Discord webhook URLs are accepted
 * - Invalid or non-Discord URLs are rejected
 * - Edge cases: empty string, missing parts, wrong domain
 */

import { describe, it, expect } from 'vitest';
import { validateDiscordWebhookUrl } from '@/components/views/projects/project-settings-panel';

describe('validateDiscordWebhookUrl', () => {
  describe('valid URLs', () => {
    it('accepts a standard discord.com webhook URL', () => {
      expect(
        validateDiscordWebhookUrl(
          'https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz'
        )
      ).toBe(true);
    });

    it('accepts a webhook URL with a token containing hyphens and underscores', () => {
      expect(
        validateDiscordWebhookUrl('https://discord.com/api/webhooks/9876543210/abc-def_ghi-123')
      ).toBe(true);
    });

    it('accepts a canary.discord.com webhook URL', () => {
      expect(
        validateDiscordWebhookUrl('https://canary.discord.com/api/webhooks/1234567890/sometoken123')
      ).toBe(true);
    });

    it('accepts a ptb.discord.com webhook URL', () => {
      expect(
        validateDiscordWebhookUrl('https://ptb.discord.com/api/webhooks/1234567890/sometoken123')
      ).toBe(true);
    });

    it('accepts a realistic Discord webhook URL format', () => {
      expect(
        validateDiscordWebhookUrl(
          'https://discord.com/api/webhooks/1070606339363049492/xAbCdEfGhIjKlMnOpQrStUvWxYz-1234567890_abcdef'
        )
      ).toBe(true);
    });
  });

  describe('invalid URLs', () => {
    it('rejects an empty string', () => {
      expect(validateDiscordWebhookUrl('')).toBe(false);
    });

    it('rejects a non-Discord URL', () => {
      expect(validateDiscordWebhookUrl('https://example.com/webhook/123/token')).toBe(false);
    });

    it('rejects a Slack webhook URL', () => {
      expect(
        validateDiscordWebhookUrl('https://hooks.slack.com/services/T00000000/B00000000/XXXXX')
      ).toBe(false);
    });

    it('rejects a Discord URL missing the webhook ID', () => {
      expect(validateDiscordWebhookUrl('https://discord.com/api/webhooks/')).toBe(false);
    });

    it('rejects a Discord URL missing the token', () => {
      expect(validateDiscordWebhookUrl('https://discord.com/api/webhooks/1234567890')).toBe(false);
    });

    it('rejects a Discord URL with http instead of https', () => {
      expect(
        validateDiscordWebhookUrl('http://discord.com/api/webhooks/1234567890/sometoken123')
      ).toBe(false);
    });

    it('rejects a Discord URL without /api/webhooks/ path', () => {
      expect(
        validateDiscordWebhookUrl('https://discord.com/webhooks/1234567890/sometoken123')
      ).toBe(false);
    });

    it('rejects a non-numeric webhook ID', () => {
      expect(validateDiscordWebhookUrl('https://discord.com/api/webhooks/abc/sometoken123')).toBe(
        false
      );
    });

    it('rejects a random string', () => {
      expect(validateDiscordWebhookUrl('not-a-url')).toBe(false);
    });

    it('rejects undefined-like empty values', () => {
      expect(validateDiscordWebhookUrl('   ')).toBe(false);
    });
  });
});
