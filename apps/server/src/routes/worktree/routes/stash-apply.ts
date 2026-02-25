/**
 * POST /api/worktree/stash-apply endpoint
 * Applies a stash to the worktree without removing it from the stash list
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { stashService } from '../../../services/stash-service.js';

export function createStashApplyHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, stashRef } = req.body as {
        worktreePath: string;
        stashRef: string;
      };

      if (!worktreePath || !stashRef) {
        res.status(400).json({ success: false, error: 'worktreePath and stashRef required' });
        return;
      }

      await stashService.apply(worktreePath, stashRef);
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Stash apply failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
