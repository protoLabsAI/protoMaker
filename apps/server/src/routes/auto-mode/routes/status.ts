/**
 * POST /status endpoint - Get auto mode status
 *
 * If projectPath is provided, returns per-project status including autoloop state.
 * If no projectPath, returns global status for backward compatibility.
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { MAX_SYSTEM_CONCURRENCY } from '@protolabsai/types';
import { getErrorMessage, logError } from '../common.js';

export function createStatusHandler(
  autoModeService: AutoModeService,
  settingsService?: SettingsService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, branchName } = req.body as {
        projectPath?: string;
        branchName?: string | null;
      };

      // Resolve effective system max concurrency: prefer UI-set value from settings,
      // fall back to env var value (MAX_SYSTEM_CONCURRENCY)
      let effectiveSystemMax = MAX_SYSTEM_CONCURRENCY;
      if (settingsService) {
        const settings = await settingsService.getGlobalSettings();
        effectiveSystemMax = settings.systemMaxConcurrency ?? MAX_SYSTEM_CONCURRENCY;
      }

      // If projectPath is provided, return per-project/worktree status
      if (projectPath) {
        // Normalize branchName: undefined becomes null
        const normalizedBranchName = branchName ?? null;
        const projectStatus = autoModeService.getStatusForProject(
          projectPath,
          normalizedBranchName
        );
        res.json({
          success: true,
          isRunning: projectStatus.isAutoLoopRunning,
          isAutoLoopRunning: projectStatus.isAutoLoopRunning,
          runningFeatures: projectStatus.runningFeatures,
          runningCount: projectStatus.runningCount,
          maxConcurrency: projectStatus.maxConcurrency,
          systemMaxConcurrency: effectiveSystemMax,
          projectPath,
          branchName: normalizedBranchName,
        });
        return;
      }

      // Fall back to global status for backward compatibility
      const status = autoModeService.getStatus();
      const activeProjects = autoModeService.getActiveAutoLoopProjects();
      const activeWorktrees = autoModeService.getActiveAutoLoopWorktrees();
      res.json({
        success: true,
        ...status,
        activeAutoLoopProjects: activeProjects,
        activeAutoLoopWorktrees: activeWorktrees,
        systemMaxConcurrency: effectiveSystemMax,
      });
    } catch (error) {
      logError(error, 'Get status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
