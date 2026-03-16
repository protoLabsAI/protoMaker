/**
 * Webhooks routes - HTTP API for external webhook integrations
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import type { SettingsService } from '../../services/settings-service.js';
import { createRateLimiter } from '../../middleware/rate-limiter.js';
import { createGitHubWebhookHandler } from './routes/github.js';

// Rate limiter for inbound webhooks (shared across all webhook routes)
const webhookRateLimiter = createRateLimiter();

export function createWebhooksRoutes(
  events: EventEmitter,
  settingsService: SettingsService
): Router {
  const router = Router();

  // GitHub webhook endpoint (unauthenticated - uses signature verification)
  // Rate limited to prevent abuse
  router.post(
    '/github',
    webhookRateLimiter.middleware,
    createGitHubWebhookHandler(events, settingsService)
  );

  return router;
}
