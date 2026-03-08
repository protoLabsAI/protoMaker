/**
 * Discord routes - HTTP API for Discord channel management and DMs
 */

import { Router } from 'express';
import { DiscordService } from '../../services/discord-service.js';
import type { DiscordBotService } from '../../services/discord-bot-service.js';
import {
  createReorganizeHandler,
  createUndoHandler,
  createAuditHandler,
} from './routes/reorganize.js';
import { createSendDMHandler } from './routes/send-dm.js';
import { createReadDMsHandler } from './routes/read-dms.js';
import { createSendChannelMessageHandler } from './routes/send-channel-message.js';
import { createReadChannelMessagesHandler } from './routes/read-channel-messages.js';

export function createDiscordRoutes(discordBotService?: DiscordBotService): Router {
  const router = Router();
  const discordService = new DiscordService();

  // Channel reorganization endpoints
  router.post('/reorganize', createReorganizeHandler(discordService));
  router.post('/reorganize/undo', createUndoHandler(discordService));
  router.post('/audit', createAuditHandler(discordService));

  // DM endpoints (require DiscordBotService)
  if (discordBotService) {
    router.post('/send-dm', createSendDMHandler(discordBotService));
    router.post('/read-dms', createReadDMsHandler(discordBotService));
    router.post('/send-channel-message', createSendChannelMessageHandler(discordBotService));
    router.post('/read-channel-messages', createReadChannelMessagesHandler(discordBotService));
  }

  return router;
}
