/**
 * List all running GOAP brain loops
 */

import type { Request, Response } from 'express';
import type { GOAPDeps } from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('GOAPRoutes:List');

export function createListGOAPLoopsHandler({ goapLoopService }: GOAPDeps) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const loops = goapLoopService.listRunningLoops();
      res.json({ success: true, loops });
    } catch (error) {
      logger.error('Failed to list GOAP loops', { error });
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list GOAP loops',
      });
    }
  };
}
