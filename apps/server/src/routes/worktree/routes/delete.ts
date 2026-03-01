/**
 * POST /delete endpoint - Delete a git worktree
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { isGitRepo } from '@protolabs-ai/git-utils';
import { getErrorMessage, logError, isValidBranchName, execGitCommand } from '../common.js';
import { createLogger } from '@protolabs-ai/utils';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';

const execAsync = promisify(exec);
const logger = createLogger('Worktree');

export function createDeleteHandler(
  autoModeService?: AutoModeService,
  featureLoader?: FeatureLoader
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, worktreePath, deleteBranch } = req.body as {
        projectPath: string;
        worktreePath: string;
        deleteBranch?: boolean; // Whether to also delete the branch
      };

      if (!projectPath || !worktreePath) {
        res.status(400).json({
          success: false,
          error: 'projectPath and worktreePath required',
        });
        return;
      }

      if (!(await isGitRepo(projectPath))) {
        res.status(400).json({
          success: false,
          error: 'Not a git repository',
        });
        return;
      }

      // CRITICAL SAFETY CHECK: Prevent deletion of worktrees with running agents
      // If Claude Code's Bash tool cd's into a worktree and that worktree is deleted,
      // Bash permanently breaks for the session. This is a platform limitation we must guard against.
      if (autoModeService) {
        const runningAgents = await autoModeService.getRunningAgents();
        const worktreeName = worktreePath.split('/').pop() || '';

        const hasRunningAgent = runningAgents.some((agent) => {
          if (agent.projectPath !== projectPath) return false;
          if (!agent.branchName) return false;

          const agentWorktreeName = agent.branchName.replace(/\//g, '-');
          return agentWorktreeName === worktreeName;
        });

        if (hasRunningAgent) {
          res.status(409).json({
            success: false,
            error:
              'Cannot delete worktree: an agent is currently running in this worktree. Stop the agent first.',
          });
          return;
        }
      }

      // Get branch name before removing worktree
      let branchName: string | null = null;
      try {
        const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
          cwd: worktreePath,
        });
        branchName = stdout.trim();
      } catch {
        // Could not get branch name
      }

      // Remove the worktree (using array arguments to prevent injection)
      try {
        await execGitCommand(['worktree', 'remove', worktreePath, '--force'], projectPath);
      } catch (_error) {
        // Try with prune if remove fails
        await execGitCommand(['worktree', 'prune'], projectPath);
      }

      // Optionally delete the branch
      let branchDeleted = false;
      if (deleteBranch && branchName && branchName !== 'main' && branchName !== 'master') {
        // Validate branch name to prevent command injection
        if (!isValidBranchName(branchName)) {
          logger.warn(`Invalid branch name detected, skipping deletion: ${branchName}`);
        } else {
          try {
            await execGitCommand(['branch', '-D', branchName], projectPath);
            branchDeleted = true;
          } catch {
            // Branch deletion failed, not critical
            logger.warn(`Failed to delete branch: ${branchName}`);
          }
        }
      }

      // Migrate features referencing the deleted branch back to main (branchName: null)
      let featuresMovedToMain = 0;
      if (featureLoader && branchName) {
        try {
          const features = await featureLoader.getAll(projectPath);
          const orphanedFeatures = features.filter((f) => f.branchName === branchName);

          for (const feature of orphanedFeatures) {
            await featureLoader.update(projectPath, feature.id, { branchName: undefined });
          }

          featuresMovedToMain = orphanedFeatures.length;
          if (featuresMovedToMain > 0) {
            logger.info(
              `Migrated ${featuresMovedToMain} feature(s) from deleted branch "${branchName}" back to main worktree`
            );
          }
        } catch (migrationError) {
          // Feature migration errors must not block worktree deletion
          logger.warn(
            `Failed to migrate features for deleted branch "${branchName}":`,
            migrationError
          );
        }
      }

      res.json({
        success: true,
        deleted: {
          worktreePath,
          branch: branchDeleted ? branchName : null,
          branchDeleted,
        },
        featuresMovedToMain,
      });
    } catch (error) {
      logError(error, 'Delete worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
