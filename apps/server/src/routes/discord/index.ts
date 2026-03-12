/**
 * Discord routes - HTTP API for Discord channel management and DMs
 */

import { Router } from 'express';
import type { DiscordBotService } from '../../services/discord-bot-service.js';
import { createSendDMHandler } from './routes/send-dm.js';
import { createReadDMsHandler } from './routes/read-dms.js';
import { createSendChannelMessageHandler } from './routes/send-channel-message.js';
import { createReadChannelMessagesHandler } from './routes/read-channel-messages.js';

export function createDiscordRoutes(discordBotService?: DiscordBotService): Router {
  const router = Router();

  if (!discordBotService) {
    // No bot service — all routes return a clear error
    router.use((_req, res) => {
      res.status(503).json({ success: false, error: 'Discord bot service not available' });
    });
    return router;
  }

  // Guard: reject requests when bot is not connected
  router.use((_req, res, next) => {
    if (!discordBotService.isConnected()) {
      res.status(503).json({
        success: false,
        error:
          'Discord bot not connected. Check DISCORD_BOT_TOKEN (or DISCORD_TOKEN) is set in the server environment.',
      });
      return;
    }
    next();
  });

  router.post('/send-dm', createSendDMHandler(discordBotService));
  router.post('/read-dms', createReadDMsHandler(discordBotService));
  router.post('/send-channel-message', createSendChannelMessageHandler(discordBotService));
  router.post('/read-channel-messages', createReadChannelMessagesHandler(discordBotService));

  return router;
}
