/**
 * Discord routes - HTTP API for Discord channel notifications via project webhooks.
 *
 * send-channel-message is project-scoped: routes to the project's dev or release
 * webhook URL as configured in workspace/projects.yaml (source of truth).
 *
 * Other routes (read-channel-messages, add-reaction, DMs) require a live Discord
 * bot connection and are served by workstacean's bot pool — not by protoMaker.
 */

import { Router } from 'express';
import type { ProjectRegistryService } from '../../services/project-registry-service.js';
import { createSendChannelMessageHandler } from './routes/send-channel-message.js';

export function createDiscordRoutes(projectRegistry: ProjectRegistryService): Router {
  const router = Router();

  router.post('/send-channel-message', createSendChannelMessageHandler(projectRegistry));

  return router;
}
