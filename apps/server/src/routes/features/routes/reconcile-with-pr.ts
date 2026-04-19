/**
 * POST /features/reconcile-with-pr
 *
 * Manual reconciliation: link a feature to a specific PR and mark it done.
 * Used when a feature shipped via an out-of-band PR (cherry-pick, re-cut branch,
 * manual fix) that was never linked to the feature's prNumber/branchName fields.
 *
 * Verifies that the PR is actually merged before marking the feature done.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { promisify } from 'util';
import { exec } from 'child_process';
import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import { getErrorMessage } from '../common.js';

const execAsync = promisify(exec);
const logger = createLogger('features/reconcile-with-pr');

export const ReconcileWithPrRequestSchema = z.object({
  projectPath: z.string().min(1, 'projectPath is required'),
  featureId: z.string().min(1, 'featureId is required'),
  prNumber: z.number().int().positive('prNumber must be a positive integer'),
});

export function createReconcileWithPrHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    const parsed = ReconcileWithPrRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parsed.error.issues,
      });
      return;
    }

    const { projectPath, featureId, prNumber } = parsed.data;

    try {
      // Verify the feature exists
      const feature = await featureLoader.get(projectPath, featureId);
      if (!feature) {
        res.status(404).json({
          success: false,
          error: `Feature ${featureId} not found in project ${projectPath}`,
        });
        return;
      }

      // Verify the PR is merged via gh
      let prState: string;
      let prMergedAt: string | undefined;
      let prTitle: string | undefined;
      let prHeadRef: string | undefined;

      try {
        const { stdout } = await execAsync(
          `gh pr view ${prNumber} --json state,mergedAt,title,headRefName`,
          { cwd: projectPath, timeout: 15000 }
        );
        const prData: {
          state: string;
          mergedAt?: string;
          title?: string;
          headRefName?: string;
        } = JSON.parse(stdout);
        prState = prData.state;
        prMergedAt = prData.mergedAt;
        prTitle = prData.title;
        prHeadRef = prData.headRefName;
      } catch (err) {
        res.status(422).json({
          success: false,
          error: `Could not fetch PR #${prNumber} — is GITHUB_TOKEN set and does the PR exist? (${getErrorMessage(err)})`,
        });
        return;
      }

      if (prState !== 'MERGED') {
        res.status(422).json({
          success: false,
          error: `PR #${prNumber} is not merged (current state: ${prState}). Only merged PRs can reconcile a feature to done.`,
          prState,
        });
        return;
      }

      const mergedAt = prMergedAt ?? new Date().toISOString();
      const reason = `Manually reconciled with merged PR #${prNumber}${prTitle ? ` — "${prTitle}"` : ''}`;

      const updates: Partial<Feature> = {
        status: 'done',
        prNumber,
        prMergedAt: mergedAt,
        statusChangeReason: reason,
      };

      // If feature had no branch set and the PR has a head ref, backfill it
      if (!feature.branchName && prHeadRef) {
        updates.branchName = prHeadRef;
      }

      const updated = await featureLoader.update(projectPath, featureId, updates);

      logger.info(
        `[reconcile-with-pr] Feature ${featureId} ("${feature.title}") reconciled to done via PR #${prNumber} ("${prTitle}")`
      );

      res.json({
        success: true,
        feature: updated,
        reconciled: {
          prNumber,
          prTitle,
          prMergedAt: mergedAt,
          previousStatus: feature.status,
        },
      });
    } catch (error) {
      logger.error('reconcile-with-pr failed:', error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
