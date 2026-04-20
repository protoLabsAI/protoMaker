/**
 * DoneWorktreeCleanupCheck - Periodic sweep that removes worktrees for completed features.
 *
 * Runs as a full-tier (6h) maintenance check. For each project:
 * 1. Removes worktrees for features in 'done' status via WorktreeLifecycleService.
 * 2. Removes fully orphaned worktrees (directory on disk with no matching feature).
 *
 * Safety:
 * - Worktrees with uncommitted changes are skipped (enforced by WorktreeLifecycleService).
 * - Worktrees for in-flight features (not 'done') are never removed.
 * - Dry-run mode: set WORKTREE_CLEANUP_DRY_RUN=true to list removals without acting.
 *
 * Events:
 * - Emits 'worktree:cleanup' with { projectPath, removed, paths, dryRun } after each project sweep.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import type { Dirent } from 'fs';
import { createLogger } from '@protolabsai/utils';
import type {
  MaintenanceCheck,
  MaintenanceCheckContext,
  MaintenanceCheckResult,
} from '@protolabsai/types';
import type { WorktreeLifecycleService } from '../../worktree-lifecycle-service.js';
import type { FeatureLoader } from '../../feature-loader.js';
import type { EventEmitter } from '../../../lib/events.js';
import * as secureFs from '../../../lib/secure-fs.js';

const logger = createLogger('DoneWorktreeCleanupCheck');

const execAsync = promisify(exec) as (
  command: string,
  options?: { cwd?: string }
) => Promise<{ stdout: string; stderr: string }>;

export class DoneWorktreeCleanupCheck implements MaintenanceCheck {
  readonly id = 'done-worktree-cleanup';
  readonly name = 'Done Worktree Cleanup';
  readonly tier = 'full' as const;

  private readonly dryRun: boolean;

  constructor(
    private readonly worktreeLifecycleService: WorktreeLifecycleService,
    private readonly featureLoader: FeatureLoader,
    private readonly events: EventEmitter,
    dryRun?: boolean
  ) {
    this.dryRun = dryRun ?? process.env.WORKTREE_CLEANUP_DRY_RUN === 'true';
  }

  async run(context: MaintenanceCheckContext): Promise<MaintenanceCheckResult> {
    const t0 = Date.now();
    let totalRemoved = 0;
    const allRemovedPaths: string[] = [];

    for (const projectPath of context.projectPaths) {
      try {
        const { removed, paths } = await this.sweepProject(projectPath);
        totalRemoved += removed;
        allRemovedPaths.push(...paths);

        this.events.emit('worktree:cleanup', {
          projectPath,
          removed,
          paths,
          dryRun: this.dryRun,
        });
      } catch (err) {
        logger.error(`Done worktree cleanup failed for ${projectPath}:`, err);
      }
    }

    const dryRunNote = this.dryRun ? ' (dry-run)' : '';

    return {
      checkId: this.id,
      passed: true,
      summary:
        totalRemoved > 0
          ? `Worktree cleanup${dryRunNote}: ${totalRemoved} stale worktree(s) removed across ${context.projectPaths.length} projects`
          : `Worktree cleanup${dryRunNote}: no stale worktrees found across ${context.projectPaths.length} projects`,
      details: {
        totalRemoved,
        removedPaths: allRemovedPaths,
        projectCount: context.projectPaths.length,
        dryRun: this.dryRun,
      },
      durationMs: Date.now() - t0,
    };
  }

  /**
   * Sweep a single project: remove done-feature worktrees and orphaned worktrees.
   */
  private async sweepProject(projectPath: string): Promise<{ removed: number; paths: string[] }> {
    const features = await this.featureLoader.getAll(projectPath);
    const worktreesDir = path.join(projectPath, '.worktrees');

    // Enumerate worktree directories on disk
    let worktreeDirs: string[] = [];
    try {
      const entries = (await secureFs.readdir(worktreesDir, {
        withFileTypes: true,
      })) as unknown as Dirent[];
      worktreeDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return { removed: 0, paths: [] };
    }

    // Index features by branch slug for O(1) lookup
    const featureBySlug = new Map(
      features.filter((f) => f.branchName).map((f) => [this.branchSlug(f.branchName!), f])
    );

    // Classify each worktree directory
    const doneWorktreePaths: string[] = [];
    const orphanedWorktreeDirs: string[] = [];

    for (const dir of worktreeDirs) {
      if (dir === 'main' || dir === 'master') continue;

      const feature = featureBySlug.get(dir);
      if (feature) {
        if (feature.status === 'done') {
          doneWorktreePaths.push(path.join(worktreesDir, dir));
        }
        // Features not done are skipped (in-flight protection)
      } else {
        orphanedWorktreeDirs.push(dir);
      }
    }

    if (this.dryRun) {
      return this.dryRunSweep(worktreesDir, doneWorktreePaths, orphanedWorktreeDirs);
    }

    return this.livesweep(projectPath, worktreesDir, doneWorktreePaths, orphanedWorktreeDirs);
  }

  private async dryRunSweep(
    worktreesDir: string,
    doneWorktreePaths: string[],
    orphanedDirs: string[]
  ): Promise<{ removed: number; paths: string[] }> {
    const paths: string[] = [];

    for (const p of doneWorktreePaths) {
      logger.info(`[dry-run] Would remove done-feature worktree: ${p}`);
      paths.push(p);
    }

    for (const dir of orphanedDirs) {
      const p = path.join(worktreesDir, dir);
      if (await this.isOrphanSafeToRemove(p)) {
        logger.info(`[dry-run] Would remove orphaned worktree: ${p}`);
        paths.push(p);
      }
    }

    return { removed: paths.length, paths };
  }

  private async livesweep(
    projectPath: string,
    worktreesDir: string,
    doneWorktreePaths: string[],
    orphanedDirs: string[]
  ): Promise<{ removed: number; paths: string[] }> {
    const removedPaths: string[] = [];

    // Phase 1: remove done-feature worktrees via lifecycle service (handles locks)
    if (doneWorktreePaths.length > 0) {
      try {
        const cleaned = await this.worktreeLifecycleService.cleanupAllDoneFeatures(projectPath);
        logger.info(`cleanupAllDoneFeatures removed ${cleaned} worktree(s) for ${projectPath}`);

        // Record which done worktrees are now gone
        for (const p of doneWorktreePaths) {
          const stillExists = await this.pathExists(p);
          if (!stillExists) removedPaths.push(p);
        }
      } catch (err) {
        logger.warn(`cleanupAllDoneFeatures failed for ${projectPath}: ${err}`);
      }
    }

    // Phase 2: remove fully orphaned worktrees
    for (const dir of orphanedDirs) {
      const p = path.join(worktreesDir, dir);
      if (!(await this.isOrphanSafeToRemove(p))) continue;
      await this.removeWorktree(projectPath, p, dir, removedPaths);
    }

    return { removed: removedPaths.length, paths: removedPaths };
  }

  private async pathExists(p: string): Promise<boolean> {
    try {
      await secureFs.stat(p);
      return true;
    } catch {
      return false;
    }
  }

  private async isOrphanSafeToRemove(worktreePath: string): Promise<boolean> {
    // Guard 1: uncommitted changes in the working tree
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: worktreePath });
      if (stdout.trim()) return false;
    } catch {
      // git status failed — worktree is likely broken; let caller fall through
      return true;
    }

    // Guard 2: committed but unpushed work. A worktree can have a clean
    // working tree (status --porcelain empty) while still holding commits
    // that exist on no remote. Destroying the worktree with --force would
    // delete that work. Refuse removal if HEAD is not reachable from any
    // remote ref.
    try {
      const { stdout: remoteContainers } = await execAsync('git branch -r --contains HEAD', {
        cwd: worktreePath,
      });
      if (!remoteContainers.trim()) {
        logger.warn(
          `[SAFETY] Skipping orphan worktree removal: ${worktreePath} has commits not present on any remote ref`
        );
        return false;
      }
    } catch {
      // git branch -r failed — assume unsafe to avoid silent data loss
      logger.warn(
        `[SAFETY] Skipping orphan worktree removal: ${worktreePath} unpushed-commit check failed`
      );
      return false;
    }

    return true;
  }

  private async removeWorktree(
    projectPath: string,
    worktreePath: string,
    dir: string,
    removedPaths: string[]
  ): Promise<void> {
    logger.info(`Removing orphaned worktree: ${worktreePath}`);
    try {
      await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: projectPath });
      removedPaths.push(worktreePath);
    } catch {
      try {
        await secureFs.rm(worktreePath, { recursive: true, force: true });
        await execAsync('git worktree prune', { cwd: projectPath });
        removedPaths.push(worktreePath);
        logger.info(`Manually removed orphaned worktree: ${worktreePath} (dir: ${dir})`);
      } catch (err2) {
        logger.warn(`Failed to remove orphaned worktree ${worktreePath}: ${err2}`);
      }
    }
  }

  private branchSlug(branchName: string): string {
    return branchName.split('/').pop() ?? branchName;
  }
}
