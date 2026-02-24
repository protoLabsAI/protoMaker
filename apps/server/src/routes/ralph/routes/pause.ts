/**
 * Pause a running Ralph loop
 */

import type { Request, Response } from 'express';
import type { RalphDeps } from '../common.js';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('RalphRoutes:Pause');

export function createPauseRalphLoopHandler({ ralphLoopService }: RalphDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureId } = req.body as {
        featureId: string;
      };

      if (!featureId) {
        res.status(400).json({
          error: 'Missing required parameter: featureId',
        });
        return;
      }

      logger.info('Pausing Ralph loop', { featureId });

      const state = await ralphLoopService.pauseLoop(featureId);

      if (!state) {
        res.status(404).json({
          error: 'Ralph loop not found or not running',
        });
        return;
      }

      res.json({ success: true, state });
    } catch (error) {
      logger.error('Failed to pause Ralph loop', { error });
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to pause Ralph loop',
      });
    }
  };
}
