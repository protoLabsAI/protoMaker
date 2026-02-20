/**
 * HITL Form routes - HTTP API for human-in-the-loop form requests
 *
 * Provides endpoints for:
 * - Creating form requests (from agents, flows, or API callers)
 * - Getting form details
 * - Listing pending forms
 * - Submitting form responses
 * - Cancelling pending forms
 *
 * Mounted at /api/hitl-forms in the main server.
 */

import { Router } from 'express';
import type { HITLFormService } from '../../services/hitl-form-service.js';
import { createCreateHandler } from './routes/create.js';
import { createGetHandler } from './routes/get.js';
import { createListHandler } from './routes/list.js';
import { createSubmitHandler } from './routes/submit.js';
import { createCancelHandler } from './routes/cancel.js';

/**
 * Create HITL forms router with all endpoints
 *
 * @param hitlFormService - Instance of HITLFormService
 * @returns Express Router configured with all HITL form endpoints
 */
export function createHITLFormRoutes(hitlFormService: HITLFormService): Router {
  const router = Router();

  router.post('/create', createCreateHandler(hitlFormService));
  router.post('/get', createGetHandler(hitlFormService));
  router.post('/list', createListHandler(hitlFormService));
  router.post('/submit', createSubmitHandler(hitlFormService));
  router.post('/cancel', createCancelHandler(hitlFormService));

  return router;
}
