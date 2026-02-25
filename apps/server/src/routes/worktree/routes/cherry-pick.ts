/**
 * POST /api/worktree/cherry-pick endpoint
 * Cherry-picks one or more commits into a worktree
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { cherryPickService } from '../../../services/cherry-pick-service.js';

export function createCherryPickHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, commits } = req.body as {
        worktreePath: string;
        commits: string[];
      };

      if (!worktreePath) {
        res.status(400).json({ success: false, error: 'worktreePath required' });
        return;
      }

      if (!Array.isArray(commits) || commits.length === 0) {
        res
          .status(400)
          .json({ success: false, error: 'commits array required and must be non-empty' });
        return;
      }

      try {
        cherryPickService.validateCommits(commits);
      } catch (validationError) {
        res.status(400).json({ success: false, error: getErrorMessage(validationError) });
        return;
      }

      await cherryPickService.cherryPick(worktreePath, commits);
      res.json({ success: true, cherryPicked: commits });
    } catch (error) {
      logError(error, 'Cherry-pick failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
