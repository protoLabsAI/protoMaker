/**
 * Stop a running GOAP brain loop
 */

import type { Request, Response } from 'express';
import type { GOAPDeps } from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('GOAPRoutes:Stop');

export function createStopGOAPLoopHandler({ goapLoopService }: GOAPDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ error: 'Missing required parameter: projectPath' });
        return;
      }

      logger.info('Stopping GOAP loop', { projectPath });
      await goapLoopService.stopLoop(projectPath);

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to stop GOAP loop', { error });
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to stop GOAP loop',
      });
    }
  };
}
