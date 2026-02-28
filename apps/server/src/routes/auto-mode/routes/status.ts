/**
 * POST /status endpoint - Get auto mode status
 *
 * If projectPath is provided, returns per-project status including autoloop state.
 * If no projectPath, returns global status for backward compatibility.
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { MAX_SYSTEM_CONCURRENCY } from '@protolabs-ai/types';
import { getErrorMessage, logError } from '../common.js';

export function createStatusHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, branchName } = req.body as {
        projectPath?: string;
        branchName?: string | null;
      };

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
          isRunning: projectStatus.runningCount > 0,
          isAutoLoopRunning: projectStatus.isAutoLoopRunning,
          runningFeatures: projectStatus.runningFeatures,
          runningCount: projectStatus.runningCount,
          maxConcurrency: projectStatus.maxConcurrency,
          systemMaxConcurrency: MAX_SYSTEM_CONCURRENCY,
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
        systemMaxConcurrency: MAX_SYSTEM_CONCURRENCY,
      });
    } catch (error) {
      logError(error, 'Get status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
