/**
 * Reconcile Feature States Handler
 *
 * On-demand reconciliation of stuck features after server restart.
 * Resets features in transient states (in_progress, interrupted, pipeline_*)
 * that have no running agent back to backlog.
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { projectPathSchema } from '../../../lib/validation.js';

const logger = createLogger('Reconcile');

const reconcileBodySchema = z.object({
  projectPath: projectPathSchema.optional(),
});

export function createReconcileHandler(
  autoModeService: AutoModeService,
  settingsService: SettingsService
) {
  return async (req: Request, res: Response): Promise<void> => {
    const parsed = reconcileBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parsed.error.issues,
      });
      return;
    }
    const { projectPath } = parsed.data;

    try {
      if (projectPath) {
        // Reconcile single project
        const result = await autoModeService.reconcileFeatureStates(projectPath);
        res.json({
          success: true,
          reconciled: result.reconciled,
          message: `Reconciled ${result.reconciled.length} feature(s)`,
        });
        return;
      }

      // Reconcile all known projects
      const settings = await settingsService.getGlobalSettings();
      const projectPaths = [
        ...(settings.autoModeAlwaysOn?.projects?.map(
          (p: { projectPath: string }) => p.projectPath
        ) ?? []),
      ];
      const uniquePaths = [...new Set(projectPaths)];

      const allReconciled: Array<{
        projectPath: string;
        featureId: string;
        from: string;
        to: string;
      }> = [];

      for (const pp of uniquePaths) {
        try {
          const result = await autoModeService.reconcileFeatureStates(pp);
          for (const r of result.reconciled) {
            allReconciled.push({ projectPath: pp, ...r });
          }
        } catch (error) {
          logger.warn(`Failed to reconcile features for ${pp}:`, error);
        }
      }

      res.json({
        success: true,
        reconciled: allReconciled,
        message: `Reconciled ${allReconciled.length} feature(s) across ${uniquePaths.length} project(s)`,
      });
    } catch (error) {
      logger.error('Error reconciling features:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
