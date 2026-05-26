/**
 * POST /query endpoint — compound filters over features
 *
 * Supports filtering by: status, category, assignee
 * All filters are AND-combined.  Omitted filters are ignored.
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import type { Feature } from '@protolabsai/types';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage, logError } from '../common.js';
import { projectPathSchema } from '../../../lib/validation.js';

const queryFeaturesBodySchema = z.object({
  projectPath: projectPathSchema,
  status: z.string().optional(),
  category: z.string().optional(),
  assignee: z.string().optional(),
  projectSlug: z.string().optional(),
});

interface QueryRequest {
  projectPath: string;
  status?: string;
  category?: string;
  assignee?: string;
  projectSlug?: string;
}

interface QueryResponse {
  success: boolean;
  features?: Feature[];
  count?: number;
  error?: string;
}

/**
 * Apply compound filters to a feature array.
 */
function applyFilters(features: Feature[], filter: QueryRequest): Feature[] {
  let result = features;

  if (filter.status) {
    result = result.filter((f) => f.status === filter.status);
  }

  if (filter.category) {
    result = result.filter((f) => f.category === filter.category);
  }

  if (filter.assignee !== undefined && filter.assignee !== '') {
    result = result.filter((f) => f.assignee === filter.assignee);
  }

  if (filter.projectSlug) {
    result = result.filter((f) => f.projectSlug === filter.projectSlug);
  }

  return result;
}

export function createQueryHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = queryFeaturesBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.issues,
        });
        return;
      }

      const filter = parsed.data as QueryRequest;
      const { projectPath } = filter;

      let features = await featureLoader.getAll(projectPath);

      // Apply compound filters
      features = applyFilters(features, filter);

      res.json({ success: true, features, count: features.length });
    } catch (error) {
      logError(error, 'Query features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
