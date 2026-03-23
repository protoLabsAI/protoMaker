/**
 * Worktree Lifecycle Service - Automated cleanup of git worktrees and branches
 *
 * Listens for feature completion events and cleans up:
 * - Git worktrees created for feature execution
 * - Local feature branches that have been merged
 *
 * This prevents the accumulation of stale worktrees (previously 281 / 35GB).
 *
 * Recovery features:
 * - Automatic prune on server startup (removes phantom worktrees)
 * - Periodic drift detection (every 6 hours)
 * - Health check API for monitoring worktree state
 */

import fs from 'node:fs';
import path from 'path';
import { exec, execFile, execSync } from 'child_process';
import { createLogger } from '@protolabsai/utils';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import { isWorktreeLocked } from '../lib/worktree-lock.js';
import { WORKTREE_CLEANUP_DELAY_MS, WORKTREE_DRIFT_CHECK_INTERVAL_MS } from '../config/timeouts.js';

const logger = createLogger('WorktreeLifecycle');

/** Delay after PR merge before cleanup (allow CI/webhooks to settle) */
const CLEANUP_DELAY_MS = WORKTREE_CLEANUP_DELAY_MS;

/** Periodic drift detection interval (6 hours) */
const DRIFT_CHECK_INTERVAL_MS = WORKTREE_DRIFT_CHECK_INTERVAL_MS;

/** Worktree drift detection results */
export interface WorktreeDrift {
  /** Phantom worktrees (registered in git, but directory missing) */
  phantoms: Array<{ path: string; branch: string }>;
  /** Orphan worktrees (directory exists, but not registered in git) */
  orphans: Array<{ path: string; branch?: string }>;
  /** Healthy worktrees (registered in git and directory exists) */
  healthy: number;
}

/** Health check results for a project */
export interface WorktreeHealth {
  projectPath: string;
  /** Total registered worktrees in git */
  registered: number;
  /** Total worktree directories on disk */
  onDisk: number;
  /** Drift detection results */
  drift: WorktreeDrift;
  /** Last check timestamp */
  checkedAt: string;
}

export class WorktreeLifecycleService {
  private readonly events: EventEmitter;
  private readonly featureLoader: FeatureLoader;
  private initialized = false;
  private driftCheckIntervalId: NodeJS.Timeout | null = null;
  private projectsToMonitor: Set<string> = new Set();
  private getRunningFeatures?: () => Promise<Array<{ branchName?: string; projectPath: string }>>;

  constructor(
    events: EventEmitter,
    featureLoader: FeatureLoader,
    getRunningFeatures?: () => Promise<Array<{ branchName?: string; projectPath: string }>>
  ) {
    this.events = events;
    this.featureLoader = featureLoader;
    this.getRunningFeatures = getRunningFeatures;
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    // TODO: migrate to bus.on()
    this.events.subscribe((type, payload) => {
      // Clean up worktree after PR is merged
      if (type === 'feature:pr-merged') {
        const data = payload as Record<string, unknown>;
        const projectPath = data.projectPath as string;
        const branchName = data.branchName as string;
        const featureId = data.featureId as string;

        if (projectPath && branchName) {
          setTimeout(() => {
            void this.cleanupWorktree(projectPath, branchName, featureId);
          }, CLEANUP_DELAY_MS);
        }
      }

      // Also clean up when a feature moves to 'done' status
      if (type === 'feature:completed') {
        const data = payload as Record<string, unknown>;
        const projectPath = data.projectPath as string;
        const featureId = data.featureId as string;

        if (projectPath && featureId) {
          // Delayed cleanup - feature might still need its worktree briefly
          setTimeout(() => {
            void this.cleanupFeatureWorktree(projectPath, featureId);
          }, CLEANUP_DELAY_MS * 3);
        }
      }
    });

    // Start periodic drift detection for monitored projects
    this.startPeriodicDriftDetection();

    logger.info('Worktree lifecycle service initialized');
  }

  /**
   * Shutdown the service and stop periodic tasks
   */
  shutdown(): void {
    if (this.driftCheckIntervalId) {
      clearInterval(this.driftCheckIntervalId);
      this.driftCheckIntervalId = null;
      logger.info('Stopped periodic drift detection');
    }
  }

  /**
   * Register a project for monitoring and recovery
   */
  registerProject(projectPath: string): void {
    this.projectsToMonitor.add(projectPath);
    logger.info(`Registered project for worktree monitoring: ${projectPath}`);
  }

  /**
   * Start periodic drift detection for all monitored projects
   */
  private startPeriodicDriftDetection(): void {
    if (this.driftCheckIntervalId) {
      return; // Already running
    }

    this.driftCheckIntervalId = setInterval(() => {
      void this.runPeriodicDriftCheck();
    }, DRIFT_CHECK_INTERVAL_MS);

    logger.info(
      `Started periodic drift detection (interval: ${DRIFT_CHECK_INTERVAL_MS / 1000 / 60} minutes)`
    );
  }

  /**
   * Run drift check on all monitored projects
   */
  private async runPeriodicDriftCheck(): Promise<void> {
    if (this.projectsToMonitor.size === 0) {
      return;
    }

    logger.info(`Running periodic drift check for ${this.projectsToMonitor.size} project(s)...`);

    for (const projectPath of this.projectsToMonitor) {
      try {
        const drift = await this.detectDrift(projectPath);

        if (drift.phantoms.length > 0) {
          logger.warn(
            `[DRIFT-CHECK] Found ${drift.phantoms.length} phantom worktree(s) in ${projectPath}, auto-pruning...`
          );
          await this.prunePhantomWorktrees(projectPath);
          logger.info(`[DRIFT-CHECK] Auto-pruned phantom worktree(s) from ${projectPath}`);
        }

        if (drift.orphans.length > 0) {
          logger.warn(
            `[DRIFT-CHECK] Found ${drift.orphans.length} orphan worktree(s) in ${projectPath} (on disk but not in git):`
          );
          drift.orphans.forEach((orphan) => {
            logger.warn(`  - ${orphan.path}${orphan.branch ? ` (branch: ${orphan.branch})` : ''}`);
          });
          logger.info('[DRIFT-CHECK] Orphans logged for manual review (not auto-deleted)');
        }

        // Emit drift event for monitoring/alerting
        this.events.emit('worktree:drift-detected', {
          projectPath,
          drift,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error(`[DRIFT-CHECK] Failed drift check for ${projectPath}:`, error);
      }
    }
  }

  /**
   * Clean up a worktree and optionally its branch.
   */
  async cleanupWorktree(
    projectPath: string,
    branchName: string,
    featureId?: string
  ): Promise<void> {
    const worktreeName = branchName.replace(/\//g, '-');
    const worktreePath = path.join(projectPath, '.worktrees', worktreeName);

    try {
      // CRITICAL SAFETY CHECK: Prevent deletion of worktrees with running agents
      // If Claude Code's Bash tool cd's into a worktree and that worktree is deleted,
      // Bash permanently breaks for the session. This is a platform limitation we must guard against.
      if (this.getRunningFeatures) {
        const runningFeatures = await this.getRunningFeatures();
        const hasRunningAgent = runningFeatures.some(
          (rf) =>
            rf.projectPath === projectPath &&
            rf.branchName &&
            (rf.branchName === branchName || rf.branchName.replace(/\//g, '-') === worktreeName)
        );

        if (hasRunningAgent) {
          logger.warn(
            `[SAFETY] Cannot clean up worktree ${worktreeName} - agent is currently running in this worktree`
          );
          return; // Skip cleanup - worktree is in use
        }
      }

      // Check worktree lock file: refuse removal if a live agent process holds the lock
      const locked = await isWorktreeLocked(worktreePath);
      if (locked) {
        logger.warn(
          `[SAFETY] Cannot clean up worktree ${worktreeName} - lock file indicates a live agent process is active`
        );
        return; // Skip cleanup - worktree lock is held by a running process
      }

      // Check if worktree exists
      try {
        execSync(`git worktree list --porcelain`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 10_000,
        });
      } catch {
        return; // git not available or not a repo
      }

      // Safety check: push any unpushed commits before removal.
      // Nested worktrees (.claude/worktrees/agent-*) may have commits that
      // were never pushed — destroying the worktree would lose that work.
      const pushedSafely = await this.pushUnpushedCommits(worktreePath, branchName);
      if (!pushedSafely) {
        logger.warn(
          `[SAFETY] Skipping worktree removal for ${worktreeName} — push failed, leaving intact for manual recovery`
        );
        return; // Do NOT prune — work is at risk
      }

      // Remove worktree
      try {
        execSync(`git worktree remove "${worktreePath}" --force`, {
          cwd: projectPath,
          timeout: 30_000,
          encoding: 'utf-8',
        });
        logger.info(`Removed worktree: ${worktreeName}`);
      } catch (error) {
        // Worktree might not exist - that's fine
        logger.debug(`Worktree ${worktreeName} not found or already removed: ${error}`);
      }

      // Check if branch is merged and can be deleted
      try {
        const merged = execSync(`git branch --merged main`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 10_000,
        });

        if (merged.includes(branchName)) {
          execSync(`git branch -d "${branchName}"`, {
            cwd: projectPath,
            timeout: 10_000,
            encoding: 'utf-8',
          });
          logger.info(`Deleted merged branch: ${branchName}`);
        }
      } catch (error) {
        logger.debug(`Could not delete branch ${branchName}: ${error}`);
      }

      // Emit cleanup event
      this.events.emit('feature:worktree-cleaned', {
        projectPath,
        branchName,
        featureId,
        worktreePath,
      });
    } catch (error) {
      logger.error(`Failed to clean up worktree for ${branchName}:`, error);
    }
  }

  /**
   * Clean up worktree for a feature by looking up its branch name.
   */
  private async cleanupFeatureWorktree(projectPath: string, featureId: string): Promise<void> {
    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature?.branchName) return;

      // Only clean up if feature is truly done
      if (feature.status !== 'done') return;

      await this.cleanupWorktree(projectPath, feature.branchName, featureId);
    } catch (error) {
      logger.error(`Failed to clean up worktree for feature ${featureId}:`, error);
    }
  }

  /**
   * Bulk cleanup: remove all worktrees for features that are in 'done' status.
   * Useful for periodic maintenance.
   */
  async cleanupAllDoneFeatures(projectPath: string): Promise<number> {
    let cleaned = 0;

    try {
      const features = await this.featureLoader.getAll(projectPath);
      const doneFeatures = features.filter((f) => f.status === 'done' && f.branchName);

      for (const feature of doneFeatures) {
        if (feature.branchName) {
          await this.cleanupWorktree(projectPath, feature.branchName, feature.id);
          cleaned++;
        }
      }

      logger.info(`Bulk cleanup: removed ${cleaned} worktrees for done features`);
    } catch (error) {
      logger.error('Failed bulk worktree cleanup:', error);
    }

    return cleaned;
  }

  /**
   * Prune phantom worktrees (registered in git but directory missing).
   * Safe operation - only removes metadata for directories that don't exist.
   *
   * @returns Number of phantom worktrees pruned
   */
  async prunePhantomWorktrees(projectPath: string): Promise<number> {
    try {
      // Check if git is available and this is a repo
      try {
        execSync('git worktree list --porcelain', {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 10_000,
        });
      } catch {
        logger.debug(`Skipping prune for ${projectPath} (not a git repo or git unavailable)`);
        return 0;
      }

      // Run git worktree prune (removes stale metadata)
      const startTime = Date.now();
      execSync('git worktree prune --verbose', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30_000,
      });
      const elapsed = Date.now() - startTime;

      logger.info(`[RECOVERY] Pruned phantom worktrees from ${projectPath} (${elapsed}ms)`);

      // Emit recovery event
      this.events.emit('worktree:phantom-pruned', {
        projectPath,
        timestamp: new Date().toISOString(),
        elapsedMs: elapsed,
      });

      // Count how many were pruned by detecting drift before/after
      // (git worktree prune doesn't report count, so we infer from drift detection)
      return 0; // git prune doesn't return count
    } catch (error) {
      logger.error(`[RECOVERY] Failed to prune phantom worktrees for ${projectPath}:`, error);
      return 0;
    }
  }

  /**
   * Detect drift between git worktree state and actual filesystem.
   *
   * @returns Drift detection results
   */
  async detectDrift(projectPath: string): Promise<WorktreeDrift> {
    const drift: WorktreeDrift = {
      phantoms: [],
      orphans: [],
      healthy: 0,
    };

    try {
      // Get registered worktrees from git
      const { stdout } = await this.execAsync('git worktree list --porcelain', {
        cwd: projectPath,
        timeout: 10_000,
      });

      const registeredWorktrees = new Map<string, string>(); // path -> branch
      const lines = stdout.split('\n');
      let currentPath: string | null = null;
      let currentBranch: string | null = null;
      let isFirst = true;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          currentPath = line.slice(9);
        } else if (line.startsWith('branch ')) {
          currentBranch = line.slice(7).replace('refs/heads/', '');
        } else if (line === '') {
          if (currentPath && currentBranch) {
            // Skip main worktree (projectPath itself)
            if (!isFirst) {
              registeredWorktrees.set(currentPath, currentBranch);
            }
            isFirst = false;
          }
          currentPath = null;
          currentBranch = null;
        }
      }

      // Check each registered worktree for directory existence
      for (const [worktreePath, branch] of registeredWorktrees) {
        try {
          await secureFs.access(worktreePath);
          drift.healthy++;
        } catch {
          // Directory doesn't exist - phantom worktree
          drift.phantoms.push({ path: worktreePath, branch });
        }
      }

      // Scan .worktrees directory for orphans
      const worktreesDir = path.join(projectPath, '.worktrees');
      try {
        await secureFs.access(worktreesDir);
        const entries = await secureFs.readdir(worktreesDir, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const diskPath = path.join(worktreesDir, entry.name);
          const normalizedDiskPath = path.resolve(diskPath);

          // Check if this path is registered (exact path match only)
          const isRegistered = Array.from(registeredWorktrees.keys()).some((regPath) => {
            const normalizedRegPath = path.resolve(regPath);
            return normalizedRegPath === normalizedDiskPath;
          });

          if (!isRegistered) {
            // Try to detect branch name
            let branchName: string | undefined;
            try {
              const branchOutput = await this.execAsync('git branch --show-current', {
                cwd: diskPath,
                timeout: 5_000,
              });
              branchName = branchOutput.stdout.trim() || undefined;
            } catch {
              // Can't determine branch
            }

            drift.orphans.push({ path: diskPath, branch: branchName });
          }
        }
      } catch {
        // .worktrees directory doesn't exist or can't be read
      }

      return drift;
    } catch (error) {
      logger.error(`Failed to detect drift for ${projectPath}:`, error);
      return drift;
    }
  }

  /**
   * Get comprehensive health check for worktree state
   */
  async getHealth(projectPath: string): Promise<WorktreeHealth> {
    const drift = await this.detectDrift(projectPath);

    return {
      projectPath,
      registered: drift.healthy + drift.phantoms.length,
      onDisk: drift.healthy + drift.orphans.length,
      drift,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Push any unpushed commits from a worktree to the remote before cleanup.
   *
   * Checks whether the worktree has commits that are not yet on the remote
   * (`git log origin/<branch>..HEAD`). If any exist, attempts a push with
   * `--no-verify` to skip pre-push hooks (which may fail in isolated
   * worktrees that have no node_modules).
   *
   * @param worktreePath - Absolute path to the worktree directory
   * @param branchName - Branch name tracked by this worktree
   * @returns `true` if all commits are on the remote (push succeeded or was
   *          unnecessary), `false` if the push failed and the worktree must
   *          NOT be removed.
   */
  private async pushUnpushedCommits(worktreePath: string, branchName: string): Promise<boolean> {
    // First, verify the worktree directory actually exists on disk.
    // If it doesn't exist there are no commits to push.
    try {
      await secureFs.access(worktreePath);
    } catch {
      return true; // Directory absent — nothing to push
    }

    // Check for unpushed commits: `git log origin/<branch>..HEAD --oneline`
    // This returns non-empty output when local HEAD has commits not on the remote.
    let unpushedOutput: string;
    try {
      const result = await this.execFileAsync(
        'git',
        ['log', `origin/${branchName}..HEAD`, '--oneline'],
        {
          cwd: worktreePath,
          timeout: 15_000,
        }
      );
      unpushedOutput = result.stdout.trim();
    } catch {
      // Remote tracking branch may not exist yet (brand-new branch that was
      // never pushed). Attempt a push to be safe.
      unpushedOutput = '(remote ref missing — push required)';
    }

    if (!unpushedOutput) {
      // All commits are already on the remote — safe to proceed
      logger.debug(`[SAFETY] Worktree ${worktreePath} has no unpushed commits — safe to remove`);
      return true;
    }

    logger.info(
      `[SAFETY] Worktree ${worktreePath} has unpushed commits on branch ${branchName} — pushing before cleanup`
    );
    logger.debug(`[SAFETY] Unpushed commits:\n${unpushedOutput}`);

    // Attempt push with --no-verify to skip hooks that may fail in worktrees
    try {
      await this.execFileAsync('git', ['push', '--no-verify', '-u', 'origin', branchName], {
        cwd: worktreePath,
        timeout: 60_000,
      });
      logger.info(`[SAFETY] Successfully pushed ${branchName} before worktree cleanup`);
      return true;
    } catch (pushError) {
      const msg = pushError instanceof Error ? pushError.message : String(pushError);
      logger.error(
        `[SAFETY] Push failed for branch ${branchName} in worktree ${worktreePath}: ${msg}. ` +
          `Worktree will NOT be removed — manual recovery required.`
      );
      return false;
    }
  }

  /**
   * Promisified exec for async/await usage
   */
  private execAsync(
    command: string,
    options: { cwd: string; timeout: number }
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      exec(command, options, (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }

  /**
   * Promisified execFile for argv-based invocation (no shell parsing)
   */
  private execFileAsync(
    file: string,
    args: string[],
    options: { cwd: string; timeout: number }
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      execFile(file, args, options, (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }
}

/**
 * Directories that are gitignored but required at runtime for MCP servers
 * and build tooling. These are symlinked from the main project into worktrees
 * after creation so that external projects' toolchains work correctly.
 *
 * Only top-level directories are symlinked. Nested node_modules (inside
 * workspace packages) are resolved transitively through the root symlink.
 */
const BUILD_ARTIFACT_DIRS = ['node_modules', 'dist', 'build', '.next', '.nuxt', 'out'] as const;

/**
 * Symlink gitignored build artifacts from the main project into a worktree.
 *
 * Git worktrees share the git history but NOT the working tree, so directories
 * listed in .gitignore (node_modules, dist, build, etc.) are absent in fresh
 * worktrees. For external projects whose MCP servers or build tools depend on
 * these artifacts, the agent will fail immediately with exit code 1.
 *
 * This function creates directory symlinks for each artifact that:
 * 1. Exists in the main project (source must be present)
 * 2. Does NOT already exist in the worktree (no clobbering)
 *
 * Symlinks are preferred over copying because they are instant, use no extra
 * disk space, and always reflect the current state of the main project's
 * artifacts.
 *
 * @param projectPath - Absolute path to the main project root
 * @param worktreePath - Absolute path to the worktree directory
 * @returns List of directories that were successfully symlinked
 */
export async function symlinkBuildArtifacts(
  projectPath: string,
  worktreePath: string
): Promise<string[]> {
  const symlinked: string[] = [];

  for (const dir of BUILD_ARTIFACT_DIRS) {
    const sourcePath = path.join(projectPath, dir);
    const targetPath = path.join(worktreePath, dir);

    try {
      // Check if source exists in main project
      await fs.promises.access(sourcePath);
    } catch {
      // Source doesn't exist in main project -- nothing to symlink
      continue;
    }

    try {
      // Check if target already exists in worktree (real dir, symlink, or file)
      await fs.promises.lstat(targetPath);
      // Already exists -- skip to avoid clobbering
      continue;
    } catch {
      // Target doesn't exist -- proceed with symlink creation
    }

    try {
      // Use 'junction' type on Windows for directory symlinks (no admin required),
      // 'dir' type on Unix (default for symlink when target is a directory).
      const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
      await fs.promises.symlink(sourcePath, targetPath, symlinkType);
      symlinked.push(dir);
    } catch (error) {
      // Non-fatal: log and continue with remaining directories
      logger.warn(
        `Failed to symlink ${dir} from ${projectPath} to ${worktreePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (symlinked.length > 0) {
    logger.info(
      `Symlinked build artifacts into worktree ${path.basename(worktreePath)}: ${symlinked.join(', ')}`
    );
  }

  return symlinked;
}
