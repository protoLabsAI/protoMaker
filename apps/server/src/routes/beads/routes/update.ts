/**
 * Update Beads task route handler
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { BeadsService } from '../../../services/beads-service.js';
import type { UpdateBeadsTaskOptions } from '@protolabs-ai/types';

const logger = createLogger('BeadsRoutes:Update');

export function createUpdateHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, taskId, ...options } = req.body as {
        projectPath: string;
        taskId: string;
      } & UpdateBeadsTaskOptions;

      if (!taskId) {
        res.status(400).json({ error: 'taskId is required' });
        return;
      }

      const result = await beadsService.updateTask(projectPath, taskId, options);

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({ task: result.data });
    } catch (error) {
      logger.error('Failed to update Beads task:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to update task',
      });
    }
  };
}
