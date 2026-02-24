/**
 * Integrity routes - HTTP API for data integrity watchdog
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { DataIntegrityWatchdogService } from '../services/data-integrity-watchdog-service.js';
import { validatePathParams } from '../middleware/validate-paths.js';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('IntegrityRoutes');

export function createIntegrityRoutes(
  integrityWatchdogService: DataIntegrityWatchdogService
): Router {
  const router = Router();

  // POST /clear - Clear integrity breach for a project
  router.post('/clear', validatePathParams('projectPath'), async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      await integrityWatchdogService.clearBreach(projectPath);
      const status = await integrityWatchdogService.getStatus(projectPath);

      logger.info(`Cleared integrity breach for ${projectPath}`);
      res.json({ success: true, ...status });
    } catch (error) {
      logger.error('Failed to clear integrity breach:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // POST /status - Get integrity status for a project
  router.post('/status', validatePathParams('projectPath'), async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const status = await integrityWatchdogService.getStatus(projectPath);
      res.json({ success: true, ...status });
    } catch (error) {
      logger.error('Failed to get integrity status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
