/**
 * OrphanedWorktreeCheck - Detects worktrees without a corresponding feature.
 *
 * Scans the .worktrees/ directory for subdirectories that do not match any
 * active feature's branchName. A worktree is only flagged as orphaned after
 * confirming it has no uncommitted changes and its branch has been merged.
 *
 * Auto-fix: remove the worktree via 'git worktree remove --force'.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { createLogger } from '@protolabsai/utils';
import * as secureFs from '../../../lib/secure-fs.js';
import type { Dirent } from 'fs';
import type { FeatureLoader } from '../../feature-loader.js';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';

const logger = createLogger('OrphanedWorktreeCheck');

type ExecAsync = (
  command: string,
  options?: { cwd?: string }
) => Promise<{ stdout: string; stderr: string }>;

type ReaddirFn = (dir: string, options: { withFileTypes: true }) => Promise<Dirent[]>;

type RmFn = (dirPath: string, options: { recursive: boolean; force: boolean }) => Promise<void>;

const defaultExecAsync = promisify(exec) as ExecAsync;

export interface OrphanedWorktreeCheckDeps {
  execAsync?: ExecAsync;
  readdirFn?: ReaddirFn;
  rmFn?: RmFn;
}

export class OrphanedWorktreeCheck implements MaintenanceCheck {
  readonly id = 'orphaned-worktree';

  private readonly execAsync: ExecAsync;
  private readonly readdirFn: ReaddirFn;
  private readonly rmFn: RmFn;

  constructor(
    private readonly featureLoader: FeatureLoader,
    deps: OrphanedWorktreeCheckDeps = {}
  ) {
    this.execAsync = deps.execAsync ?? defaultExecAsync;
    this.readdirFn = deps.readdirFn ?? (secureFs.readdir as unknown as ReaddirFn);
    this.rmFn = deps.rmFn ?? (secureFs.rm as unknown as RmFn);
  }

  async run(projectPath: string): Promise<MaintenanceIssue[]> {
    const issues: MaintenanceIssue[] = [];

    try {
      const worktreesDir = path.join(projectPath, '.worktrees');
      let worktreeDirs: string[] = [];

      try {
        const entries = await this.readdirFn(worktreesDir, { withFileTypes: true });
        worktreeDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
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
      await this.execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: projectPath });
      logger.info(`Removed orphaned worktree: ${worktreePath}`);
    } catch (error) {
      logger.warn(`git worktree remove failed, trying manual cleanup: ${error}`);

      try {
        await this.rmFn(worktreePath, { recursive: true, force: true });
        await this.execAsync('git worktree prune', { cwd: projectPath });
        logger.info(`Manually cleaned up orphaned worktree: ${worktreePath}`);
      } catch (cleanupError) {
        logger.error(`Failed to clean up orphaned worktree: ${cleanupError}`);
        throw cleanupError;
      }
    }
  }

  private async isWorktreeOrphaned(worktreePath: string): Promise<boolean> {
    try {
      const { stdout } = await this.execAsync('git status --porcelain', { cwd: worktreePath });
      if (stdout.trim()) return false;

      const { stdout: branchStdout } = await this.execAsync('git branch --show-current', {
        cwd: worktreePath,
      });
      const branch = branchStdout.trim();

      if (!branch) return true; // Detached HEAD

      try {
        await this.execAsync(`git merge-base --is-ancestor ${branch} main`, {
          cwd: worktreePath,
        });
        return true;
      } catch {
        try {
          await this.execAsync(`git merge-base --is-ancestor ${branch} master`, {
            cwd: worktreePath,
          });
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
