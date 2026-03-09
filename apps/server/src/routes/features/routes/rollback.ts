/**
 * POST /rollback endpoint - Rollback a deployed feature
 *
 * Body: { featureId: string, projectPath: string }
 * Finds the feature's merge commit, reverts it, and moves the feature back to review.
 */

import { execSync } from 'child_process';
import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('features/rollback');

export function createRollbackHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureId, projectPath } = req.body as {
        featureId: unknown;
        projectPath: unknown;
      };

      if (typeof featureId !== 'string' || featureId.trim().length === 0) {
        res.status(400).json({ success: false, error: 'featureId must be a non-empty string' });
        return;
      }

      if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
        res.status(400).json({ success: false, error: 'projectPath must be a non-empty string' });
        return;
      }

      const feature = await featureLoader.get(projectPath, featureId);
      if (!feature) {
        res.status(404).json({ success: false, error: `Feature not found: ${featureId}` });
        return;
      }

      const { prNumber, prMergedAt } = feature;
      if (!prNumber || !prMergedAt) {
        res.status(400).json({
          success: false,
          error: 'Feature has no merged PR — cannot determine merge commit to revert',
        });
        return;
      }

      // Find the merge commit for this PR by searching the git log
      let mergeCommit: string;
      try {
        const logOutput = execSync(
          `git log --oneline --merges --grep="Merge pull request #${prNumber} " HEAD`,
          { cwd: projectPath, encoding: 'utf-8', timeout: 30_000 }
        ).trim();

        if (!logOutput) {
          res.status(404).json({
            success: false,
            error: `Merge commit for PR #${prNumber} not found in git log`,
          });
          return;
        }

        // First token on the first line is the abbreviated commit SHA
        mergeCommit = logOutput.split('\n')[0].split(' ')[0];
      } catch (gitError) {
        const msg = gitError instanceof Error ? gitError.message : String(gitError);
        logger.error(`Failed to find merge commit for PR #${prNumber}:`, gitError);
        res.status(500).json({ success: false, error: `Git log failed: ${msg}` });
        return;
      }

      // Execute git revert of the merge commit (preserving mainline parent)
      try {
        execSync(`git revert -m 1 --no-edit ${mergeCommit}`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 60_000,
        });
        logger.info(
          `Reverted merge commit ${mergeCommit} for feature ${featureId} (PR #${prNumber})`
        );
      } catch (revertError) {
        const msg = revertError instanceof Error ? revertError.message : String(revertError);
        logger.error(`git revert failed for commit ${mergeCommit}:`, revertError);
        res.status(500).json({ success: false, error: `Git revert failed: ${msg}` });
        return;
      }

      // Move feature back to review with rollback reason
      const updated = await featureLoader.update(projectPath, featureId, {
        status: 'review',
        statusChangeReason: 'Rolled back due to health degradation',
      });

      res.json({
        success: true,
        feature: updated,
        mergeCommit,
        message: `Reverted merge commit ${mergeCommit} for PR #${prNumber}. Feature moved back to review.`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Rollback feature failed:', error);
      res.status(500).json({ success: false, error: msg });
    }
  };
}
