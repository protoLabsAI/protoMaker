/**
 * Maintenance Tasks - Built-in scheduled task handlers
 *
 * Handler functions for system maintenance tasks, registered with the AutomationService
 * as built-in Automation records at startup via registerMaintenanceFlows().
 *
 * Tasks:
 * - Data integrity check (every 5 minutes): monitors feature directory count
 * - Stale feature detection (hourly): finds features stuck in running/in-progress
 * - Worktree auto-cleanup (daily): auto-removes worktrees for merged branches
 * - Branch auto-cleanup (weekly): auto-deletes local branches already merged to main
 * - Board health reconciliation (every 6 hours): audits and auto-fixes board state
 * - Auto-merge eligible PRs (every 5 minutes): merges PRs that pass all checks
 * - Auto-rebase stale PRs (every 30 minutes): rebases PRs behind their base branch
 * - GitHub Actions runner health (every 5 minutes): detects stuck builds
 *
 * All tasks emit events for UI display and logging.
 */

import { createLogger } from '@protolabsai/utils';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { FlowFactory } from '@protolabsai/types';
import { DEFAULT_GIT_WORKFLOW_SETTINGS } from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';
import { getEffectivePrBaseBranch } from '../lib/settings-helpers.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { DataIntegrityWatchdogService } from './data-integrity-watchdog-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import { mergeEligibilityService } from './merge-eligibility-service.js';
import { githubMergeService } from './github-merge-service.js';
import { gitWorkflowService } from './git-workflow-service.js';
import type { Feature } from '@protolabsai/types';
import { Octokit } from '@octokit/rest';
import { CircuitBreaker } from '../lib/circuit-breaker.js';

const execFileAsync = promisify(execFile);

const logger = createLogger('MaintenanceTasks');

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Max consecutive push failures before a worktree is given up for the cooldown period */
const PUSH_FAILURE_THRESHOLD = 3;
/** Cooldown before retrying a worktree whose circuit breaker has tripped (30 minutes) */
const PUSH_CIRCUIT_BREAKER_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Per-worktree circuit breakers for crash-recovery push attempts.
 *
 * Keyed by branch name. State persists across maintenance cycles (in-process) so
 * that a branch that fails N times in a row is not retried until the cooldown expires.
 */
const worktreePushCircuitBreakers = new Map<string, CircuitBreaker>();

function getWorktreeCircuitBreaker(branch: string): CircuitBreaker {
  if (!worktreePushCircuitBreakers.has(branch)) {
    worktreePushCircuitBreakers.set(
      branch,
      new CircuitBreaker({
        failureThreshold: PUSH_FAILURE_THRESHOLD,
        cooldownMs: PUSH_CIRCUIT_BREAKER_COOLDOWN_MS,
        name: `worktree-push:${branch}`,
      })
    );
  }
  return worktreePushCircuitBreakers.get(branch)!;
}
const STUCK_RUN_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const RUNNER_CONGESTION_THRESHOLD = 0.5; // 50% utilization

/**
 * Safety check: Verify a worktree has no uncommitted changes.
 * @returns true if worktree is clean (safe to remove)
 */
async function isWorktreeClean(worktreePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: worktreePath,
      encoding: 'utf-8',
      timeout: 5_000,
    });
    return stdout.trim() === '';
  } catch (error) {
    logger.warn(`Failed to check worktree status at ${worktreePath}:`, error);
    return false;
  }
}

/**
 * Safety check: Verify a worktree is not currently checked out.
 * @returns true if worktree is not the current working directory
 */
function isWorktreeSafe(worktreePath: string): boolean {
  const cwd = process.cwd();
  return !cwd.startsWith(worktreePath);
}

/**
 * Safety check: Verify branch is fully merged into target branch.
 * @returns true if branch is merged
 */
async function isBranchFullyMerged(
  cwd: string,
  branch: string,
  targetBranch: string
): Promise<boolean> {
  try {
    // Check if branch is an ancestor of target using git merge-base
    await execFileAsync('git', ['merge-base', '--is-ancestor', branch, targetBranch], {
      cwd,
      encoding: 'utf-8',
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the integration branch for a project.
 * Reads prBaseBranch from project settings first, then global, then verifies
 * the branch exists locally. Falls back to main -> master if the configured
 * branch doesn't exist.
 */
async function resolveIntegrationBranch(
  cwd: string,
  settingsService?: SettingsService
): Promise<string | null> {
  // Read prBaseBranch from project settings first, then global
  const configuredBranch = await getEffectivePrBaseBranch(
    cwd,
    settingsService,
    '[MaintenanceTasks]'
  );
  const candidates = [configuredBranch, 'main', 'master'];
  // Deduplicate (e.g., if prBaseBranch is already 'main')
  const unique = [...new Set(candidates)];

  for (const branch of unique) {
    try {
      await execFileAsync('git', ['rev-parse', '--verify', branch], {
        cwd,
        encoding: 'utf-8',
        timeout: 5_000,
      });
      return branch;
    } catch {
      // Branch doesn't exist locally, try next
    }
  }
  return null;
}

/**
 * Register flow factories for all built-in maintenance tasks in the FlowRegistry.
 * Called from AutomationService.syncWithScheduler() before seeding automation records.
 *
 * Uses a generic registry interface to avoid circular imports with automation-service.ts.
 * Conditional tasks (data-integrity, board-health, auto-merge, runner-health) are only
 * registered when the required service dependencies are present.
 */
export function registerMaintenanceFlows(
  registry: { register(id: string, factory: FlowFactory): void },
  deps: {
    events: EventEmitter;
    autoModeService: AutoModeService;
    integrityWatchdogService?: DataIntegrityWatchdogService;
    featureLoader?: FeatureLoader;
    settingsService?: SettingsService;
  }
): void {
  const { events, autoModeService } = deps;

  // Always-registered tasks
  registry.register('built-in:stale-features', async () => {
    await checkStaleFeatures(events, autoModeService);
  });

  registry.register('built-in:stale-worktrees', async () => {
    const projectPaths = getKnownProjectPaths(autoModeService);
    await detectStaleWorktrees(events, projectPaths, deps.settingsService);
    // Also clean up merged branches (consolidated from built-in:branch-cleanup)
    await checkMergedBranches(events, projectPaths, deps.settingsService);
  });

  // Conditional on optional services
  if (deps.integrityWatchdogService) {
    const watchdog = deps.integrityWatchdogService;
    registry.register('built-in:data-integrity', async () => {
      await checkDataIntegrity(watchdog, events, autoModeService);
    });
  }

  // auto-merge-prs and auto-rebase-stale-prs removed — Lead Engineer MERGE/REVIEW phases handle these

  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO_OWNER && process.env.GITHUB_REPO_NAME) {
    registry.register('built-in:runner-health', async () => {
      const projectPaths = getKnownProjectPaths(autoModeService);
      await checkRunnerHealth(events, projectPaths);
    });
  }

  logger.info('Registered maintenance flow factories');
}

/**
 * Get known project paths from auto-mode service running agents.
 * Falls back to empty array if no projects are known.
 */
function getKnownProjectPaths(autoModeService: AutoModeService): string[] {
  const paths = new Set<string>();

  // Add projects with active auto-loops
  for (const p of autoModeService.getActiveAutoLoopProjects()) {
    paths.add(p);
  }

  return Array.from(paths);
}

/**
 * Check GitHub Actions runner health and detect stuck builds.
 * Auto-recovers stuck runs and alerts on runner congestion.
 */
async function checkRunnerHealth(events: EventEmitter, projectPaths: string[]): Promise<void> {
  logger.info('Checking GitHub Actions runner health...');

  const githubToken = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;

  if (!githubToken || !owner || !repo) {
    logger.warn('GitHub credentials not configured, skipping runner health check');
    return;
  }

  try {
    const octokit = new Octokit({ auth: githubToken });

    // Get all workflow runs in progress
    const { data: runs } = await octokit.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      status: 'in_progress',
      per_page: 100,
    });

    logger.info(`Found ${runs.workflow_runs.length} in-progress workflow runs`);

    const now = Date.now();
    const stuckRuns: typeof runs.workflow_runs = [];

    // Detect stuck runs (in_progress > 10 minutes without update)
    for (const run of runs.workflow_runs) {
      const runStartedAt = new Date(run.created_at).getTime();
      const runUpdatedAt = new Date(run.updated_at).getTime();
      const elapsed = now - runUpdatedAt;

      if (elapsed > STUCK_RUN_THRESHOLD_MS) {
        logger.warn(
          `Detected stuck workflow run: ${run.name} #${run.run_number} (${run.id}) - no update for ${Math.floor(elapsed / 1000 / 60)} minutes`
        );
        stuckRuns.push(run);
      }
    }

    // Auto-cancel stuck runs
    for (const run of stuckRuns) {
      try {
        logger.info(`Canceling stuck run: ${run.name} #${run.run_number} (${run.id})`);
        await octokit.actions.cancelWorkflowRun({
          owner,
          repo,
          run_id: run.id,
        });

        events.emit('maintenance', {
          type: 'runner-health',
          action: 'cancel-stuck-run',
          runId: run.id,
          runName: run.name,
          runNumber: run.run_number,
          elapsedMinutes: Math.floor((now - new Date(run.updated_at).getTime()) / 1000 / 60),
        });

        // Retrigger the run by re-running failed jobs
        logger.info(`Retriggering run: ${run.name} #${run.run_number} (${run.id})`);
        await octokit.actions.reRunWorkflowFailedJobs({
          owner,
          repo,
          run_id: run.id,
        });
      } catch (error) {
        logger.error(`Failed to cancel/retrigger stuck run ${run.id}:`, error);
      }
    }

    // Check runner pool congestion
    const { data: runners } = await octokit.actions.listSelfHostedRunnersForRepo({
      owner,
      repo,
      per_page: 100,
    });

    const totalRunners = runners.runners.length;
    const busyRunners = runners.runners.filter((r: { busy: boolean }) => r.busy).length;
    const utilization = totalRunners > 0 ? busyRunners / totalRunners : 0;

    logger.info(
      `Runner pool status: ${busyRunners}/${totalRunners} busy (${(utilization * 100).toFixed(1)}%)`
    );

    if (utilization > RUNNER_CONGESTION_THRESHOLD) {
      logger.warn(
        `Runner pool congestion detected: ${(utilization * 100).toFixed(1)}% utilization (threshold: ${(RUNNER_CONGESTION_THRESHOLD * 100).toFixed(1)}%)`
      );

      events.emit('maintenance', {
        type: 'runner-health',
        action: 'congestion-alert',
        utilization,
        busyRunners,
        totalRunners,
      });
    }

    // Emit health summary
    events.emit('maintenance', {
      type: 'runner-health',
      action: 'health-check',
      totalRuns: runs.workflow_runs.length,
      stuckRuns: stuckRuns.length,
      totalRunners,
      busyRunners,
      utilization,
    });
  } catch (error) {
    logger.error('Failed to check runner health:', error);
    events.emit('maintenance', {
      type: 'runner-health',
      action: 'check-failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Check for features stuck in running state for too long.
 * Uses the auto-mode service's running agents to detect stale executions.
 */
async function checkStaleFeatures(
  events: EventEmitter,
  autoModeService: AutoModeService
): Promise<void> {
  logger.info('Checking for stale features...');

  try {
    const runningAgents = await autoModeService.getRunningAgents();
    const now = Date.now();
    let staleCount = 0;
    const staleFeatures: string[] = [];

    for (const agent of runningAgents) {
      const runningMs = now - agent.startTime;
      if (runningMs > STALE_THRESHOLD_MS) {
        staleCount++;
        const runningMin = Math.round(runningMs / 60000);
        staleFeatures.push(`${agent.featureId} (${runningMin}min)`);
        logger.warn(
          `Stale feature detected: ${agent.featureId} - running for ${runningMin}min in ${agent.projectPath}`
        );
      }
    }

    if (staleCount > 0) {
      events.emit('scheduler:task_completed' as Parameters<typeof events.emit>[0], {
        taskId: 'maintenance:stale-features',
        message: `Found ${staleCount} stale feature(s) stuck in running state for >2h`,
        staleCount,
        staleFeatures,
      });
    }

    logger.info(
      `Stale feature check complete: ${staleCount} stale, ${runningAgents.length} running`
    );
  } catch (error) {
    logger.error('Stale feature check failed:', error);
    throw error;
  }
}

/**
 * Detect and auto-cleanup stale git worktrees (branches already merged).
 * Uses execFileAsync to avoid command injection and run asynchronously.
 * Safety checks: confirms branch is merged, no uncommitted work, not current branch.
 * Iterates over all known project paths to aggregate results.
 */
async function detectStaleWorktrees(
  events: EventEmitter,
  projectPaths: string[],
  settingsService?: SettingsService
): Promise<void> {
  logger.info('Checking for stale worktrees...');

  if (projectPaths.length === 0) {
    logger.info('No known project paths, skipping stale worktree detection');
    return;
  }

  try {
    let staleCount = 0;
    let cleanedCount = 0;
    const staleWorktrees: string[] = [];
    const cleanedWorktrees: string[] = [];
    const failedCleanups: Array<{ worktree: string; reason: string }> = [];

    for (const cwd of projectPaths) {
      try {
        // Resolve the integration branch from settings (prBaseBranch), falling back to main/master
        const defaultBranch = await resolveIntegrationBranch(cwd, settingsService);
        if (!defaultBranch) {
          logger.warn(`No integration branch found for ${cwd}, skipping`);
          continue;
        }

        // List all worktrees for this project
        const { stdout: output } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
          encoding: 'utf-8',
          timeout: 10_000,
          cwd,
        });

        const worktrees = output
          .split('\n\n')
          .filter((block) => block.trim())
          .map((block) => {
            const lines = block.split('\n');
            const worktreeLine = lines.find((l) => l.startsWith('worktree '));
            const branchLine = lines.find((l) => l.startsWith('branch '));
            return {
              path: worktreeLine?.replace('worktree ', '') ?? '',
              branch: branchLine?.replace('branch refs/heads/', '') ?? '',
            };
          })
          .filter((w) => w.path && w.branch);

        // Check which worktree branches are already merged into the default branch
        for (const wt of worktrees) {
          if (wt.branch === defaultBranch || wt.branch === 'main' || wt.branch === 'master')
            continue;

          try {
            // Check if branch is merged into default branch using execFileAsync (no shell injection)
            const isMerged = await isBranchFullyMerged(cwd, wt.branch, defaultBranch);

            if (isMerged) {
              staleCount++;
              const identifier = `${wt.branch} (${wt.path})`;
              staleWorktrees.push(identifier);

              // Safety checks before removal
              const isClean = await isWorktreeClean(wt.path);
              const isSafe = isWorktreeSafe(wt.path);

              if (!isClean) {
                logger.warn(`Worktree ${wt.branch} has uncommitted changes, skipping cleanup`);
                failedCleanups.push({
                  worktree: identifier,
                  reason: 'uncommitted changes',
                });
                continue;
              }

              if (!isSafe) {
                logger.warn(`Worktree ${wt.branch} is currently active, skipping cleanup`);
                failedCleanups.push({
                  worktree: identifier,
                  reason: 'currently active',
                });
                continue;
              }

              // All safety checks passed - remove the worktree
              try {
                logger.info(`Removing stale worktree: ${wt.branch} at ${wt.path}`);
                await execFileAsync('git', ['worktree', 'remove', wt.path, '--force'], {
                  cwd,
                  encoding: 'utf-8',
                  timeout: 30_000,
                });
                cleanedCount++;
                cleanedWorktrees.push(identifier);
                logger.info(`Successfully removed worktree: ${wt.branch}`);

                // Emit cleanup event for audit
                events.emit('maintenance:worktree_cleaned' as Parameters<typeof events.emit>[0], {
                  projectPath: cwd,
                  branch: wt.branch,
                  worktreePath: wt.path,
                  timestamp: new Date().toISOString(),
                });
              } catch (error) {
                logger.error(`Failed to remove worktree ${wt.branch}:`, error);
                failedCleanups.push({
                  worktree: identifier,
                  reason: `removal failed: ${error}`,
                });
              }
            }
          } catch (error) {
            logger.warn(`Error processing worktree ${wt.branch}:`, error);
            // Continue with other worktrees
          }
        }
      } catch (error) {
        logger.warn(`Stale worktree detection failed for ${cwd}:`, error);
        // Continue with other project paths
      }
    }

    if (staleCount > 0) {
      logger.info(
        `Stale worktrees: found ${staleCount}, cleaned ${cleanedCount}, failed ${failedCleanups.length}`
      );
      events.emit('scheduler:task_completed' as Parameters<typeof events.emit>[0], {
        taskId: 'maintenance:stale-worktrees',
        message: `Found ${staleCount} stale worktree(s), auto-cleaned ${cleanedCount}`,
        staleCount,
        cleanedCount,
        staleWorktrees,
        cleanedWorktrees,
        failedCleanups,
      });
    } else {
      logger.info('No stale worktrees found');
    }
  } catch (error) {
    logger.error('Stale worktree detection failed:', error);
    throw error;
  }
}

/**
 * Check for local branches that are already merged and auto-delete them.
 * Uses execFileAsync to avoid command injection and run asynchronously.
 * Safety checks: confirms branch is merged, no uncommitted work, not currently checked out.
 */
async function checkMergedBranches(
  events: EventEmitter,
  projectPaths: string[],
  settingsService?: SettingsService
): Promise<void> {
  logger.info('Checking for merged branches...');

  try {
    const cwd = projectPaths[0];
    if (!cwd) {
      logger.info('No known project paths, skipping merged branch check');
      return;
    }

    // Resolve the integration branch from settings (prBaseBranch), falling back to main/master
    const defaultBranch = await resolveIntegrationBranch(cwd, settingsService);
    if (!defaultBranch) {
      logger.warn(`No integration branch found for ${cwd}, skipping`);
      return;
    }

    // Get current branch to avoid deleting it
    const { stdout: currentBranchOutput } = await execFileAsync(
      'git',
      ['branch', '--show-current'],
      {
        encoding: 'utf-8',
        timeout: 5_000,
        cwd,
      }
    );
    const currentBranch = currentBranchOutput.trim();

    // Get branches merged into default branch
    const { stdout: output } = await execFileAsync('git', ['branch', '--merged', defaultBranch], {
      encoding: 'utf-8',
      timeout: 10_000,
      cwd,
    });

    const mergedBranches = output
      .split('\n')
      .map((line) => line.trim().replace(/^\*\s*/, ''))
      .filter(
        (branch) => branch && branch !== defaultBranch && branch !== 'main' && branch !== 'master'
      );

    if (mergedBranches.length === 0) {
      logger.info('No merged branches to clean up');
      return;
    }

    logger.info(`Found ${mergedBranches.length} merged branch(es): ${mergedBranches.join(', ')}`);

    let deletedCount = 0;
    const deletedBranches: string[] = [];
    const failedDeletions: Array<{ branch: string; reason: string }> = [];

    // Auto-delete merged branches with safety checks
    for (const branch of mergedBranches) {
      // Safety check: Don't delete current branch
      if (branch === currentBranch) {
        logger.warn(`Branch ${branch} is currently checked out, skipping deletion`);
        failedDeletions.push({
          branch,
          reason: 'currently checked out',
        });
        continue;
      }

      // Safety check: Verify branch is fully merged
      const isMerged = await isBranchFullyMerged(cwd, branch, defaultBranch);
      if (!isMerged) {
        logger.warn(`Branch ${branch} is not fully merged, skipping deletion`);
        failedDeletions.push({
          branch,
          reason: 'not fully merged',
        });
        continue;
      }

      // All safety checks passed - delete the branch
      try {
        logger.info(`Deleting merged branch: ${branch}`);
        await execFileAsync('git', ['branch', '-D', branch], {
          cwd,
          encoding: 'utf-8',
          timeout: 10_000,
        });
        deletedCount++;
        deletedBranches.push(branch);
        logger.info(`Successfully deleted branch: ${branch}`);

        // Emit cleanup event for audit
        events.emit('maintenance:branch_cleaned' as Parameters<typeof events.emit>[0], {
          projectPath: cwd,
          branch,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error(`Failed to delete branch ${branch}:`, error);
        failedDeletions.push({
          branch,
          reason: `deletion failed: ${error}`,
        });
      }
    }

    logger.info(
      `Merged branches: found ${mergedBranches.length}, deleted ${deletedCount}, failed ${failedDeletions.length}`
    );
    events.emit('scheduler:task_completed' as Parameters<typeof events.emit>[0], {
      taskId: 'maintenance:branch-cleanup',
      message: `Found ${mergedBranches.length} merged branch(es), auto-deleted ${deletedCount}`,
      mergedCount: mergedBranches.length,
      deletedCount,
      mergedBranches,
      deletedBranches,
      failedDeletions,
    });
  } catch (error) {
    logger.error('Merged branch check failed:', error);
    throw error;
  }
}

/**
 * Check data integrity across all active projects.
 * Monitors feature directory count and emits CRITICAL alerts on >50% drops.
 */
async function checkDataIntegrity(
  integrityWatchdogService: DataIntegrityWatchdogService,
  events: EventEmitter,
  autoModeService: AutoModeService
): Promise<void> {
  logger.info('Running data integrity check...');

  try {
    const projectPaths = getKnownProjectPaths(autoModeService);

    if (projectPaths.length === 0) {
      logger.info('No known project paths, skipping data integrity check');
      return;
    }

    let breachCount = 0;
    const breachedProjects: string[] = [];

    for (const projectPath of projectPaths) {
      try {
        const result = await integrityWatchdogService.checkIntegrity(projectPath);

        if (!result.intact) {
          breachCount++;
          breachedProjects.push(
            `${projectPath} (${result.lastKnownCount} → ${result.currentCount}, ${Math.round(result.dropPercentage)}% drop)`
          );
        }
      } catch (error) {
        logger.warn(`Data integrity check failed for ${projectPath}:`, error);
        // Continue with other projects
      }
    }

    if (breachCount > 0) {
      logger.error(
        `Data integrity check: ${breachCount} breach(es) detected - ${breachedProjects.join(', ')}`
      );
      events.emit('scheduler:task_completed' as Parameters<typeof events.emit>[0], {
        taskId: 'maintenance:data-integrity',
        message: `🔴 CRITICAL: ${breachCount} project(s) with data integrity breach`,
        breachCount,
        breachedProjects,
      });
    } else {
      logger.debug(`Data integrity check: all ${projectPaths.length} project(s) intact`);
    }
  } catch (error) {
    logger.error('Data integrity check failed:', error);
    throw error;
  }
}

/**
 * Scan all worktrees for uncommitted changes and unpushed commits.
 * This runs non-blocking after server initialization to detect and recover
 * from crashes where work was completed but not committed/pushed/PR'd.
 *
 * For features in verified/done status with unpushed work, triggers runPostCompletionWorkflow.
 * For features in other states, logs a warning.
 */
export async function scanWorktreesForCrashRecovery(
  projectPath: string,
  featureLoader: FeatureLoader,
  settingsService: SettingsService,
  events: EventEmitter
): Promise<void> {
  logger.info(`Starting crash recovery scan for ${projectPath}...`);

  try {
    let totalScanned = 0;
    let totalRecovered = 0;
    let totalWarnings = 0;
    const recoveredWorktrees: string[] = [];
    const warningWorktrees: Array<{ worktree: string; status: string; reason: string }> = [];

    // List all worktrees
    const { stdout: worktreeList } = await execFileAsync(
      'git',
      ['worktree', 'list', '--porcelain'],
      {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10_000,
      }
    );

    const integrationBranch = await resolveIntegrationBranch(projectPath, settingsService);
    const skipBranches = new Set(['main', 'master']);
    if (integrationBranch) skipBranches.add(integrationBranch);

    const worktrees = worktreeList
      .split('\n\n')
      .filter((block) => block.trim())
      .map((block) => {
        const lines = block.split('\n');
        const worktreeLine = lines.find((l) => l.startsWith('worktree '));
        const branchLine = lines.find((l) => l.startsWith('branch '));
        return {
          path: worktreeLine?.replace('worktree ', '') ?? '',
          branch: branchLine?.replace('branch refs/heads/', '') ?? '',
        };
      })
      .filter((w) => w.path && w.branch && !skipBranches.has(w.branch));

    logger.info(`Found ${worktrees.length} non-integration worktree(s) to scan`);

    // Get all features for this project
    const allFeatures = await featureLoader.getAll(projectPath);
    const featuresByBranch = new Map<string, Feature>();
    for (const feature of allFeatures) {
      if (feature.branchName) {
        featuresByBranch.set(feature.branchName, feature);
      }
    }

    // Scan each worktree
    for (const worktree of worktrees) {
      totalScanned++;
      const feature = featuresByBranch.get(worktree.branch);

      if (!feature) {
        logger.debug(`No feature found for worktree branch ${worktree.branch}, skipping`);
        continue;
      }

      // Check for uncommitted changes
      const { stdout: statusOutput } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: worktree.path,
        encoding: 'utf-8',
        timeout: 5_000,
      });
      const hasUncommittedChanges = statusOutput.trim() !== '';

      // Fetch the integration branch and prune stale refs in one step.
      // Using 'git fetch --prune origin <integrationBranch>' rather than 'git remote prune origin'
      // ensures two things:
      //   1. origin/<integrationBranch> is current — isBranchFullyMerged needs this to reliably
      //      detect merged work when the remote feature branch has been deleted (PR merged).
      //      'git remote prune origin' only removes stale tracking refs; it does NOT fetch new
      //      commits, so origin/dev could be stale and the merge check would return a false negative.
      //   2. Stale tracking refs for deleted branches are pruned — without this, git rev-list
      //      compares against a deleted remote SHA and 'git push --force-with-lease' fails with
      //      "stale info" on every retry.
      if (integrationBranch) {
        try {
          await execFileAsync('git', ['fetch', '--prune', 'origin', integrationBranch], {
            cwd: worktree.path,
            encoding: 'utf-8',
            timeout: 30_000,
          });
        } catch {
          // Non-fatal — fall back to prune-only so stale tracking refs are at least cleared
          try {
            await execFileAsync('git', ['remote', 'prune', 'origin'], {
              cwd: worktree.path,
              encoding: 'utf-8',
              timeout: 10_000,
            });
          } catch {
            // Non-fatal — continue with potentially stale refs
          }
        }
      } else {
        // No integration branch — just prune stale tracking refs
        try {
          await execFileAsync('git', ['remote', 'prune', 'origin'], {
            cwd: worktree.path,
            encoding: 'utf-8',
            timeout: 10_000,
          });
        } catch {
          // Non-fatal — continue with potentially stale refs
        }
      }

      // Check if remote branch still exists (ls-remote exits 2 if not found)
      let remoteBranchExists = false;
      try {
        await execFileAsync(
          'git',
          ['ls-remote', '--exit-code', 'origin', `refs/heads/${worktree.branch}`],
          { cwd: worktree.path, encoding: 'utf-8', timeout: 10_000 }
        );
        remoteBranchExists = true;
      } catch {
        remoteBranchExists = false;
      }

      // Check if the branch's work is already reachable from the integration branch.
      // If the remote branch is gone and the work is merged, this is a cleanup candidate — not a push candidate.
      if (!remoteBranchExists && integrationBranch) {
        const alreadyMerged = await isBranchFullyMerged(
          worktree.path,
          worktree.branch,
          `origin/${integrationBranch}`
        );
        if (alreadyMerged) {
          logger.info(
            `Worktree ${worktree.branch} (${feature.title}) — remote branch deleted and work already merged into ${integrationBranch}. Skipping push, queuing for cleanup.`
          );
          continue;
        }
      }

      // Check for unpushed commits (compare local branch to remote)
      let hasUnpushedCommits = false;
      if (remoteBranchExists) {
        try {
          const { stdout: revListOutput } = await execFileAsync(
            'git',
            ['rev-list', `origin/${worktree.branch}..${worktree.branch}`, '--count'],
            {
              cwd: worktree.path,
              encoding: 'utf-8',
              timeout: 5_000,
            }
          );
          const unpushedCount = parseInt(revListOutput.trim(), 10);
          hasUnpushedCommits = unpushedCount > 0;
        } catch {
          // rev-list failed even though remote exists — treat as unpushed
          hasUnpushedCommits = true;
        }
      } else {
        // Remote branch doesn't exist but work isn't merged — needs push
        hasUnpushedCommits = true;
      }

      // If no uncommitted changes and no unpushed commits, skip
      if (!hasUncommittedChanges && !hasUnpushedCommits) {
        logger.debug(`Worktree ${worktree.branch} is clean and up-to-date`);
        continue;
      }

      logger.info(
        `Worktree ${worktree.branch} (${feature.title}) has uncommitted: ${hasUncommittedChanges}, unpushed: ${hasUnpushedCommits}, remoteBranch: ${remoteBranchExists ? 'exists' : 'gone'}, status: ${feature.status}`
      );

      // For verified/done features with unpushed work, trigger post-completion workflow
      if (
        (feature.status === 'verified' || feature.status === 'done') &&
        (hasUncommittedChanges || hasUnpushedCommits)
      ) {
        const breaker = getWorktreeCircuitBreaker(worktree.branch);

        // Circuit breaker: skip this worktree if it has failed too many times recently
        if (breaker.isCircuitOpen()) {
          const state = breaker.getState();
          const minutesRemaining = Math.ceil(
            (PUSH_CIRCUIT_BREAKER_COOLDOWN_MS - state.timeSinceLastFailure) / 60_000
          );
          logger.warn(
            `Worktree ${worktree.branch} (${feature.title}) push circuit breaker is OPEN after ` +
              `${PUSH_FAILURE_THRESHOLD} consecutive failures. ` +
              `Skipping — will retry automatically in ~${minutesRemaining} minute(s). ` +
              `Manual intervention may be required (e.g. resolve a force-with-lease rejection).`
          );
          totalWarnings++;
          warningWorktrees.push({
            worktree: worktree.branch,
            status: feature.status,
            reason: `Push circuit breaker open (${PUSH_FAILURE_THRESHOLD} consecutive failures, ~${minutesRemaining}min until auto-retry) — needs manual intervention`,
          });
          continue;
        }

        logger.info(`Triggering post-completion workflow for ${feature.title} (${feature.status})`);

        try {
          const globalSettings = await settingsService.getGlobalSettings();
          const projectSettings = await settingsService.getProjectSettings(projectPath);
          const projectPrBaseBranch = projectSettings.workflow?.gitWorkflow?.prBaseBranch;
          const result = await gitWorkflowService.runPostCompletionWorkflow(
            projectPath,
            feature.id,
            feature,
            worktree.path,
            globalSettings,
            undefined,
            events,
            projectPrBaseBranch
          );

          if (result) {
            if (result.pushed) {
              // Push succeeded — clear any prior failure count
              breaker.recordSuccess();
            }
            totalRecovered++;
            recoveredWorktrees.push(
              `${worktree.branch} (${feature.title}) - committed: ${!!result.commitHash}, pushed: ${result.pushed}, PR: ${!!result.prUrl}`
            );
            if (result.pushed) {
              logger.info(`Successfully recovered ${worktree.branch}: ${JSON.stringify(result)}`);
            } else {
              logger.warn(
                `Partial recovery for ${worktree.branch} — workflow ran but push did not complete (pushed: false). ` +
                  `Result: ${JSON.stringify(result)}`
              );
            }
          } else {
            logger.debug(`No recovery actions needed for ${worktree.branch}`);
          }
        } catch (error) {
          const circuitOpened = breaker.recordFailure();
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (circuitOpened) {
            logger.error(
              `Worktree ${worktree.branch} (${feature.title}) push circuit breaker OPENED after ` +
                `${PUSH_FAILURE_THRESHOLD} consecutive failures. ` +
                `Auto-recovery suspended for ${PUSH_CIRCUIT_BREAKER_COOLDOWN_MS / 60_000} minutes. ` +
                `Last error: ${errorMessage}`
            );
            // Mark the feature blocked so the board reflects that it needs attention
            try {
              await featureLoader.update(projectPath, feature.id, {
                status: 'blocked',
                statusChangeReason:
                  `Push circuit breaker opened after ${PUSH_FAILURE_THRESHOLD} consecutive ` +
                  `crash-recovery failures. Last error: ${errorMessage}`,
              });
            } catch (updateError) {
              logger.error(`Failed to mark feature ${feature.id} as blocked:`, updateError);
            }
          } else {
            const state = breaker.getState();
            logger.error(
              `Failed to run post-completion workflow for ${worktree.branch} ` +
                `(failure ${state.failureCount}/${PUSH_FAILURE_THRESHOLD}):`,
              error
            );
          }

          totalWarnings++;
          warningWorktrees.push({
            worktree: worktree.branch,
            status: feature.status,
            reason: `Recovery failed: ${errorMessage}`,
          });
        }
      } else {
        // For other statuses, just log a warning
        totalWarnings++;
        const reason = hasUncommittedChanges
          ? 'uncommitted changes'
          : hasUnpushedCommits
            ? 'unpushed commits'
            : 'unknown';
        warningWorktrees.push({
          worktree: worktree.branch,
          status: feature.status ?? 'unknown',
          reason,
        });
        logger.warn(
          `Worktree ${worktree.branch} (${feature.status ?? 'unknown'}) has ${reason} but not in verified/done status`
        );
      }
    }

    // Log summary
    const message = `Crash recovery scan complete: ${totalScanned} worktree(s) scanned, ${totalRecovered} recovered, ${totalWarnings} warning(s)`;
    logger.info(message);

    // Emit event with results
    events.emit('maintenance:crash_recovery_scan_completed' as Parameters<typeof events.emit>[0], {
      projectPath,
      totalScanned,
      totalRecovered,
      totalWarnings,
      recoveredWorktrees: recoveredWorktrees.length > 0 ? recoveredWorktrees : undefined,
      warningWorktrees: warningWorktrees.length > 0 ? warningWorktrees : undefined,
    });
  } catch (error) {
    logger.error(`Crash recovery scan failed for ${projectPath}:`, error);
    // Don't throw - this is a non-blocking scan
  }
}
