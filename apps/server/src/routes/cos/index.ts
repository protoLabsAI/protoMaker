/**
 * Chief of Staff (CoS) Routes
 *
 * Provides endpoints for the Chief of Staff (Ava) to submit PRDs and ideas
 * that enter the authority pipeline for automatic decomposition and execution.
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { PMAuthorityAgent } from '../../services/authority-agents/pm-agent.js';
import type { ProjMAuthorityAgent } from '../../services/authority-agents/projm-agent.js';
import type { EMAuthorityAgent } from '../../services/authority-agents/em-agent.js';
import type { StatusMonitorAgent } from '../../services/authority-agents/status-agent.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createSubmitPrdHandler } from './routes/submit-prd.js';

export interface AuthorityAgents {
  pm?: PMAuthorityAgent;
  projm?: ProjMAuthorityAgent;
  em?: EMAuthorityAgent;
  statusMonitor?: StatusMonitorAgent;
}

export function createCosRoutes(
  events: EventEmitter,
  featureLoader: FeatureLoader,
  agents: AuthorityAgents,
  settingsService?: SettingsService
): Router {
  const router = Router();

  /**
   * POST /api/cos/submit-prd
   * Submit a SPARC PRD from the Chief of Staff for automatic decomposition
   */
  router.post(
    '/submit-prd',
    validatePathParams('projectPath'),
    createSubmitPrdHandler(events, featureLoader, agents, settingsService)
  );

  return router;
}
