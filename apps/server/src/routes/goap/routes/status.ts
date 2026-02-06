/**
 * Get GOAP brain loop status for a project
 */

import type { Request, Response } from 'express';
import type { GOAPDeps } from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('GOAPRoutes:Status');

export function createGetGOAPStatusHandler({ goapLoopService }: GOAPDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ error: 'Missing required parameter: projectPath' });
        return;
      }

      const status = goapLoopService.getStatus(projectPath);

      if (!status) {
        res.json({ success: true, status: null, running: false });
        return;
      }

      res.json({ success: true, status, running: status.isRunning });
    } catch (error) {
      logger.error('Failed to get GOAP status', { error });
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get GOAP status',
      });
    }
  };
}
