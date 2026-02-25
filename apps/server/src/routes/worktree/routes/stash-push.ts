/**
 * POST /api/worktree/stash-push endpoint
 * Stashes current changes in a worktree with optional message and file selection
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { stashService } from '../../../services/stash-service.js';

export function createStashPushHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, message, files } = req.body as {
        worktreePath: string;
        message?: string;
        files?: string[];
      };

      if (!worktreePath) {
        res.status(400).json({ success: false, error: 'worktreePath required' });
        return;
      }

      const result = await stashService.push(worktreePath, message, files);
      res.json({ success: true, ref: result.ref });
    } catch (error) {
      logError(error, 'Stash push failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
