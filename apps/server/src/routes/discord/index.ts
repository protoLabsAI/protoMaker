/**
 * Discord routes - HTTP API for Discord channel management
 */

import { Router } from 'express';
import { DiscordService } from '../../services/discord-service.js';
import { createReorganizeHandler, createUndoHandler, createAuditHandler } from './routes/reorganize.js';

export function createDiscordRoutes(): Router {
  const router = Router();
  const discordService = new DiscordService();

  // Channel reorganization endpoints
  router.post('/reorganize', createReorganizeHandler(discordService));
  router.post('/reorganize/undo', createUndoHandler(discordService));
  router.post('/audit', createAuditHandler(discordService));

  return router;
}
