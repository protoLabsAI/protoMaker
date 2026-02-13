/**
 * Issue management routes
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import { createManualIssueHandler } from './routes/create.js';

export function createIssuesRoutes(events: EventEmitter): Router {
  const router = Router();

  // Manually trigger issue creation for a feature
  router.post('/create', createManualIssueHandler(events));

  return router;
}
