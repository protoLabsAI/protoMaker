/**
 * Resume a paused GOAP brain loop
 */

import type { Request, Response } from 'express';
import type { GOAPDeps } from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('GOAPRoutes:Resume');

export function createResumeGOAPLoopHandler({ goapLoopService }: GOAPDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ error: 'Missing required parameter: projectPath' });
        return;
      }

      logger.info('Resuming GOAP loop', { projectPath });
      await goapLoopService.resumeLoop(projectPath);

      res.json({ success: true, status: goapLoopService.getStatus(projectPath) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resume GOAP loop';
      const isClientError = message.includes('No paused') || message.includes('No GOAP loop');
      const status = isClientError ? 409 : 500;
      if (!isClientError) logger.error('Failed to resume GOAP loop', { error });
      res.status(status).json({ error: message });
    }
  };
}
