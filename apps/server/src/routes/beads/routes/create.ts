/**
 * Create Beads task route handler
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { BeadsService } from '../../../services/beads-service.js';
import type { CreateBeadsTaskOptions } from '@protolabs-ai/types';

const logger = createLogger('BeadsRoutes:Create');

export function createCreateHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, ...options } = req.body as {
        projectPath: string;
      } & CreateBeadsTaskOptions;

      if (!options.title) {
        res.status(400).json({ error: 'title is required' });
        return;
      }

      const result = await beadsService.createTask(projectPath, options);

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.status(201).json({ task: result.data });
    } catch (error) {
      logger.error('Failed to create Beads task:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create task',
      });
    }
  };
}
