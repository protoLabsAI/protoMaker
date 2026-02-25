/**
 * Alerts Routes - Webhook handlers for external monitoring systems
 *
 * Receives alerts from Grafana and other monitoring tools,
 * auto-creates Linear issues, and posts notifications to Discord.
 */

import { Router } from 'express';
import { createGrafanaWebhookHandler } from './grafana-bridge.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { DiscordBotService } from '../../services/discord-bot-service.js';

export function createAlertsRoutes(
  settingsService: SettingsService,
  discordBotService?: DiscordBotService
): Router {
  const router = Router();

  // Grafana webhook handler
  router.post('/grafana', createGrafanaWebhookHandler(settingsService, discordBotService));

  return router;
}
