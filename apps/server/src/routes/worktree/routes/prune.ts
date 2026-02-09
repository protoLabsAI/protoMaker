/**
 * POST /prune endpoint - Manual worktree prune
 *
 * Runs git worktree prune to remove phantom worktrees
 * (registered in git but directories missing).
 *
 * Safe operation - only removes metadata, doesn't delete directories.
 */

import type { Request, Response } from 'express';
import type { WorktreeLifecycleService } from '../../../services/worktree-lifecycle-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createPruneHandler(worktreeLifecycleService: WorktreeLifecycleService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      // Prune phantom worktrees
      await worktreeLifecycleService.prunePhantomWorktrees(projectPath);

      // Get updated health stats
      const health = await worktreeLifecycleService.getHealth(projectPath);

      res.json({
        success: true,
        message: 'Phantom worktrees pruned successfully',
        health,
      });
    } catch (error) {
      logError(error, 'Worktree prune failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
