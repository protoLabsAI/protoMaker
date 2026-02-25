/**
 * POST /api/worktree/stash-drop endpoint
 * Drops (removes) a specific stash entry from a worktree
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { stashService } from '../../../services/stash-service.js';

export function createStashDropHandler() {
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

      await stashService.drop(worktreePath, stashRef);
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Stash drop failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
