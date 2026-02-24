/**
 * Add dependency between Beads tasks route handler
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { BeadsService } from '../../../services/beads-service.js';

const logger = createLogger('BeadsRoutes:AddDependency');

export function createAddDependencyHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, taskId, dependsOn } = req.body as {
        projectPath: string;
        taskId: string;
        dependsOn: string;
      };

      if (!taskId || !dependsOn) {
        res.status(400).json({ error: 'taskId and dependsOn are required' });
        return;
      }

      const result = await beadsService.addDependency(projectPath, taskId, dependsOn);

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to add Beads dependency:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to add dependency',
      });
    }
  };
}
