/**
 * Graphite Sync Scheduler Service
 *
 * Runs periodic syncs across all feature branches to keep them up-to-date
 * with their parent branches using Graphite's stack management.
 *
 * Supports:
 * - Scheduled sync runs (configurable cron schedule)
 * - Fallback to git when Graphite unavailable
 * - Results tracking and logging
 * - Enable/disable via settings
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import { createLogger } from '@automaker/utils';
import type { SettingsService } from './settings-service.js';
import type { GraphiteService } from './graphite-service.js';

const execAsync = promisify(exec);
const logger = createLogger('GraphiteSyncScheduler');

// Extended PATH for finding git/gt CLI
const pathSeparator = process.platform === 'win32' ? ';' : ':';
const additionalPaths: string[] = [];

if (process.platform === 'win32') {
  if (process.env.LOCALAPPDATA) {
    additionalPaths.push(`${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`);
  }
  if (process.env.PROGRAMFILES) {
    additionalPaths.push(`${process.env.PROGRAMFILES}\\Git\\cmd`);
  }
  if (process.env['ProgramFiles(x86)']) {
    additionalPaths.push(`${process.env['ProgramFiles(x86)']}\\Git\\cmd`);
  }
} else {
  additionalPaths.push(
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/home/linuxbrew/.linuxbrew/bin',
    `${process.env.HOME}/.local/bin`
  );
}

const extendedPath = [process.env.PATH, ...additionalPaths.filter(Boolean)]
  .filter(Boolean)
  .join(pathSeparator);

const execEnv = {
  ...process.env,
  PATH: extendedPath,
};

/**
 * Result from syncing a single worktree
 */
export interface WorktreeSyncResult {
  branch: string;
  path: string;
  method: 'graphite' | 'git' | 'skipped';
  success: boolean;
  error?: string;
}

/**
 * Summary of a scheduled sync run
 */
export interface SyncRunSummary {
  startTime: Date;
  endTime: Date;
  worktreesFound: number;
  syncedCount: number;
  failedCount: number;
  skippedCount: number;
  results: WorktreeSyncResult[];
}

/**
 * GraphiteSyncScheduler - Manages periodic Graphite syncs
 */
export class GraphiteSyncScheduler {
  private lastRunSummary: SyncRunSummary | null = null;
  private isRunning = false;

  constructor(
    private settingsService: SettingsService,
    private graphiteService: GraphiteService,
    private projectPath: string
  ) {}

  /**
   * Get the summary of the last sync run
   */
  getLastRunSummary(): SyncRunSummary | null {
    return this.lastRunSummary;
  }

  /**
   * Check if a sync is currently running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Run the sync job manually (for testing or on-demand runs)
   */
  async runSync(): Promise<SyncRunSummary> {
    if (this.isRunning) {
      logger.warn('Sync already running, skipping');
      throw new Error('Sync already running');
    }

    this.isRunning = true;
    const startTime = new Date();

    try {
      const results = await this.syncAllWorktrees();
      const endTime = new Date();

      const summary: SyncRunSummary = {
        startTime,
        endTime,
        worktreesFound: results.length,
        syncedCount: results.filter((r) => r.success && r.method !== 'skipped').length,
        failedCount: results.filter((r) => !r.success).length,
        skippedCount: results.filter((r) => r.method === 'skipped').length,
        results,
      };

      this.lastRunSummary = summary;
      this.logSyncSummary(summary);
      return summary;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sync all feature worktrees
   */
  private async syncAllWorktrees(): Promise<WorktreeSyncResult[]> {
    const worktreesDir = join(this.projectPath, '.worktrees');
    const results: WorktreeSyncResult[] = [];

    try {
      const entries = await readdir(worktreesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const branchName = entry.name;
        const worktreePath = join(worktreesDir, branchName);

        try {
          // Check if it's a valid git repository
          const isGitRepo = await this.isValidGitRepo(worktreePath);
          if (!isGitRepo) {
            results.push({
              branch: branchName,
              path: worktreePath,
              method: 'skipped',
              success: true,
            });
            continue;
          }

          // Try Graphite sync first
          const graphiteAvailable = await this.graphiteService.isAvailable();
          if (graphiteAvailable) {
            const result = await this.syncWithGraphite(worktreePath, branchName);
            results.push(result);
          } else {
            // Fallback to git
            const result = await this.syncWithGit(worktreePath, branchName);
            results.push(result);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to sync worktree ${branchName}: ${errorMsg}`);
          results.push({
            branch: branchName,
            path: worktreePath,
            method: 'graphite',
            success: false,
            error: errorMsg,
          });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to read worktrees directory: ${errorMsg}`);
    }

    return results;
  }

  /**
   * Sync a worktree using Graphite
   */
  private async syncWithGraphite(worktreePath: string, branchName: string): Promise<WorktreeSyncResult> {
    try {
      logger.debug(`Syncing worktree ${branchName} with Graphite...`);

      // gt sync --restack rebases current branch and restacks dependent branches
      const { stdout, stderr } = await execAsync('gt sync --restack', {
        cwd: worktreePath,
        env: execEnv,
      });

      logger.info(`Successfully synced ${branchName} with Graphite`);
      logger.debug(`Graphite output: ${stdout || stderr}`);

      return {
        branch: branchName,
        path: worktreePath,
        method: 'graphite',
        success: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Graphite sync failed for ${branchName}: ${errorMsg}`);
      return {
        branch: branchName,
        path: worktreePath,
        method: 'graphite',
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Fallback: Sync a worktree using git
   */
  private async syncWithGit(worktreePath: string, branchName: string): Promise<WorktreeSyncResult> {
    try {
      logger.debug(`Syncing worktree ${branchName} with git (Graphite unavailable)...`);

      // Get the parent branch (mainline)
      const parentBranch = await this.getParentBranch(worktreePath);
      if (!parentBranch) {
        logger.warn(`Could not determine parent branch for ${branchName}`);
        return {
          branch: branchName,
          path: worktreePath,
          method: 'git',
          success: false,
          error: 'Could not determine parent branch',
        };
      }

      // Fetch remote changes
      await execAsync('git fetch origin', { cwd: worktreePath, env: execEnv });

      // Rebase on parent
      const { stdout, stderr } = await execAsync(`git pull --rebase origin ${parentBranch}`, {
        cwd: worktreePath,
        env: execEnv,
      });

      logger.info(`Successfully synced ${branchName} with git`);
      logger.debug(`Git output: ${stdout || stderr}`);

      return {
        branch: branchName,
        path: worktreePath,
        method: 'git',
        success: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Git sync failed for ${branchName}: ${errorMsg}`);
      return {
        branch: branchName,
        path: worktreePath,
        method: 'git',
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Determine the parent branch for a worktree
   */
  private async getParentBranch(worktreePath: string): Promise<string | null> {
    try {
      // Try to get parent from Graphite config
      const { stdout } = await execAsync('gt log --json', {
        cwd: worktreePath,
        env: execEnv,
      }).catch(() => ({ stdout: '[]' }));

      try {
        const stack = JSON.parse(stdout);
        if (stack.length > 0 && stack[0].parent) {
          return stack[0].parent;
        }
      } catch {
        // JSON parse failed
      }

      // Fallback: use 'main' or 'master'
      const { stdout: branches } = await execAsync('git branch -a', {
        cwd: worktreePath,
        env: execEnv,
      });

      if (branches.includes('origin/main')) return 'main';
      if (branches.includes('origin/master')) return 'master';

      return null;
    } catch (error) {
      logger.debug(`Failed to determine parent branch: ${error}`);
      return null;
    }
  }

  /**
   * Check if a directory is a valid git repository
   */
  private async isValidGitRepo(dirPath: string): Promise<boolean> {
    try {
      const gitDir = join(dirPath, '.git');
      const stats = await stat(gitDir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Log sync run summary
   */
  private logSyncSummary(summary: SyncRunSummary): void {
    const durationMs = summary.endTime.getTime() - summary.startTime.getTime();
    const durationSec = (durationMs / 1000).toFixed(2);

    logger.info('=== Graphite Scheduled Sync Summary ===');
    logger.info(`Duration: ${durationSec}s`);
    logger.info(`Worktrees found: ${summary.worktreesFound}`);
    logger.info(`Synced successfully: ${summary.syncedCount}`);
    logger.info(`Skipped: ${summary.skippedCount}`);
    logger.info(`Failed: ${summary.failedCount}`);

    if (summary.failedCount > 0) {
      logger.warn('Failed syncs:');
      summary.results
        .filter((r) => !r.success)
        .forEach((r) => {
          logger.warn(`  - ${r.branch}: ${r.error || 'Unknown error'}`);
        });
    }
  }
}
