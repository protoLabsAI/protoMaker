import { createLogger } from '@protolabsai/utils';

import type { ServiceContainer } from '../server/services.js';
import { DiscordDMChannel } from './escalation-channels/discord-dm-channel.js';
import { eventHookService } from './event-hook-service.js';
import { DiscordMonitor } from './discord-monitor.js';

const logger = createLogger('Server:Wiring');

/**
 * Wires Discord bot service, Ava Gateway (bot connection), event hook service,
 * agent Discord router, headsdown Discord integration, and DiscordDM escalation channel.
 *
 * DiscordDMChannel is registered here (not in escalation-channels.module.ts) because it
 * requires the Discord bot service to be initialized first.
 */
export async function register(container: ServiceContainer): Promise<void> {
  const {
    events,
    settingsService,
    featureLoader,
    discordBotService,
    avaGatewayService,
    escalationRouter,
    agentDiscordRouter,
    headsdownService,
    eventHistoryService,
    ceremonyAuditLog,
    integrationRegistryService,
  } = container;

  // Discord Bot Service initialization
  void discordBotService.initialize();

  // Wire Discord bot service to Ava Gateway
  avaGatewayService.setDiscordBot(discordBotService);

  // Event Hook Service initialization (must be after DiscordBotService)
  eventHookService.initialize(
    events,
    settingsService,
    eventHistoryService,
    featureLoader,
    discordBotService
  );

  // Bridge integration:discord events to Discord bot service
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

  // Agent Discord Router wiring
  agentDiscordRouter.start();

  // Wire Discord bot service to headsdown service
  headsdownService.setDiscordBotService(discordBotService);

  // Register Discord DM escalation channel (requires discordBotService)
  // Read DM recipients from user profile settings
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

  // Start Discord channel signal monitoring when DISCORD_TOKEN is configured.
  // The monitor polls only channels registered in integrationRegistryService.
  // Configs start empty and are populated at runtime via setChannelConfigs().
  if (process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN) {
    const discordMonitor = new DiscordMonitor(events);
    discordMonitor.setDiscordBotService(discordBotService);

    const configs = integrationRegistryService.getAllEnabledChannelConfigs();
    void discordMonitor.startChannelMonitoring(configs).catch((err) => {
      logger.error('Failed to start Discord channel signal monitoring:', err);
    });

    logger.info(`Discord channel signal monitor started (${configs.length} channel(s) configured)`);
  } else {
    logger.info('Discord channel signal monitor skipped (DISCORD_TOKEN not set)');
  }
}
