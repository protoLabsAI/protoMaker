/**
 * Discord Routes
 *
 * API endpoints for Discord server management and integration.
 */

import { Router } from 'express';
import { createReorganizeRoutes } from './routes/reorganize.js';
import type { SettingsService } from '../../services/settings-service.js';

export function createDiscordRoutes(settingsService: SettingsService): Router {
  const router = Router();

  // Mount reorganization routes
  router.use('/reorganize', createReorganizeRoutes(settingsService));

  return router;
}
