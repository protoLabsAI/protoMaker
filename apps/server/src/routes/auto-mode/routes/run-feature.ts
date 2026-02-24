/**
 * POST /run-feature endpoint - Run a single feature
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import {
  areDependenciesSatisfied,
  getBlockingDependencies,
} from '@protolabs-ai/dependency-resolver';
import { createLogger } from '@protolabs-ai/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('AutoMode');

export function createRunFeatureHandler(
  autoModeService: AutoModeService,
  featureLoader: FeatureLoader
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, useWorktrees, force } = req.body as {
        projectPath: string;
        featureId: string;
        useWorktrees?: boolean;
        force?: boolean;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      // Check dependencies before allowing execution (unless force=true)
      if (!force) {
        const feature = await featureLoader.get(projectPath, featureId);
        if (feature && feature.dependencies && feature.dependencies.length > 0) {
          const allFeatures = await featureLoader.getAll(projectPath);
          if (!areDependenciesSatisfied(feature, allFeatures)) {
            const blocking = getBlockingDependencies(feature, allFeatures);
            const blockingNames = blocking.map((depId) => {
              const dep = allFeatures.find((f) => f.id === depId);
              return dep ? `"${dep.title}" (${dep.status})` : depId;
            });
            res.status(409).json({
              success: false,
              error: `Feature has unsatisfied dependencies: ${blockingNames.join(', ')}`,
              details: { blockingDependencies: blocking },
            });
            return;
          }
        }
      }

      // Check per-worktree capacity before starting
      const capacity = await autoModeService.checkWorktreeCapacity(projectPath, featureId);
      if (!capacity.hasCapacity) {
        const worktreeDesc = capacity.branchName
          ? `worktree "${capacity.branchName}"`
          : 'main worktree';
        res.status(429).json({
          success: false,
          error: `Agent limit reached for ${worktreeDesc} (${capacity.currentAgents}/${capacity.maxAgents}). Wait for running tasks to complete or increase the limit.`,
          details: {
            currentAgents: capacity.currentAgents,
            maxAgents: capacity.maxAgents,
            branchName: capacity.branchName,
          },
        });
        return;
      }

      // Start execution in background
      // executeFeature derives workDir from feature.branchName
      autoModeService
        .executeFeature(projectPath, featureId, useWorktrees ?? false, false)
        .catch((error) => {
          logger.error(`Feature ${featureId} error:`, error);
        })
        .finally(() => {
          // Release the starting slot when execution completes (success or error)
          // Note: The feature should be in runningFeatures by this point
        });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Run feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
