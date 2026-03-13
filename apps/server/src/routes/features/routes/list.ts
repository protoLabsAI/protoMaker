/**
 * POST /list endpoint - List all features for a project
 */

import type { Request, Response } from 'express';
import type { Feature, FeatureStatus } from '@protolabsai/types';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError } from '../common.js';
import { debugLog } from '../../../lib/debug-log.js';

interface ListRequest {
  projectPath: string;
  status?: FeatureStatus;
  compact?: boolean;
  projectSlug?: string;
}

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
  assignee?: string | null;
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
    assignee: feature.assignee,
    dependencies: feature.dependencies,
    updatedAt: feature.updatedAt,
  };
}

export function createListHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, status, compact = false, projectSlug } = req.body as ListRequest;

      debugLog('FeaturesAPI', '/list called', { projectPath, status, compact, projectSlug });

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      let features = await featureLoader.getAll(projectPath);

      // Filter by status if provided
      // Normalize hyphenated status values (e.g. "in-progress") to underscore format
      // ("in_progress") to match the canonical FeatureStatus type stored on disk.
      if (status) {
        const normalizedStatus = status.replace(/-/g, '_');
        features = features.filter((f) => f.status === normalizedStatus);
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
