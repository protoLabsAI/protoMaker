/**
 * Flows routes - HTTP API for executing multi-step agent flows
 *
 * Provides endpoints for:
 * - Antagonistic review flow (Ava + Jon PRD review)
 *
 * All endpoints use handler factories that receive required services.
 * Mounted at /api/flows in the main server.
 */

import { Router } from 'express';
import { validatePathParams } from '../../middleware/validate-paths.js';
import type { AntagonisticReviewService } from '../../services/antagonistic-review-service.js';
import { createExecuteHandler } from './routes/execute.js';
import { createResumeHandler } from './routes/resume.js';

/**
 * Create flows router with all endpoints
 *
 * Endpoints:
 * - POST /antagonistic-review/execute - Execute Ava + Jon PRD review flow
 * - POST /antagonistic-review/resume - Resume review flow after HITL
 *
 * @param reviewService - AntagonisticReviewService for PRD reviews
 * @returns Express Router configured with all flow endpoints
 */
export function createFlowsRoutes(reviewService: AntagonisticReviewService): Router {
  const router = Router();

  // Antagonistic review flow
  router.post(
    '/antagonistic-review/execute',
    validatePathParams('projectPath'),
    createExecuteHandler(reviewService)
  );

  router.post('/antagonistic-review/resume', createResumeHandler(reviewService));

  return router;
}
