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

export function createIdeasRoutes(ideaService: IdeaProcessingService): Router {
  const router = Router();

  // Process a new idea
  router.post('/process', createProcessHandler(ideaService));

  // Get session status (with or without sessionId)
  router.post('/status', createStatusHandler(ideaService));

  // Resume an interrupted session
  router.post('/resume', createResumeHandler(ideaService));

  return router;
}
