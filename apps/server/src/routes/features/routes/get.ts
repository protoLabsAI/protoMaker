/**
 * POST /get endpoint - Get a single feature
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError } from '../common.js';
import { projectPathSchema, featureIdSchema } from '../../../lib/validation.js';

const getFeatureBodySchema = z.object({
  projectPath: projectPathSchema,
  featureId: featureIdSchema,
});

export function createGetHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = getFeatureBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.issues,
        });
        return;
      }
      const { projectPath, featureId } = parsed.data;

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
