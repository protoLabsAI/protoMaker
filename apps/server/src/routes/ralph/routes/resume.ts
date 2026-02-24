/**
 * Resume a paused Ralph loop
 */

import type { Request, Response } from 'express';
import type { RalphDeps } from '../common.js';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('RalphRoutes:Resume');

export function createResumeRalphLoopHandler({ ralphLoopService }: RalphDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          error: 'Missing required parameters: projectPath and featureId are required',
        });
        return;
      }

      logger.info('Resuming Ralph loop', { projectPath, featureId });

      const state = await ralphLoopService.resumeLoop(projectPath, featureId);

      if (!state) {
        res.status(404).json({
          error: 'Ralph loop not found or not paused',
        });
        return;
      }

      res.json({ success: true, state });
    } catch (error) {
      logger.error('Failed to resume Ralph loop', { error });
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to resume Ralph loop',
      });
    }
  };
}
