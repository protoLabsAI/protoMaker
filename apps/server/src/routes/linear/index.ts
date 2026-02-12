/**
 * Linear Agent Routes
 *
 * OAuth flow for registering as a Linear agent (actor=app)
 * and webhook handler for AgentSessionEvent.
 */

import { Router } from 'express';
import { createOAuthRoutes } from './oauth.js';
import { createWebhookHandler } from './webhook.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { EventEmitter } from '../../lib/events.js';

export function createLinearRoutes(settingsService: SettingsService, events: EventEmitter): Router {
  const router = Router();

  // OAuth authorize + callback (actor=app flow)
  router.use('/oauth', createOAuthRoutes(settingsService));

  // Webhook for AgentSessionEvent (mentions, delegations)
  router.post('/webhook', createWebhookHandler(settingsService, events));

  return router;
}
