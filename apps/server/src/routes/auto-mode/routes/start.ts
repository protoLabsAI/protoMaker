/**
 * POST /start endpoint - Start auto mode loop for a project
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { createLogger } from '@protolabsai/utils';
import { getErrorMessage, logError } from '../common.js';
import { projectPathSchema } from '../../../lib/validation.js';

const logger = createLogger('AutoMode');

const startAutoModeBodySchema = z.object({
  projectPath: projectPathSchema,
  branchName: z.string().nullable().optional(),
  maxConcurrency: z.number().int().min(1).max(20).optional(),
  forceStart: z.boolean().optional(),
});

export function createStartHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = startAutoModeBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.issues,
        });
        return;
      }
      const { projectPath, branchName, maxConcurrency, forceStart } = parsed.data;

      // Normalize branchName: undefined becomes null
      const normalizedBranchName = branchName ?? null;
      const worktreeDesc = normalizedBranchName
        ? `worktree ${normalizedBranchName}`
        : 'main worktree';

      // Check if already running
      if (autoModeService.isAutoLoopRunningForProject(projectPath, normalizedBranchName)) {
        res.json({
          success: true,
          message: `Auto mode is already running for ${worktreeDesc}`,
          alreadyRunning: true,
          branchName: normalizedBranchName,
        });
        return;
      }

      // Start the auto loop for this project/worktree
      const resolvedMaxConcurrency = await autoModeService.startAutoLoopForProject(
        projectPath,
        normalizedBranchName,
        maxConcurrency,
        forceStart ?? false
      );

      logger.info(
        `Started auto loop for ${worktreeDesc} in project: ${projectPath} with maxConcurrency: ${resolvedMaxConcurrency}`
      );

      res.json({
        success: true,
        message: `Auto mode started with max ${resolvedMaxConcurrency} concurrent features`,
        branchName: normalizedBranchName,
      });
    } catch (error) {
      logError(error, 'Start auto mode failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
