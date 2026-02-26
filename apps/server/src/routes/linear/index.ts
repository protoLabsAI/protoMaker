/**
 * Linear Agent Routes
 *
 * OAuth flow for registering as a Linear agent (actor=app),
 * webhook handler for AgentSessionEvent, sync status, and conflict resolution.
 */

import { Router } from 'express';
import { createOAuthRoutes } from './oauth.js';
import { createWebhookHandler } from './webhook.js';
import { getSyncStatus } from './sync-status.js';
import { getConflicts, resolveConflict } from './resolve-conflict.js';
import { createSyncDependenciesHandler } from './sync-dependencies.js';
import { createSyncProjectHandler } from './sync-project.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { EventEmitter } from '../../lib/events.js';
import type { FeatureLoader } from '../../services/feature-loader.js';

export function createLinearRoutes(
  settingsService: SettingsService,
  events: EventEmitter,
  featureLoader: FeatureLoader,
  repoRoot: string
): Router {
  const router = Router();

  // OAuth authorize + callback (actor=app flow)
  router.use('/oauth', createOAuthRoutes(settingsService));

  // Webhook for AgentSessionEvent, Issue, and Project events
  router.post('/webhook', createWebhookHandler(settingsService, events, featureLoader, repoRoot));

  // Sync status and metrics
  router.get('/sync-status', getSyncStatus);

  // Conflict resolution
  router.get('/conflicts', getConflicts);
  router.post('/resolve-conflict', resolveConflict);

  // Dependency sync - one-time backfill
  router.post('/sync-dependencies', createSyncDependenciesHandler(settingsService, featureLoader));

  // Project milestone sync to Linear
  router.post('/sync-project', createSyncProjectHandler());

  return router;
}
