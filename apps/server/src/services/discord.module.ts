import { createLogger } from '@protolabsai/utils';

import type { ServiceContainer } from '../server/services.js';
import { DiscordDMChannel } from './escalation-channels/discord-dm-channel.js';
import { eventHookService } from './event-hook-service.js';
import { DiscordMonitor } from './discord-monitor.js';
import { hasWebhooksConfigured } from './discord-webhook.service.js';

const logger = createLogger('Server:Wiring');

/**
 * Wires Discord webhook-based outbound notifications, Ava Gateway, event hook service,
 * and DiscordDM escalation channel.
 *
 * protoBot now runs exclusively in Workstacean's bot pool (Phase 1 of migration).
 * protomaker sends outbound notifications via Discord webhook HTTP POSTs.
 * Interactive Discord flows (gate holds, HITL) are routed through Workstacean.
 *
 * The discord-monitor is kept for structural compatibility but its read operations
 * return empty results in webhook mode (no bot token = no message reads).
 */
export async function register(container: ServiceContainer): Promise<void> {
  const {
    events,
    settingsService,
    featureLoader,
    discordBotService,
    avaGatewayService,
    escalationRouter,
    headsdownService,
    eventHistoryService,
    ceremonyAuditLog,
    integrationRegistryService,
  } = container;

  // Event Hook Service initialization — runs regardless of Discord (handles non-Discord hooks too)
  eventHookService.initialize(
    events,
    settingsService,
    eventHistoryService,
    featureLoader,
    discordBotService
  );

  // Skip Discord-specific wiring when neither webhooks nor legacy bot token are configured.
  const hasDiscordWebhooks = hasWebhooksConfigured();
  const hasLegacyToken = !!(process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN);

  if (!hasDiscordWebhooks && !hasLegacyToken) {
    logger.info(
      'Discord integration disabled — set DISCORD_WEBHOOK_* env vars to enable webhook delivery'
    );
    return;
  }

  if (hasDiscordWebhooks) {
    logger.info('Discord webhook delivery enabled');
  }
  if (hasLegacyToken) {
    logger.warn(
      'DISCORD_BOT_TOKEN / DISCORD_TOKEN detected — these should be removed from protomaker. ' +
        'protoBot should run only in Workstacean.'
    );
  }

  // Wire Discord bot service (now a webhook stub) to Ava Gateway
  avaGatewayService.setDiscordBot(discordBotService);

  // Bridge integration:discord events to the webhook-based Discord bot service
  events.subscribe(async (type, payload) => {
    if (type !== 'integration:discord') return;
    const p = payload as {
      channelId?: string;
      content?: string;
      embed?: {
        title: string;
        description?: string;
        color?: number;
        fields?: Array<{ name: string; value: string; inline?: boolean }>;
        footer?: { text: string };
        timestamp?: string;
      };
      action?: string;
      correlationId?: string;
    };
    if (!p.channelId) return;
    if (p.action !== 'send_message' && p.action !== 'send_embed') return;

    try {
      if (p.action === 'send_embed' && p.embed) {
        await discordBotService.sendEmbed(p.channelId, p.embed);
      } else if (p.content) {
        await discordBotService.sendToChannel(p.channelId, p.content);
      } else {
        return;
      }
      if (p.correlationId) {
        ceremonyAuditLog.updateDeliveryStatus(p.correlationId, 'delivered');
      }
    } catch (error) {
      logger.error('Failed to deliver integration:discord event:', error);
      if (p.correlationId) {
        ceremonyAuditLog.updateDeliveryStatus(
          p.correlationId,
          'failed',
          undefined,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  });

  // Wire Discord bot service (webhook stub) to headsdown service
  headsdownService.setDiscordBotService(discordBotService);

  // Register Discord DM escalation channel.
  // In webhook mode, sendDM() returns false — DMs are not supported without a bot session.
  // The channel remains registered so the escalation router can attempt delivery.
  const dmRecipients: string[] = [];
  try {
    const globalSettings = await settingsService.getGlobalSettings();
    const discordUsername = globalSettings.userProfile?.discord?.username;
    if (discordUsername) {
      dmRecipients.push(discordUsername);
    }
  } catch {
    logger.warn('Failed to read userProfile for Discord DM recipients');
  }
  escalationRouter.registerChannel(
    new DiscordDMChannel(
      discordBotService,
      events,
      dmRecipients.length > 0 ? { recipients: dmRecipients } : undefined,
      escalationRouter
    )
  );

  // Discord monitor wiring is kept for structural compatibility.
  // In webhook mode, readMessages() returns [] — no messages are actually polled.
  const discordMonitor = new DiscordMonitor(events);
  discordMonitor.setDiscordBotService(discordBotService);

  const configs = integrationRegistryService.getAllEnabledChannelConfigs();
  if (configs.length > 0) {
    logger.debug(
      `Discord channel monitor configured (${configs.length} channel(s)) — message polling disabled in webhook mode`
    );
  }

  logger.info('Discord wiring complete (webhook mode)');
}
