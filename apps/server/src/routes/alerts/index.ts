/**
 * Alerts Routes - Webhook handlers for external monitoring systems
 *
 * Receives alerts from monitoring tools and posts notifications to Discord.
 */

import { Router } from 'express';
import type { SettingsService } from '../../services/settings-service.js';
import type { DiscordBotService } from '../../services/discord-bot-service.js';

export function createAlertsRoutes(
  _settingsService: SettingsService,
  _discordBotService?: DiscordBotService
): Router {
  const router = Router();

  // Webhook handlers can be added here as needed

  return router;
}
