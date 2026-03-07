/**
 * POST /get endpoint - Get a single feature
 */

import type { Request, Response } from 'express';
import type { FeatureStore } from '@protolabsai/types';
import { getErrorMessage, logError } from '../common.js';

export function createGetHandler(featureLoader: FeatureStore) {
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

      const feature = await featureLoader.get(projectPath, featureId);
      if (!feature) {
        res.status(404).json({ success: false, error: 'Feature not found' });
        return;
      }

      res.json({ success: true, feature });
    } catch (error) {
      logError(error, 'Get feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
