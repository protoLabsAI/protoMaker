/**
 * Agent Recovery Routes
 *
 * Exposes restart-recovery operations for the board UI and MCP tool:
 * - POST /api/agent/interrupted  — list all interrupted workflows
 * - POST /api/agent/resume       — manually resume a specific interrupted workflow
 */

import { Router } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { RestartRecoveryService } from '../services/restart-recovery-service.js';

const logger = createLogger('AgentRecoveryRoutes');

export function createAgentRouter(restartRecoveryService: RestartRecoveryService): Router {
  const router = Router();

  /**
   * POST /api/agent/interrupted
   *
   * Returns all currently interrupted workflows across all projects.
   * The board uses this to surface resume options to the user.
   *
   * Response:
   * - interrupted: InterruptedWorkflow[]
   */
  router.post('/interrupted', async (_req, res) => {
    try {
      const interrupted = await restartRecoveryService.detectInterruptedWorkflows();
      res.json({ interrupted });
    } catch (err) {
      logger.error('Failed to detect interrupted workflows:', err);
      res.status(500).json({ error: 'Failed to detect interrupted workflows' });
    }
  });

  /**
   * POST /api/agent/resume
   *
   * Manually resumes an interrupted workflow by resetting it to backlog
   * so auto-mode can pick it up.
   *
   * Body:
   * - projectPath: string (required)
   * - featureId:   string (required)
   *
   * Response:
   * - success: boolean
   * - reason?: string   (present when success is false)
   */
  router.post('/resume', async (req, res) => {
    const { projectPath, featureId } = req.body as {
      projectPath?: string;
      featureId?: string;
    };

    if (!projectPath || !featureId) {
      res.status(400).json({ error: 'projectPath and featureId are required' });
      return;
    }

    try {
      const result = await restartRecoveryService.resumeWorkflow(projectPath, featureId);

      if (!result.success) {
        res.status(422).json(result);
        return;
      }

      res.json(result);
    } catch (err) {
      logger.error(`Failed to resume workflow for feature ${featureId}:`, err);
      res.status(500).json({ error: 'Failed to resume workflow' });
    }
  });

  return router;
}
