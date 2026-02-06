/**
 * GOAP routes - HTTP API for GOAP brain loop management
 *
 * The GOAP brain loop is a management layer that sits above auto-mode.
 * It evaluates world state, selects goals, and takes management actions
 * (start auto-mode, retry failed features, escalate stuck work).
 */

import { Router } from 'express';
import type { GOAPLoopService } from '../../services/goap-loop-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createStartGOAPLoopHandler } from './routes/start.js';
import { createStopGOAPLoopHandler } from './routes/stop.js';
import { createPauseGOAPLoopHandler } from './routes/pause.js';
import { createResumeGOAPLoopHandler } from './routes/resume.js';
import { createGetGOAPStatusHandler } from './routes/status.js';
import { createListGOAPLoopsHandler } from './routes/list.js';

export function createGOAPRoutes(goapLoopService: GOAPLoopService): Router {
  const router = Router();
  const deps = { goapLoopService };

  router.post('/start', validatePathParams('projectPath'), createStartGOAPLoopHandler(deps));
  router.post('/stop', validatePathParams('projectPath'), createStopGOAPLoopHandler(deps));
  router.post('/pause', validatePathParams('projectPath'), createPauseGOAPLoopHandler(deps));
  router.post('/resume', validatePathParams('projectPath'), createResumeGOAPLoopHandler(deps));
  router.post('/status', validatePathParams('projectPath'), createGetGOAPStatusHandler(deps));
  router.post('/list', createListGOAPLoopsHandler(deps));

  return router;
}
