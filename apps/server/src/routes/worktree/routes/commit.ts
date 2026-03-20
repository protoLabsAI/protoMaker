/**
 * POST /commit endpoint - Commit changes in a worktree
 *
 * Note: Git repository validation (isGitRepo) is handled by
 * the requireGitRepoOnly middleware in index.ts
 */

import type { Request, Response } from 'express';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { buildGitAddCommand } from '../../../lib/git-staging-utils.js';
import { getErrorMessage, logError } from '../common.js';
import { sanitizeCommitMessage } from '@protolabsai/platform';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export function createCommitHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, message } = req.body as {
        worktreePath: string;
        message: string;
      };

      if (!worktreePath || !message) {
        res.status(400).json({
          success: false,
          error: 'worktreePath and message required',
        });
        return;
      }

      // Check for uncommitted changes
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
      });

      if (!status.trim()) {
        res.json({
          success: true,
          result: {
            committed: false,
            message: 'No changes to commit',
          },
        });
        return;
      }

      // Stage all changes
      await execAsync(buildGitAddCommand(worktreePath), { cwd: worktreePath });

      // Sanitize commit message to prevent injection
      const sanitizedMessage = sanitizeCommitMessage(message);

      // Create commit
      await execFileAsync('git', ['commit', '-m', sanitizedMessage], {
        cwd: worktreePath,
      });

      // Get commit hash
      const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', {
        cwd: worktreePath,
      });
      const commitHash = hashOutput.trim().substring(0, 8);

      // Get branch name
      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const branchName = branchOutput.trim();

      res.json({
        success: true,
        result: {
          committed: true,
          commitHash,
          branch: branchName,
          message,
        },
      });
    } catch (error) {
      logError(error, 'Commit worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
