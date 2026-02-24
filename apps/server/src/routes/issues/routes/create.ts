/**
 * POST /api/issues/create - Manually trigger issue creation for a feature
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { EventEmitter } from '../../../lib/events.js';

const logger = createLogger('IssuesRoutes:Create');

export function createManualIssueHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      // Emit the permanently-blocked event to trigger issue creation pipeline
      events.emit('feature:permanently-blocked', {
        projectPath,
        featureId,
        retryCount: 0,
        lastError: 'Manually triggered issue creation',
        failureCategory: 'unknown',
      });

      res.json({
        success: true,
        message: 'Issue creation triggered. Check GitHub for the new issue.',
      });
    } catch (error) {
      logger.error('Manual issue creation failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create issue',
      });
    }
  };
}
