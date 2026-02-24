/**
 * Lead Engineer Routes
 *
 * POST /api/lead-engineer/start  — Start managing a project
 * POST /api/lead-engineer/status — Get session + world state
 * POST /api/lead-engineer/stop   — Stop managing a project
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { validatePathParams } from '../../middleware/validate-paths.js';
import type { LeadEngineerService } from '../../services/lead-engineer-service.js';
import { getErrorMessage, createLogError } from '../common.js';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('LeadEngineerRoutes');
const logError = createLogError(logger);

export function createLeadEngineerRoutes(service: LeadEngineerService): Router {
  const router = Router();

  router.post('/start', validatePathParams('projectPath'), async (req: Request, res: Response) => {
    try {
      const { projectPath, projectSlug, maxConcurrency } = req.body as {
        projectPath: string;
        projectSlug: string;
        maxConcurrency?: number;
      };

      if (!projectPath || !projectSlug) {
        res.status(400).json({ success: false, error: 'projectPath and projectSlug are required' });
        return;
      }

      const session = await service.start(projectPath, projectSlug, { maxConcurrency });
      res.json({ success: true, session });
    } catch (error) {
      logError(error, 'Lead Engineer start failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  router.post('/status', validatePathParams('projectPath'), async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const session = service.getSession(projectPath);
      const allSessions = service.getAllSessions().map((s) => ({
        projectPath: s.projectPath,
        projectSlug: s.projectSlug,
        flowState: s.flowState,
        startedAt: s.startedAt,
        actionsTaken: s.actionsTaken,
      }));

      res.json({
        success: true,
        session: session || null,
        allSessions,
      });
    } catch (error) {
      logError(error, 'Lead Engineer status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  router.post('/stop', validatePathParams('projectPath'), async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      await service.stop(projectPath);
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Lead Engineer stop failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  return router;
}
