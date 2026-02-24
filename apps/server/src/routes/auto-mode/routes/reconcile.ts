/**
 * Reconcile Feature States Handler
 *
 * On-demand reconciliation of stuck features after server restart.
 * Resets features in transient states (in_progress, interrupted, pipeline_*)
 * that have no running agent back to backlog.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('Reconcile');

interface ReconcileRequest {
  projectPath?: string;
}

export function createReconcileHandler(
  autoModeService: AutoModeService,
  settingsService: SettingsService
) {
  return async (req: Request, res: Response): Promise<void> => {
    const { projectPath } = req.body as ReconcileRequest;

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
