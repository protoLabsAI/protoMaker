/**
 * Ralph routes - HTTP API for Ralph loop management
 *
 * Ralph Mode is a "never give up" execution mode where the agent keeps retrying
 * until the feature is externally verified as complete.
 */

import { Router } from 'express';
import type { RalphLoopService } from '../../services/ralph-loop-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createStartRalphLoopHandler } from './routes/start.js';
import { createStopRalphLoopHandler } from './routes/stop.js';
import { createPauseRalphLoopHandler } from './routes/pause.js';
import { createResumeRalphLoopHandler } from './routes/resume.js';
import { createGetRalphStatusHandler } from './routes/status.js';
import { createListRunningRalphLoopsHandler } from './routes/list-running.js';

export function createRalphRoutes(ralphLoopService: RalphLoopService): Router {
  const router = Router();
  const deps = { ralphLoopService };

  router.post('/start', validatePathParams('projectPath'), createStartRalphLoopHandler(deps));
  router.post('/stop', createStopRalphLoopHandler(deps));
  router.post('/pause', createPauseRalphLoopHandler(deps));
  router.post('/resume', validatePathParams('projectPath'), createResumeRalphLoopHandler(deps));
  router.post('/status', validatePathParams('projectPath'), createGetRalphStatusHandler(deps));
  router.post('/list-running', createListRunningRalphLoopsHandler(deps));

  return router;
}
