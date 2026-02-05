/**
 * Webhooks routes - HTTP API for external webhook integrations
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import type { SettingsService } from '../../services/settings-service.js';
import { createGitHubWebhookHandler } from './routes/github.js';

export function createWebhooksRoutes(
  events: EventEmitter,
  settingsService: SettingsService
): Router {
  const router = Router();

  // GitHub webhook endpoint (unauthenticated - uses signature verification)
  router.post('/github', createGitHubWebhookHandler(events, settingsService));

  return router;
}
