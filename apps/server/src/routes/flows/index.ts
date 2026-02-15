/**
 * Flows routes - HTTP API for executing multi-step agent flows
 *
 * Provides endpoints for:
 * - Antagonistic review flow (Ava + Jon PRD review)
 * - Project planning flow (research → PRD → milestones → issues)
 *
 * All endpoints use handler factories that receive required services.
 * Mounted at /api/flows in the main server.
 */

import { Router } from 'express';
import { validatePathParams } from '../../middleware/validate-paths.js';
import type { AntagonisticReviewService } from '../../services/antagonistic-review-service.js';
import type { ProjectPlanningService } from '../../services/project-planning-service.js';
import { createExecuteHandler } from './routes/execute.js';
import { createResumeHandler } from './routes/resume.js';
import {
  createPlanningExecuteHandler,
  createPlanningStatusHandler,
} from './routes/project-planning.js';

/**
 * Create flows router with all endpoints
 *
 * Endpoints:
 * - POST /antagonistic-review/execute - Execute Ava + Jon PRD review flow
 * - POST /antagonistic-review/resume - Resume review flow after HITL
 * - POST /project-planning/execute - Start project planning flow
 * - GET  /project-planning/status/:sessionId - Get planning session status
 *
 * @param reviewService - AntagonisticReviewService for PRD reviews
 * @param planningService - ProjectPlanningService for project planning (optional)
 * @returns Express Router configured with all flow endpoints
 */
export function createFlowsRoutes(
  reviewService: AntagonisticReviewService,
  planningService?: ProjectPlanningService
): Router {
  const router = Router();

  // Antagonistic review flow
  router.post(
    '/antagonistic-review/execute',
    validatePathParams('projectPath'),
    createExecuteHandler(reviewService)
  );

  router.post('/antagonistic-review/resume', createResumeHandler(reviewService));

  // Project planning flow
  if (planningService) {
    router.post(
      '/project-planning/execute',
      validatePathParams('projectPath'),
      createPlanningExecuteHandler(planningService)
    );

    router.get('/project-planning/status/:sessionId', createPlanningStatusHandler(planningService));
  }

  return router;
}
