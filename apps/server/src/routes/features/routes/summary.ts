/**
 * POST /summary endpoint - Board summary with status counts, always read from disk
 */

import type { Request, Response } from 'express';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError } from '../common.js';

export interface BoardSummary {
  total: number;
  backlog: number;
  inProgress: number;
  review: number;
  blocked: number;
  done: number;
  verified: number;
}

export function createSummaryHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Always read from disk to avoid stale in-memory state
      const features = await featureLoader.getAll(projectPath);

      const summary: BoardSummary = {
        total: features.length,
        backlog: 0,
        inProgress: 0,
        review: 0,
        blocked: 0,
        done: 0,
        verified: 0,
      };

      for (const feature of features) {
        switch (feature.status) {
          case 'backlog':
            summary.backlog++;
            break;
          case 'in_progress':
            summary.inProgress++;
            break;
          case 'review':
            summary.review++;
            break;
          case 'blocked':
            summary.blocked++;
            break;
          case 'done':
            summary.done++;
            break;
          case 'verified':
            summary.verified++;
            break;
        }
      }

      res.json({ success: true, summary });
    } catch (error) {
      logError(error, 'Board summary failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
