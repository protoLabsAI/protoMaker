/**
 * Linear Agent Routes
 *
 * OAuth flow for registering as a Linear agent (actor=app),
 * webhook handler for AgentSessionEvent, and sync status endpoint.
 */

import { Router } from 'express';
import { createOAuthRoutes } from './oauth.js';
import { createWebhookHandler } from './webhook.js';
import { getSyncStatus } from './sync-status.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { EventEmitter } from '../../lib/events.js';
import type { FeatureLoader } from '../../services/feature-loader.js';

export function createLinearRoutes(
  settingsService: SettingsService,
  events: EventEmitter,
  featureLoader: FeatureLoader
): Router {
  const router = Router();

  // OAuth authorize + callback (actor=app flow)
  router.use('/oauth', createOAuthRoutes(settingsService));

  // Webhook for AgentSessionEvent, Issue, and Project events
  router.post('/webhook', createWebhookHandler(settingsService, events, featureLoader));

  // Sync status and metrics
  router.get('/sync-status', getSyncStatus);

  return router;
}
