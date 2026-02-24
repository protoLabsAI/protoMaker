/**
 * Start a Ralph loop for a feature
 */

import type { Request, Response } from 'express';
import type { RalphDeps } from '../common.js';
import type { RalphLoopConfig } from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('RalphRoutes:Start');

export function createStartRalphLoopHandler({ ralphLoopService }: RalphDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, config } = req.body as {
        projectPath: string;
        featureId: string;
        config?: Partial<RalphLoopConfig>;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          error: 'Missing required parameters: projectPath and featureId are required',
        });
        return;
      }

      logger.info('Starting Ralph loop', { projectPath, featureId });

      const state = await ralphLoopService.startLoop(projectPath, featureId, config);

      res.json({ success: true, state });
    } catch (error) {
      logger.error('Failed to start Ralph loop', { error });
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to start Ralph loop',
      });
    }
  };
}
