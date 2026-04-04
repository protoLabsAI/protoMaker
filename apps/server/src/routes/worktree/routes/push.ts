/**
 * POST /push endpoint - Push a worktree branch to remote
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';
import { isValidRemoteName, isValidBranchName } from '@protolabsai/platform';

const execAsync = promisify(exec);

export function createPushHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, force, remote } = req.body as {
        worktreePath: string;
        force?: boolean;
        remote?: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Get branch name
      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const branchName = branchOutput.trim();

      // Validate branch name
      if (!isValidBranchName(branchName)) {
        res.status(400).json({
          success: false,
          error: `Invalid branch name: "${branchName}"`,
        });
        return;
      }

      // Use specified remote or default to 'origin'
      const targetRemote = remote || 'origin';

      // Validate remote name
      if (!isValidRemoteName(targetRemote)) {
        res.status(400).json({
          success: false,
          error: `Invalid remote name: "${targetRemote}"`,
        });
        return;
      }

      // Push the branch.
      // --no-verify skips pre-push hooks (e.g. turbo build) that fail in worktrees
      // due to symlinked node_modules. CI is the verification layer for worktree pushes.
      const forceFlag = force ? '--force' : '';
      const worktreeEnv = { ...process.env, HUSKY: '0' };
      try {
        await execAsync(`git push --no-verify -u ${targetRemote} ${branchName} ${forceFlag}`, {
          cwd: worktreePath,
          env: worktreeEnv,
        });
      } catch {
        // Try setting upstream
        await execAsync(
          `git push --no-verify --set-upstream ${targetRemote} ${branchName} ${forceFlag}`,
          {
            cwd: worktreePath,
            env: worktreeEnv,
          }
        );
      }

      res.json({
        success: true,
        result: {
          branch: branchName,
          pushed: true,
          message: `Successfully pushed ${branchName} to ${targetRemote}`,
        },
      });
    } catch (error) {
      logError(error, 'Push worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
