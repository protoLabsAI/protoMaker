/**
 * ActionableItems routes - HTTP API for unified actionable items system
 *
 * Provides endpoints for:
 * - Listing items with filtering
 * - Creating new items
 * - Updating item status
 * - Marking items as read
 * - Snoozing items
 * - Dismissing items
 *
 * All endpoints use handler factories that receive the ActionableItemService instance.
 * Mounted at /api/actionable-items in the main server.
 */

import { Router } from 'express';
import type { ActionableItemService } from '../../services/actionable-item-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createListHandler } from './routes/list.js';
import { createCreateHandler } from './routes/create.js';
import { createUpdateStatusHandler } from './routes/update-status.js';
import { createMarkReadHandler } from './routes/mark-read.js';
import { createSnoozeHandler } from './routes/snooze.js';
import { createDismissHandler } from './routes/dismiss.js';

/**
 * Create ActionableItems router with all endpoints
 *
 * @param service - Instance of ActionableItemService
 * @returns Express Router configured with all actionable-items endpoints
 */
export function createActionableItemsRoutes(service: ActionableItemService): Router {
  const router = Router();

  router.post('/list', validatePathParams('projectPath'), createListHandler(service));
  router.post('/create', validatePathParams('projectPath'), createCreateHandler(service));
  router.post('/update-status', validatePathParams('projectPath'), createUpdateStatusHandler(service));
  router.post('/mark-read', validatePathParams('projectPath'), createMarkReadHandler(service));
  router.post('/snooze', validatePathParams('projectPath'), createSnoozeHandler(service));
  router.post('/dismiss', validatePathParams('projectPath'), createDismissHandler(service));

  return router;
}
