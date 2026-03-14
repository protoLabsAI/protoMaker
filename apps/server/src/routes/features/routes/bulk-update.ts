/**
 * POST /bulk-update endpoint - Update multiple features at once
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { Feature } from '@protolabsai/types';
import { getErrorMessage, logError } from '../common.js';

export const BulkUpdateRequestSchema = z.object({
  projectPath: z.string().min(1, 'projectPath is required'),
  featureIds: z.array(z.string()).min(1, 'featureIds must be a non-empty array'),
  updates: z.custom<Partial<Feature>>(
    (val): val is Partial<Feature> =>
      val !== null && typeof val === 'object' && Object.keys(val as object).length > 0,
    'updates must be a non-empty object'
  ),
});

interface BulkUpdateResult {
  featureId: string;
  success: boolean;
  error?: string;
}

export function createBulkUpdateHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureIds, updates }: z.infer<typeof BulkUpdateRequestSchema> =
        req.body;

      const results: BulkUpdateResult[] = [];
      const updatedFeatures: Feature[] = [];

      // Process in parallel batches of 20 for efficiency
      const BATCH_SIZE = 20;
      for (let i = 0; i < featureIds.length; i += BATCH_SIZE) {
        const batch = featureIds.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (featureId) => {
            try {
              const updated = await featureLoader.update(projectPath, featureId, updates);
              return { featureId, success: true as const, feature: updated };
            } catch (error) {
              return {
                featureId,
                success: false as const,
                error: getErrorMessage(error),
              };
            }
          })
        );

        for (const result of batchResults) {
          if (result.success) {
            results.push({ featureId: result.featureId, success: true });
            updatedFeatures.push(result.feature);
          } else {
            results.push({
              featureId: result.featureId,
              success: false,
              error: result.error,
            });
          }
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      res.json({
        success: failureCount === 0,
        updatedCount: successCount,
        failedCount: failureCount,
        results,
        features: updatedFeatures,
      });
    } catch (error) {
      logError(error, 'Bulk update features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
