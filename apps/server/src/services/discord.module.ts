import { createLogger } from '@protolabs-ai/utils';

import type { ServiceContainer } from '../server/services.js';
import { DiscordDMChannel } from './escalation-channels/discord-dm-channel.js';
import { eventHookService } from './event-hook-service.js';

const logger = createLogger('Server:Wiring');

/**
 * Wires Discord bot service, Ava Gateway (bot connection), event hook service,
 * agent Discord router, headsdown Discord integration, and DiscordDM escalation channel.
 *
 * DiscordDMChannel is registered here (not in escalation-channels.module.ts) because it
 * requires the Discord bot service to be initialized first.
 */
export function register(container: ServiceContainer): void {
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
      action?: string;
      correlationId?: string;
    };
    if (p.action !== 'send_message' || !p.channelId || !p.content) return;
    try {
      await discordBotService.sendToChannel(p.channelId, p.content);
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
  escalationRouter.registerChannel(
    new DiscordDMChannel(discordBotService, events, undefined, escalationRouter)
  );
}
