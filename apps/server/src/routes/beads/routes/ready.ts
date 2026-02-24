/**
 * Get ready Beads tasks route handler
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { BeadsService } from '../../../services/beads-service.js';

const logger = createLogger('BeadsRoutes:Ready');

export function createReadyHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as {
        projectPath: string;
      };

      const result = await beadsService.getReadyTasks(projectPath);

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({ tasks: result.data });
    } catch (error) {
      logger.error('Failed to get ready Beads tasks:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get ready tasks',
      });
    }
  };
}
