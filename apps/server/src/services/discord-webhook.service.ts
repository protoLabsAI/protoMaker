/**
 * Discord Webhook Service
 *
 * Sends outbound Discord notifications via webhook HTTP POSTs.
 * Replaces discord.js bot sends for channel notifications.
 *
 * Webhook URLs are configured per channel via environment variables:
 *   DISCORD_WEBHOOK_INFRA
 *   DISCORD_WEBHOOK_AGENT_LOGS
 *   DISCORD_WEBHOOK_CODE_REVIEW
 *   DISCORD_WEBHOOK_SUGGESTIONS
 *
 * Channels are matched by channel ID using a mapping from env vars:
 *   DISCORD_CHANNEL_INFRA → DISCORD_WEBHOOK_INFRA
 *   DISCORD_CHANNEL_AGENT_LOGS → DISCORD_WEBHOOK_AGENT_LOGS
 *   DISCORD_CHANNEL_CODE_REVIEW → DISCORD_WEBHOOK_CODE_REVIEW
 *   DISCORD_CHANNEL_SUGGESTIONS → DISCORD_WEBHOOK_SUGGESTIONS
 */

import { createLogger } from '@protolabsai/utils';

const logger = createLogger('DiscordWebhookService');

/** Discord webhook embed object */
export interface WebhookEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

/** Discord webhook payload (message or embed) */
interface WebhookPayload {
  content?: string;
  embeds?: WebhookEmbed[];
  username?: string;
}

/**
 * Resolves channel ID → webhook URL using environment variable mapping.
 * Priority: exact channel ID match in the webhook→channel mapping.
 */
function resolveWebhookUrl(channelId: string): string | undefined {
  // Map from channel ID env var → webhook URL env var
  const channelToWebhookEnv: Array<[string | undefined, string | undefined]> = [
    [process.env.DISCORD_CHANNEL_INFRA, process.env.DISCORD_WEBHOOK_INFRA],
    [process.env.DISCORD_CHANNEL_AGENT_LOGS, process.env.DISCORD_WEBHOOK_AGENT_LOGS],
    [process.env.DISCORD_CHANNEL_CODE_REVIEW, process.env.DISCORD_WEBHOOK_CODE_REVIEW],
    [process.env.DISCORD_CHANNEL_SUGGESTIONS, process.env.DISCORD_WEBHOOK_SUGGESTIONS],
  ];

  for (const [chanId, webhookUrl] of channelToWebhookEnv) {
    if (chanId && chanId === channelId && webhookUrl) {
      return webhookUrl;
    }
  }

  return undefined;
}

/**
 * Post a raw payload to a Discord webhook URL.
 * Returns true on success (2xx), false on failure.
 */
async function postToWebhook(webhookUrl: string, payload: WebhookPayload): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '(no body)');
      logger.error(`Webhook POST failed: HTTP ${response.status} — ${text}`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Webhook POST threw an error:', error);
    return false;
  }
}

/**
 * Send a plain-text message to a Discord channel via webhook.
 * Returns true if successful, false if no webhook configured or request failed.
 */
export async function sendToChannelViaWebhook(
  channelId: string,
  content: string
): Promise<boolean> {
  if (!content) {
    logger.warn(`sendToChannelViaWebhook: empty content for channel ${channelId} — skipping`);
    return false;
  }

  const webhookUrl = resolveWebhookUrl(channelId);
  if (!webhookUrl) {
    logger.warn(
      `No webhook URL configured for channel ${channelId} — message not sent. ` +
        `Set DISCORD_WEBHOOK_* env vars to enable webhook delivery.`
    );
    return false;
  }

  // Discord webhook message limit is 2000 chars
  const truncated = content.length > 2000 ? content.slice(0, 1997) + '...' : content;
  return postToWebhook(webhookUrl, { content: truncated });
}

/**
 * Send an embed message to a Discord channel via webhook.
 * Returns true if successful, false if no webhook configured or request failed.
 */
export async function sendEmbedViaWebhook(
  channelId: string,
  embed: WebhookEmbed
): Promise<boolean> {
  const webhookUrl = resolveWebhookUrl(channelId);
  if (!webhookUrl) {
    logger.warn(
      `No webhook URL configured for channel ${channelId} — embed not sent. ` +
        `Set DISCORD_WEBHOOK_* env vars to enable webhook delivery.`
    );
    return false;
  }

  return postToWebhook(webhookUrl, { embeds: [embed] });
}

/**
 * Check whether any webhook URLs are configured.
 */
export function hasWebhooksConfigured(): boolean {
  return !!(
    process.env.DISCORD_WEBHOOK_INFRA ||
    process.env.DISCORD_WEBHOOK_AGENT_LOGS ||
    process.env.DISCORD_WEBHOOK_CODE_REVIEW ||
    process.env.DISCORD_WEBHOOK_SUGGESTIONS
  );
}
