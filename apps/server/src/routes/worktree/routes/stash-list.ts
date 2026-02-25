/**
 * POST /api/worktree/stash-list endpoint
 * Returns structured stash entries for a worktree
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { stashService } from '../../../services/stash-service.js';

export function createStashListHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as { worktreePath: string };

      if (!worktreePath) {
        res.status(400).json({ success: false, error: 'worktreePath required' });
        return;
      }

      const entries = await stashService.list(worktreePath);
      res.json({ success: true, entries });
    } catch (error) {
      logError(error, 'Stash list failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
