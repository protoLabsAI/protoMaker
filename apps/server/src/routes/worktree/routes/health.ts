/**
 * POST /health endpoint - Worktree health check
 *
 * Returns worktree drift statistics:
 * - Registered worktrees (in git)
 * - On-disk worktrees (in filesystem)
 * - Phantom worktrees (in git but missing from disk)
 * - Orphan worktrees (on disk but not in git)
 * - Healthy worktrees (both registered and exist)
 */

import type { Request, Response } from 'express';
import type { WorktreeLifecycleService } from '../../../services/worktree-lifecycle-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createHealthHandler(worktreeLifecycleService: WorktreeLifecycleService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      const health = await worktreeLifecycleService.getHealth(projectPath);

      res.json({
        success: true,
        health,
      });
    } catch (error) {
      logError(error, 'Worktree health check failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
