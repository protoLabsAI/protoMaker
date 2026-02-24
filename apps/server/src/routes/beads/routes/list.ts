/**
 * List Beads tasks route handler
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { BeadsService } from '../../../services/beads-service.js';
import type { ListBeadsTasksOptions } from '@protolabs-ai/types';

const logger = createLogger('BeadsRoutes:List');

export function createListHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, status, owner, label, limit } = req.body as {
        projectPath: string;
        status?: 'open' | 'closed' | 'all';
        owner?: string;
        label?: string;
        limit?: number;
      };

      const options: ListBeadsTasksOptions = {
        status,
        owner,
        label,
        limit,
      };

      const result = await beadsService.listTasks(projectPath, options);

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({ tasks: result.data });
    } catch (error) {
      logger.error('Failed to list Beads tasks:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list tasks',
      });
    }
  };
}
