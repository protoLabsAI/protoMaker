/**
 * List all running Ralph loops
 */

import type { Request, Response } from 'express';
import type { RalphDeps } from '../common.js';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('RalphRoutes:ListRunning');

export function createListRunningRalphLoopsHandler({ ralphLoopService }: RalphDeps) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const runningLoops = ralphLoopService.getRunningLoops();
      res.json({ success: true, runningLoops });
    } catch (error) {
      logger.error('Failed to list running Ralph loops', { error });
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list running Ralph loops',
      });
    }
  };
}
