/**
 * Reopen Beads task route handler
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { BeadsService } from '../../../services/beads-service.js';

const logger = createLogger('BeadsRoutes:Reopen');

export function createReopenHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, taskId } = req.body as {
        projectPath: string;
        taskId: string;
      };

      if (!taskId) {
        res.status(400).json({ error: 'taskId is required' });
        return;
      }

      const result = await beadsService.reopenTask(projectPath, taskId);

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to reopen Beads task:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to reopen task',
      });
    }
  };
}
