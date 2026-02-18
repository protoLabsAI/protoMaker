/**
 * Idea Processing routes - HTTP API for idea processing flow
 *
 * Uses the IdeaProcessingService to manage LangGraph flow execution and HITL sessions.
 */

import { Router } from 'express';
import type { IdeaProcessingService } from '../../services/idea-processing-service.js';
import { createProcessHandler } from './routes/process.js';
import { createStatusHandler } from './routes/status.js';
import { createResumeHandler } from './routes/resume.js';
import { createListHandler } from './routes/list.js';
import { createGetHandler } from './routes/get.js';
import { createCreateHandler } from './routes/create.js';
import { createApproveHandler } from './routes/approve.js';
import { createRejectHandler } from './routes/reject.js';

export function createIdeasRoutes(ideaService: IdeaProcessingService): Router {
  const router = Router();

  // REST endpoints (new, cleaner URLs)
  router.get('/', createListHandler(ideaService)); // GET /api/ideas - list all sessions
  router.get('/:sessionId', createGetHandler(ideaService)); // GET /api/ideas/:sessionId - get session details
  router.post('/', createCreateHandler(ideaService)); // POST /api/ideas - create new session
  router.post('/:sessionId/approve', createApproveHandler(ideaService)); // POST /api/ideas/:sessionId/approve
  router.post('/:sessionId/reject', createRejectHandler(ideaService)); // POST /api/ideas/:sessionId/reject

  // Legacy endpoints (backward compatibility)
  router.post('/process', createProcessHandler(ideaService));
  router.post('/status', createStatusHandler(ideaService));
  router.post('/resume', createResumeHandler(ideaService));

  return router;
}
