/**
 * OrphanedWorktreeCheck - Detects worktrees without a corresponding feature.
 *
 * Scans the .worktrees/ directory for subdirectories that do not match any
 * active feature's branchName. A worktree is only flagged as orphaned after
 * confirming it has no uncommitted changes and its branch has been merged.
 *
 * Auto-fix: remove the worktree via 'git worktree remove --force'.
 */

import { createLogger } from '@protolabsai/utils';
import * as secureFs from '../../../lib/secure-fs.js';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Dirent } from 'fs';
import type { FeatureLoader } from '../../feature-loader.js';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';

const execAsync = promisify(exec);
const logger = createLogger('OrphanedWorktreeCheck');

export class OrphanedWorktreeCheck implements MaintenanceCheck {
  readonly id = 'orphaned-worktree';

  constructor(private readonly featureLoader: FeatureLoader) {}

  async run(projectPath: string): Promise<MaintenanceIssue[]> {
    const issues: MaintenanceIssue[] = [];

    try {
      const worktreesDir = path.join(projectPath, '.worktrees');
      let worktreeDirs: string[] = [];

      try {
        const entries = await secureFs.readdir(worktreesDir, { withFileTypes: true });
        worktreeDirs = (entries as Dirent[])
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
      } catch {
        // No .worktrees directory — nothing to check
        return issues;
      }

      const features = await this.featureLoader.getAll(projectPath);
      const featureBranches = new Set(
        features.filter((f) => f.branchName).map((f) => f.branchName!.replace(/^feature\//, ''))
      );

      for (const worktreeDir of worktreeDirs) {
        if (worktreeDir === 'main' || worktreeDir === 'master') continue;

        const hasFeature = Array.from(featureBranches).some(
          (branch) => worktreeDir.includes(branch) || branch.includes(worktreeDir)
        );

        if (!hasFeature) {
          const worktreePath = path.join(worktreesDir, worktreeDir);
          const isOrphaned = await this.isWorktreeOrphaned(worktreePath);

          if (isOrphaned) {
            issues.push({
              checkId: this.id,
              severity: 'info',
              message: `Worktree "${worktreeDir}" has no corresponding feature`,
              autoFixable: true,
              fixDescription: 'Remove worktree via git worktree remove',
              context: { worktreePath, worktreeDir, projectPath },
            });
          }
        }
      }
    } catch (error) {
      logger.error(`OrphanedWorktreeCheck failed for ${projectPath}:`, error);
    }

    return issues;
  }

  async fix(projectPath: string, issue: MaintenanceIssue): Promise<void> {
    const worktreePath = issue.context?.worktreePath as string | undefined;
    if (!worktreePath) return;

    logger.info(`Removing orphaned worktree: ${worktreePath}`);

    try {
      await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: projectPath });
      logger.info(`Removed orphaned worktree: ${worktreePath}`);
    } catch (error) {
      logger.warn(`git worktree remove failed, trying manual cleanup: ${error}`);

      try {
        await secureFs.rm(worktreePath, { recursive: true, force: true });
        await execAsync('git worktree prune', { cwd: projectPath });
        logger.info(`Manually cleaned up orphaned worktree: ${worktreePath}`);
      } catch (cleanupError) {
        logger.error(`Failed to clean up orphaned worktree: ${cleanupError}`);
        throw cleanupError;
      }
    }
  }

  private async isWorktreeOrphaned(worktreePath: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: worktreePath });
      if (stdout.trim()) return false;

      const { stdout: branchStdout } = await execAsync('git branch --show-current', {
        cwd: worktreePath,
      });
      const branch = branchStdout.trim();

      if (!branch) return true; // Detached HEAD

      try {
        await execAsync(`git merge-base --is-ancestor ${branch} main`, { cwd: worktreePath });
        return true;
      } catch {
        try {
          await execAsync(`git merge-base --is-ancestor ${branch} master`, { cwd: worktreePath });
          return true;
        } catch {
          return false;
        }
      }
    } catch {
      return false;
    }
  }
}
