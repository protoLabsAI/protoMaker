/**
 * Pause a running GOAP brain loop
 */

import type { Request, Response } from 'express';
import type { GOAPDeps } from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('GOAPRoutes:Pause');

export function createPauseGOAPLoopHandler({ goapLoopService }: GOAPDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ error: 'Missing required parameter: projectPath' });
        return;
      }

      logger.info('Pausing GOAP loop', { projectPath });
      await goapLoopService.pauseLoop(projectPath);

      res.json({ success: true, status: goapLoopService.getStatus(projectPath) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to pause GOAP loop';
      const isClientError = message.includes('No running') || message.includes('No GOAP loop');
      const status = isClientError ? 409 : 500;
      if (!isClientError) logger.error('Failed to pause GOAP loop', { error });
      res.status(status).json({ error: message });
    }
  };
}
