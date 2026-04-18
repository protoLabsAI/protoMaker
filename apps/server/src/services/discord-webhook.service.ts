/**
 * Discord Webhook Service
 *
 * Sends outbound Discord notifications to fleet-wide channels via webhook
 * HTTP POSTs. Channel ID → webhook URL is resolved from DISCORD_WEBHOOK_*
 * environment variables (used for fleet channels: infra, alerts, ava, etc.).
 *
 * Project-scoped sends moved out — protoWorkstacean owns per-project Discord
 * routing now via its own Discord plugin and per-project goals/actions.
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

// ── Fleet-wide channel resolution (env vars) ─────────────────────────────────

const CHANNEL_TO_WEBHOOK_ENV: Array<[string, string]> = [
  ['DISCORD_CHANNEL_INFRA', 'DISCORD_WEBHOOK_INFRA'],
  ['DISCORD_CHANNEL_AGENT_LOGS', 'DISCORD_WEBHOOK_AGENT_LOGS'],
  ['DISCORD_CHANNEL_CODE_REVIEW', 'DISCORD_WEBHOOK_CODE_REVIEW'],
  ['DISCORD_CHANNEL_SUGGESTIONS', 'DISCORD_WEBHOOK_SUGGESTIONS'],
  ['DISCORD_CHANNEL_ALERTS', 'DISCORD_WEBHOOK_ALERTS'],
  ['DISCORD_CHANNEL_AVA', 'DISCORD_WEBHOOK_AVA'],
];

function resolveFleetWebhookUrl(channelId: string): string | undefined {
  for (const [chanEnv, webhookEnv] of CHANNEL_TO_WEBHOOK_ENV) {
    const chanId = process.env[chanEnv];
    const webhookUrl = process.env[webhookEnv];
    if (chanId && chanId === channelId && webhookUrl) {
      return webhookUrl;
    }
  }
  return undefined;
}

// ── Core HTTP ─────────────────────────────────────────────────────────────────

async function postToWebhook(webhookUrl: string, payload: WebhookPayload): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
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

// ── Fleet-wide sends (infra, alerts, ava, etc.) ─────────────────────────────

/**
 * Send a plain-text message to a fleet-wide Discord channel via webhook.
 * Channel ID is resolved to a webhook URL via DISCORD_WEBHOOK_* environment variables.
 */
export async function sendToChannelViaWebhook(
  channelId: string,
  content: string
): Promise<boolean> {
  if (!content) return false;

  const webhookUrl = resolveFleetWebhookUrl(channelId);
  if (!webhookUrl) {
    logger.warn(
      `No webhook URL configured for channel ${channelId} — ` +
        `set DISCORD_WEBHOOK_* env vars to enable fleet channel delivery`
    );
    return false;
  }

  const truncated = content.length > 2000 ? content.slice(0, 1997) + '...' : content;
  return postToWebhook(webhookUrl, { content: truncated });
}

/**
 * Send an embed to a fleet-wide Discord channel via webhook.
 */
export async function sendEmbedViaWebhook(
  channelId: string,
  embed: WebhookEmbed
): Promise<boolean> {
  const webhookUrl = resolveFleetWebhookUrl(channelId);
  if (!webhookUrl) {
    logger.warn(`No webhook URL configured for channel ${channelId}`);
    return false;
  }

  return postToWebhook(webhookUrl, { embeds: [embed] });
}

/**
 * Check whether any fleet webhook URLs are configured.
 */
export function hasWebhooksConfigured(): boolean {
  return CHANNEL_TO_WEBHOOK_ENV.some(([, webhookEnv]) => !!process.env[webhookEnv]);
}
