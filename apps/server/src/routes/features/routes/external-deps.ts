/**
 * External (cross-repo) dependency routes
 *
 * POST /api/features/external-deps/flag
 *   Record a cross-repo dependency on a feature.
 *
 * POST /api/features/external-deps/resolve
 *   Mark an external dependency as satisfied and unblock waiting features.
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import type { ExternalDependency } from '@protolabsai/types';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { createLogger } from '@protolabsai/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('features/external-deps');

const FlagBodySchema = z.object({
  projectPath: z.string().min(1),
  featureId: z.string().min(1),
  dependencyAppPath: z.string().min(1),
  dependencyFeatureId: z.string().min(1),
  description: z.string().min(1),
  dependencyType: z.enum(['api_contract', 'shared_type', 'deployment_order', 'data_migration']),
  prNumber: z.number().optional(),
});

const ResolveBodySchema = z.object({
  projectPath: z.string().min(1),
  featureId: z.string().min(1),
  dependencyAppPath: z.string().min(1),
  dependencyFeatureId: z.string().min(1),
});

export function createFlagExternalDepHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = FlagBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ success: false, error: 'Validation failed', details: parsed.error.issues });
        return;
      }

      const {
        projectPath,
        featureId,
        dependencyAppPath,
        dependencyFeatureId,
        description,
        dependencyType,
        prNumber,
      } = parsed.data;

      const feature = await featureLoader.get(projectPath, featureId);
      if (!feature) {
        res.status(404).json({ success: false, error: 'Feature not found' });
        return;
      }

      const existing = feature.externalDependencies ?? [];

      // Idempotency: skip if an identical dep already exists
      const alreadyExists = existing.some(
        (d) => d.appPath === dependencyAppPath && d.featureId === dependencyFeatureId
      );
      if (alreadyExists) {
        res.json({ success: true, message: 'Dependency already recorded', feature });
        return;
      }

      const newDep: ExternalDependency = {
        appPath: dependencyAppPath,
        featureId: dependencyFeatureId,
        description,
        dependencyType,
        status: 'pending',
      };

      const updatedDeps = [...existing, newDep];
      const updated = await featureLoader.update(projectPath, featureId, {
        externalDependencies: updatedDeps,
        status: 'blocked',
        statusChangeReason: `cross-repo dependency flagged: ${description}${prNumber ? ` (PR #${prNumber})` : ''}`,
      });

      logger.info(
        `[flag] Feature ${featureId} in ${projectPath} now has external dep on ${dependencyFeatureId} in ${dependencyAppPath}`
      );

      res.json({ success: true, feature: updated });
    } catch (error) {
      logError(error, 'flag external dependency failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createResolveExternalDepHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = ResolveBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ success: false, error: 'Validation failed', details: parsed.error.issues });
        return;
      }

      const { projectPath, featureId, dependencyAppPath, dependencyFeatureId } = parsed.data;

      const feature = await featureLoader.get(projectPath, featureId);
      if (!feature) {
        res.status(404).json({ success: false, error: 'Feature not found' });
        return;
      }

      const existing = feature.externalDependencies ?? [];
      const depIndex = existing.findIndex(
        (d) => d.appPath === dependencyAppPath && d.featureId === dependencyFeatureId
      );

      if (depIndex === -1) {
        res
          .status(404)
          .json({ success: false, error: 'External dependency not found on this feature' });
        return;
      }

      const updatedDeps = existing.map((d, i) =>
        i === depIndex ? { ...d, status: 'satisfied' as const } : d
      );

      // If all external deps are now satisfied, unblock the feature
      const allSatisfied = updatedDeps.every((d) => d.status === 'satisfied');
      const updates: Parameters<typeof featureLoader.update>[2] = {
        externalDependencies: updatedDeps,
      };

      if (allSatisfied && feature.status === 'blocked') {
        updates.status = 'backlog';
        updates.statusChangeReason = 'all cross-repo dependencies satisfied';
        logger.info(`[resolve] Feature ${featureId} unblocked — all external deps satisfied`);
      }

      const updated = await featureLoader.update(projectPath, featureId, updates);

      logger.info(
        `[resolve] External dep ${dependencyFeatureId} in ${dependencyAppPath} marked satisfied for feature ${featureId}`
      );

      res.json({ success: true, feature: updated, unblocked: allSatisfied });
    } catch (error) {
      logError(error, 'resolve external dependency failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
