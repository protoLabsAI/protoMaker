/**
 * POST /list endpoint - List all features for a project
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import type { Feature, FeatureStatus } from '@protolabsai/types';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError } from '../common.js';
import { debugLog } from '../../../lib/debug-log.js';
import { projectPathSchema } from '../../../lib/validation.js';

const listFeaturesBodySchema = z.object({
  projectPath: projectPathSchema,
  status: z.string().optional(),
  compact: z.boolean().optional().default(false),
  projectSlug: z.string().optional(),
});

interface CompactFeature {
  id: string;
  title?: string;
  status?: FeatureStatus | string;
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  branchName?: string;
  costUsd?: number;
  prNumber?: number;
  prUrl?: string;
  epicId?: string;
  isEpic?: boolean;
  dependencies?: string[];
  updatedAt?: unknown;
}

function toCompactFeature(feature: Feature): CompactFeature {
  return {
    id: feature.id,
    title: feature.title,
    status: feature.status,
    complexity: feature.complexity,
    branchName: feature.branchName,
    costUsd: feature.costUsd,
    prNumber: feature.prNumber,
    prUrl: feature.prUrl,
    epicId: feature.epicId,
    isEpic: feature.isEpic,
    dependencies: feature.dependencies,
    updatedAt: feature.updatedAt,
  };
}

export function createListHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = listFeaturesBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.issues,
        });
        return;
      }
      const { projectPath, status, compact, projectSlug } = parsed.data;

      debugLog('FeaturesAPI', '/list called', { projectPath, status, compact, projectSlug });

      let features = await featureLoader.getAll(projectPath);

      // Filter by status if provided
      if (status) {
        features = features.filter((f) => f.status === status);
      }

      // Filter by projectSlug if provided
      if (projectSlug) {
        features = features.filter((f) => f.projectSlug === projectSlug);
      }

      debugLog('FeaturesAPI', '/list returning', {
        projectPath,
        status,
        compact,
        featureCount: features.length,
      });

      // Return compact format if requested
      if (compact) {
        const compactFeatures = features.map(toCompactFeature);
        res.json({ success: true, features: compactFeatures });
      } else {
        res.json({ success: true, features });
      }
    } catch (error) {
      logError(error, 'List features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
