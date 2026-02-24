/**
 * POST /resume-with-feedback endpoint - Resume or restart agent with feedback
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('AgentRoutes');

export function createResumeWithFeedbackHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, feedback } = req.body as {
        projectPath: string;
        featureId: string;
        feedback: string;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (!featureId) {
        res.status(400).json({
          success: false,
          error: 'featureId is required',
        });
        return;
      }

      if (!feedback) {
        res.status(400).json({
          success: false,
          error: 'feedback is required',
        });
        return;
      }

      logger.info(`Resuming feature ${featureId} with feedback`);

      // Start execution in background
      autoModeService.resumeWithFeedback(projectPath, featureId, feedback).catch((error) => {
        logger.error(`Feature ${featureId} resume with feedback error:`, error);
      });

      res.json({ success: true });
    } catch (error) {
      logger.error('Resume with feedback failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  };
}
