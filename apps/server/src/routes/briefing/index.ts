/**
 * Briefing routes - HTTP API for briefing digest management
 *
 * Provides endpoints for:
 * - Getting a briefing digest of important events since last session
 * - Acknowledging briefing delivery to update the cursor
 *
 * Mounted at /api/briefing in the main server.
 */

import { Router } from 'express';
import type { EventHistoryService } from '../../services/event-history-service.js';
import type { BriefingCursorService } from '../../services/briefing-cursor-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createDigestHandler } from './routes/digest.js';
import { createAckHandler } from './routes/ack.js';

/**
 * Create briefing router with all endpoints
 *
 * Endpoints:
 * - POST /digest - Get briefing digest grouped by severity
 * - POST /ack - Acknowledge briefing delivery
 *
 * @param eventHistoryService - Instance of EventHistoryService
 * @param briefingCursorService - Instance of BriefingCursorService
 * @returns Express Router configured with all briefing endpoints
 */
export function createBriefingRoutes(
  eventHistoryService: EventHistoryService,
  briefingCursorService: BriefingCursorService
): Router {
  const router = Router();

  // Get briefing digest
  router.post(
    '/digest',
    validatePathParams('projectPath'),
    createDigestHandler(eventHistoryService, briefingCursorService)
  );

  // Acknowledge briefing
  router.post('/ack', validatePathParams('projectPath'), createAckHandler(briefingCursorService));

  return router;
}
