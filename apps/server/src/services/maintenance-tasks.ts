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
import type { AutoModeService } from './auto-mode-service.js';
import type { FeatureHealthService } from './feature-health-service.js';
import type { DataIntegrityWatchdogService } from './data-integrity-watchdog-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import { mergeEligibilityService } from './merge-eligibility-service.js';
import { githubMergeService } from './github-merge-service.js';
import { gitWorkflowService } from './git-workflow-service.js';
import type { Feature } from '@protolabsai/types';
import { Octokit } from '@octokit/rest';

const execFileAsync = promisify(execFile);

const logger = createLogger('MaintenanceTasks');

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
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
 * Reads prBaseBranch from global settings, then verifies the branch exists locally.
 * Falls back to main → master if the configured branch doesn't exist.
 */
async function resolveIntegrationBranch(
  cwd: string,
  settingsService?: SettingsService
): Promise<string | null> {
  // Read prBaseBranch from settings
  const configuredBranch = settingsService
    ? (await settingsService.getGlobalSettings().catch(() => null))?.gitWorkflow?.prBaseBranch
    : undefined;
  const candidates = [
    configuredBranch ?? DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch,
    'main',
    'master',
  ];
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
    featureHealthService?: FeatureHealthService;
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
  });

  registry.register('built-in:branch-cleanup', async () => {
    const projectPaths = getKnownProjectPaths(autoModeService);
    await checkMergedBranches(events, projectPaths, deps.settingsService);
  });

  // Conditional on optional services
  if (deps.integrityWatchdogService) {
    const watchdog = deps.integrityWatchdogService;
    registry.register('built-in:data-integrity', async () => {
      await checkDataIntegrity(watchdog, events, autoModeService);
    });
  }

  if (deps.featureHealthService) {
    const fhs = deps.featureHealthService;
    registry.register('built-in:board-health', async () => {
      const projectPaths = getKnownProjectPaths(autoModeService);
      await runBoardHealthAudit(fhs, events, projectPaths);
    });
  }

  if (deps.featureLoader && deps.settingsService) {
    const fl = deps.featureLoader;
    const ss = deps.settingsService;
    registry.register('built-in:auto-merge-prs', async () => {
      const projectPaths = getKnownProjectPaths(autoModeService);
      await autoMergeEligiblePRs(fl, ss, events, projectPaths);
    });
    registry.register('built-in:auto-rebase-stale-prs', async () => {
      const projectPaths = getKnownProjectPaths(autoModeService);
      await autoRebaseStalePRs(fl, ss, events, projectPaths);
    });
  }

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
 * Run board health audit with auto-fix enabled.
 * Finds and fixes: orphaned epic refs, dangling deps, completed epics, stale running, stale gates.
 * Runs against all known project paths rather than relying on process.cwd().
 */
async function runBoardHealthAudit(
  featureHealthService: FeatureHealthService,
  events: EventEmitter,
  projectPaths: string[]
): Promise<void> {
  logger.info('Running board health reconciliation...');

  if (projectPaths.length === 0) {
    logger.info('No known project paths, skipping board health audit');
    return;
  }

  try {
    let totalIssues = 0;
    let totalFixed = 0;
    const allIssueMessages: string[] = [];

    for (const projectPath of projectPaths) {
      const report = await featureHealthService.audit(projectPath, true);
      totalIssues += report.issues.length;
      totalFixed += report.fixed.length;
      allIssueMessages.push(
        ...report.issues.map((i) => `[${i.type}] ${i.featureTitle}: ${i.message}`)
      );
    }

    if (totalIssues > 0) {
      logger.info(`Board health: ${totalIssues} issues found, ${totalFixed} auto-fixed`);
      events.emit('scheduler:task_completed' as Parameters<typeof events.emit>[0], {
        taskId: 'maintenance:board-health',
        message: `Board health: ${totalIssues} issue(s) found, ${totalFixed} auto-fixed`,
        totalIssues,
        fixedCount: totalFixed,
        issues: allIssueMessages,
      });
    } else {
      logger.info('Board health check: no issues found');
    }
  } catch (error) {
    logger.error('Board health reconciliation failed:', error);
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
 * Auto-merge eligible PRs for features in 'review' status.
 * Polls features every 5 minutes, checks merge eligibility, and auto-merges if all checks pass.
 */
async function autoMergeEligiblePRs(
  featureLoader: FeatureLoader,
  settingsService: SettingsService,
  events: EventEmitter,
  projectPaths: string[]
): Promise<void> {
  logger.info('Checking for eligible PRs to auto-merge...');

  if (projectPaths.length === 0) {
    logger.info('No known project paths, skipping auto-merge check');
    return;
  }

  try {
    let totalChecked = 0;
    let totalMerged = 0;
    let totalSkipped = 0;
    const mergedPRs: string[] = [];
    const skippedPRs: Array<{ pr: string; reason: string }> = [];

    for (const projectPath of projectPaths) {
      // Get project settings to check if auto-merge is enabled
      const projectSettings = await settingsService.getProjectSettings(projectPath);
      const autoMergeSettings = projectSettings.webhookSettings?.autoMerge;

      if (!autoMergeSettings?.enabled) {
        logger.debug(`Auto-merge disabled for project: ${projectPath}`);
        continue;
      }

      const integrationBranch = await resolveIntegrationBranch(projectPath, settingsService);

      // Get all features in 'review' status
      const allFeatures = await featureLoader.getAll(projectPath);
      const reviewFeatures = allFeatures.filter((f) => f.status === 'review');

      logger.debug(`Found ${reviewFeatures.length} features in review status for ${projectPath}`);

      for (const feature of reviewFeatures) {
        if (!feature.prNumber) {
          logger.debug(`Feature ${feature.id} in review status but has no PR number, skipping`);
          continue;
        }

        if (integrationBranch) {
          try {
            const { stdout: prViewOut } = await execFileAsync(
              'gh',
              ['pr', 'view', String(feature.prNumber), '--json', 'baseRefName'],
              { cwd: projectPath, encoding: 'utf-8', timeout: 10_000 }
            );
            const prBaseBranch = JSON.parse(prViewOut).baseRefName;
            if (prBaseBranch !== integrationBranch) {
              logger.debug(
                `PR #${feature.prNumber} targets '${prBaseBranch}', not integration branch '${integrationBranch}', skipping`
              );
              continue;
            }
          } catch (err) {
            logger.warn(`Failed to fetch base branch for PR #${feature.prNumber}:`, err);
          }
        }

        totalChecked++;

        // Check merge eligibility using MergeEligibilityService
        const eligibilityResult = await mergeEligibilityService.evaluatePR(
          projectPath,
          feature.prNumber,
          autoMergeSettings
        );

        logger.info(
          `PR #${feature.prNumber} (${feature.title}) eligibility: ${eligibilityResult.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'} - ${eligibilityResult.summary}`
        );

        if (!eligibilityResult.eligible) {
          totalSkipped++;
          skippedPRs.push({
            pr: `#${feature.prNumber} (${feature.title})`,
            reason: eligibilityResult.summary,
          });
          continue;
        }

        // PR is eligible - attempt to merge
        const mergeStrategy = autoMergeSettings.mergeMethod || 'squash';
        logger.info(
          `Attempting to auto-merge PR #${feature.prNumber} (${feature.title}) using ${mergeStrategy} strategy`
        );

        const mergeResult = await githubMergeService.mergePR(
          projectPath,
          feature.prNumber,
          mergeStrategy,
          false // Don't wait for CI - we already checked eligibility
        );

        if (mergeResult.success) {
          totalMerged++;
          mergedPRs.push(`#${feature.prNumber} (${feature.title})`);
          logger.info(
            `Successfully auto-merged PR #${feature.prNumber} (${feature.title})${mergeResult.mergeCommitSha ? ` - commit: ${mergeResult.mergeCommitSha}` : ''}`
          );
        } else {
          totalSkipped++;
          skippedPRs.push({
            pr: `#${feature.prNumber} (${feature.title})`,
            reason: mergeResult.error || 'Unknown error',
          });
          logger.warn(
            `Failed to auto-merge PR #${feature.prNumber} (${feature.title}): ${mergeResult.error}`
          );
        }
      }
    }

    // Emit completion event with results
    if (totalChecked > 0) {
      const message =
        totalMerged > 0
          ? `Auto-merged ${totalMerged}/${totalChecked} eligible PR(s)${totalSkipped > 0 ? `, skipped ${totalSkipped}` : ''}`
          : `Checked ${totalChecked} PR(s) in review status, none were eligible for auto-merge`;

      logger.info(message);
      events.emit('scheduler:task_completed' as Parameters<typeof events.emit>[0], {
        taskId: 'maintenance:auto-merge-prs',
        message,
        totalChecked,
        totalMerged,
        totalSkipped,
        mergedPRs: mergedPRs.length > 0 ? mergedPRs : undefined,
        skippedPRs: skippedPRs.length > 0 ? skippedPRs : undefined,
      });
    } else {
      logger.info('No PRs in review status to check');
    }
  } catch (error) {
    logger.error('Auto-merge PR check failed:', error);
    throw error;
  }
}

/**
 * Result from checking if a PR is behind its base branch
 */
interface PRBehindStatus {
  prNumber: number;
  branchName: string;
  baseBranch: string;
  isBehind: boolean;
  behindBy?: number; // Number of commits behind
}

/**
 * Check if a PR is behind its base branch using GitHub CLI
 */
async function checkPRBehindStatus(
  projectPath: string,
  prNumber: number
): Promise<PRBehindStatus | null> {
  try {
    // Get PR details including head branch, base branch, and mergeable status
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'view', String(prNumber), '--json', 'headRefName,baseRefName,mergeable'],
      {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10_000,
      }
    );

    const prData = JSON.parse(stdout);
    const headBranch = prData.headRefName;
    const baseBranch = prData.baseRefName;

    // Check how many commits the head branch is behind the base branch
    const { stdout: revListOutput } = await execFileAsync(
      'git',
      ['rev-list', '--count', `${headBranch}..${baseBranch}`],
      {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10_000,
      }
    );

    const behindBy = parseInt(revListOutput.trim(), 10);
    const isBehind = behindBy > 0;

    return {
      prNumber,
      branchName: headBranch,
      baseBranch,
      isBehind,
      behindBy: isBehind ? behindBy : undefined,
    };
  } catch (error) {
    logger.warn(`Failed to check if PR #${prNumber} is behind base:`, error);
    return null;
  }
}

/**
 * Send a Discord notification about a PR conflict requiring human attention
 */
async function sendDiscordConflictAlert(
  prNumber: number,
  branchName: string,
  baseBranch: string,
  prUrl: string,
  errorMessage: string
): Promise<void> {
  try {
    logger.info(`Sending Discord notification for PR #${prNumber} conflict`);

    // Use Discord MCP tool to send notification
    // Note: This requires Discord MCP to be configured
    // The MCP tools are available via the claude plugin system

    // For now, we'll log the alert - in production, this would call the Discord MCP tool
    logger.warn(
      `🔴 PR CONFLICT ALERT:\n` +
        `PR #${prNumber}: ${branchName}\n` +
        `Base: ${baseBranch}\n` +
        `URL: ${prUrl}\n` +
        `Error: ${errorMessage}\n` +
        `Action Required: Manual resolution needed`
    );

    // TODO: Implement Discord MCP call when Discord service is fully integrated
    // Example (when Discord MCP is available):
    // await discordService.sendMessage({
    //   channelId: settings.discord.alertChannelId,
    //   content: `🔴 **PR Conflict Alert**\n\n` +
    //     `PR #${prNumber}: \`${branchName}\`\n` +
    //     `Base: \`${baseBranch}\`\n` +
    //     `${prUrl}\n\n` +
    //     `**Error:** ${errorMessage}\n\n` +
    //     `⚠️ Manual resolution required - automatic rebase failed due to conflicts.`
    // });
  } catch (error) {
    logger.error(`Failed to send Discord conflict alert for PR #${prNumber}:`, error);
  }
}

// Known conflict files that can be auto-resolved during rebase
const AUTO_RESOLVE_DELETE_FILES = ['.automaker-lock'];

/**
 * Perform a local rebase of a feature branch against its base branch,
 * auto-resolving known conflicts (e.g. .automaker-lock) and force-pushing.
 *
 * Uses a temporary worktree to avoid disrupting the main repo checkout.
 * Falls back gracefully if conflicts are unresolvable.
 */
async function localRebaseAndPush(
  projectPath: string,
  branchName: string,
  baseBranch: string,
  prNumber: number
): Promise<{ success: boolean; hasUnresolvableConflicts?: boolean; error?: string }> {
  const tmpWorktree = `${projectPath}/.worktrees/.rebase-tmp-${prNumber}`;

  try {
    // Fetch latest state
    await execFileAsync('git', ['fetch', 'origin', branchName, baseBranch], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 30_000,
    });

    // Create a temporary worktree for the rebase
    try {
      await execFileAsync(
        'git',
        ['worktree', 'add', tmpWorktree, `origin/${branchName}`, '--detach'],
        { cwd: projectPath, encoding: 'utf-8', timeout: 10_000 }
      );
    } catch (addError) {
      // Worktree might already exist from a failed previous run
      try {
        await execFileAsync('git', ['worktree', 'remove', tmpWorktree, '--force'], {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 10_000,
        });
        await execFileAsync(
          'git',
          ['worktree', 'add', tmpWorktree, `origin/${branchName}`, '--detach'],
          { cwd: projectPath, encoding: 'utf-8', timeout: 10_000 }
        );
      } catch {
        return { success: false, error: `Failed to create temp worktree: ${addError}` };
      }
    }

    // Create a local branch tracking the remote
    await execFileAsync('git', ['checkout', '-B', branchName, `origin/${branchName}`], {
      cwd: tmpWorktree,
      encoding: 'utf-8',
      timeout: 10_000,
    });

    // Attempt rebase
    try {
      await execFileAsync('git', ['rebase', `origin/${baseBranch}`], {
        cwd: tmpWorktree,
        encoding: 'utf-8',
        timeout: 120_000,
      });
    } catch {
      // Rebase hit conflicts — try to auto-resolve known files
      const resolved = await tryAutoResolveConflicts(tmpWorktree, baseBranch);
      if (!resolved) {
        // Abort the rebase and report failure
        try {
          await execFileAsync('git', ['rebase', '--abort'], {
            cwd: tmpWorktree,
            encoding: 'utf-8',
            timeout: 10_000,
          });
        } catch {
          // Abort might fail if rebase already completed
        }
        return {
          success: false,
          hasUnresolvableConflicts: true,
          error: 'Conflicts could not be auto-resolved',
        };
      }
    }

    // Force-push the rebased branch
    await execFileAsync(
      'git',
      ['push', 'origin', `${branchName}:${branchName}`, '--force-with-lease'],
      { cwd: tmpWorktree, encoding: 'utf-8', timeout: 30_000 }
    );

    logger.info(`Local rebase + push succeeded for PR #${prNumber} (${branchName})`);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  } finally {
    // Always clean up the temporary worktree
    try {
      await execFileAsync('git', ['worktree', 'remove', tmpWorktree, '--force'], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10_000,
      });
    } catch {
      logger.warn(`Failed to clean up temp worktree at ${tmpWorktree}`);
    }
  }
}

/**
 * Try to auto-resolve rebase conflicts by handling known files.
 * Iterates rebase steps, resolving `.automaker-lock` by deleting it.
 * Returns true if all conflicts were resolved successfully.
 */
async function tryAutoResolveConflicts(
  worktreePath: string,
  _baseBranch: string
): Promise<boolean> {
  // Max iterations to prevent infinite loops
  const MAX_ITERATIONS = 20;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Check which files have conflicts
    let conflictedFiles: string[];
    try {
      const { stdout } = await execFileAsync('git', ['diff', '--name-only', '--diff-filter=U'], {
        cwd: worktreePath,
        encoding: 'utf-8',
        timeout: 5_000,
      });
      conflictedFiles = stdout.trim().split('\n').filter(Boolean);
    } catch {
      return false;
    }

    if (conflictedFiles.length === 0) {
      // No more conflicts — rebase might be done
      return true;
    }

    // Check if all conflicts are auto-resolvable
    const unresolvable = conflictedFiles.filter((f) => !AUTO_RESOLVE_DELETE_FILES.includes(f));
    if (unresolvable.length > 0) {
      logger.warn(`Unresolvable conflicts in: ${unresolvable.join(', ')}`);
      return false;
    }

    // Auto-resolve by deleting known conflict files
    for (const file of conflictedFiles) {
      try {
        await execFileAsync('git', ['rm', '-f', file], {
          cwd: worktreePath,
          encoding: 'utf-8',
          timeout: 5_000,
        });
      } catch {
        return false;
      }
    }

    // Continue the rebase
    try {
      await execFileAsync('git', ['rebase', '--continue'], {
        cwd: worktreePath,
        encoding: 'utf-8',
        timeout: 60_000,
        env: {
          ...process.env,
          GIT_EDITOR: 'true', // Skip commit message editing
        },
      });
      // Rebase continued successfully — might be done or might hit another conflict
    } catch {
      // Another conflict — loop will check and resolve
    }
  }

  logger.warn(`Auto-resolve exceeded ${MAX_ITERATIONS} iterations`);
  return false;
}

/**
 * Auto-rebase stale PRs that are behind their base branch.
 * Uses local rebase with auto-conflict resolution, falling back to escalation
 * for unresolvable conflicts.
 */
async function autoRebaseStalePRs(
  featureLoader: FeatureLoader,
  settingsService: SettingsService,
  events: EventEmitter,
  projectPaths: string[]
): Promise<void> {
  logger.info('Checking for stale PRs to auto-rebase...');

  if (projectPaths.length === 0) {
    logger.info('No known project paths, skipping stale PR rebase check');
    return;
  }

  try {
    let totalChecked = 0;
    let totalRebased = 0;
    let totalConflicts = 0;
    let totalSkipped = 0;
    const rebasedPRs: string[] = [];
    const conflictPRs: Array<{ pr: string; reason: string }> = [];
    const skippedPRs: Array<{ pr: string; reason: string }> = [];

    for (const projectPath of projectPaths) {
      const integrationBranch = await resolveIntegrationBranch(projectPath, settingsService);

      // Get all features in 'review' status
      const allFeatures = await featureLoader.getAll(projectPath);
      const reviewFeatures = allFeatures.filter((f) => f.status === 'review');

      logger.debug(`Found ${reviewFeatures.length} features in review status for ${projectPath}`);

      for (const feature of reviewFeatures) {
        if (!feature.prNumber || !feature.branchName) {
          logger.debug(
            `Feature ${feature.id} in review status but missing PR number or branch name, skipping`
          );
          continue;
        }

        totalChecked++;

        // Check if PR is behind its base branch
        const behindStatus = await checkPRBehindStatus(projectPath, feature.prNumber);

        if (!behindStatus) {
          totalSkipped++;
          skippedPRs.push({
            pr: `#${feature.prNumber} (${feature.title})`,
            reason: 'Failed to check behind status',
          });
          continue;
        }

        if (integrationBranch && behindStatus.baseBranch !== integrationBranch) {
          logger.debug(
            `PR #${feature.prNumber} targets '${behindStatus.baseBranch}', not integration branch '${integrationBranch}', skipping`
          );
          continue;
        }

        if (!behindStatus.isBehind) {
          logger.debug(`PR #${feature.prNumber} (${feature.title}) is up to date with base branch`);
          continue;
        }

        logger.info(
          `PR #${feature.prNumber} (${feature.title}) is ${behindStatus.behindBy} commit(s) behind ${behindStatus.baseBranch}`
        );

        try {
          // Try local rebase first — more reliable than gh pr rebase and can
          // auto-resolve known conflicts like .automaker-lock
          const localResult = await localRebaseAndPush(
            projectPath,
            feature.branchName,
            behindStatus.baseBranch,
            feature.prNumber
          );

          if (localResult.success) {
            totalRebased++;
            rebasedPRs.push(`#${feature.prNumber} (${feature.title})`);
            logger.info(
              `Successfully rebased PR #${feature.prNumber} (${feature.title}) via local rebase`
            );
          } else if (localResult.hasUnresolvableConflicts) {
            totalConflicts++;
            conflictPRs.push({
              pr: `#${feature.prNumber} (${feature.title})`,
              reason: localResult.error || 'Unresolvable conflicts',
            });
            logger.warn(
              `PR #${feature.prNumber} (${feature.title}) has unresolvable conflicts: ${localResult.error}`
            );
          } else {
            totalSkipped++;
            skippedPRs.push({
              pr: `#${feature.prNumber} (${feature.title})`,
              reason: localResult.error || 'Unknown error',
            });
            logger.warn(
              `Failed to rebase PR #${feature.prNumber} (${feature.title}): ${localResult.error}`
            );
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          totalSkipped++;
          skippedPRs.push({
            pr: `#${feature.prNumber} (${feature.title})`,
            reason: errorMsg,
          });
          logger.warn(`Failed to rebase PR #${feature.prNumber} (${feature.title}): ${errorMsg}`);
        }
      }
    }

    // Emit completion event with results
    if (totalChecked > 0) {
      const message =
        totalRebased > 0
          ? `Auto-rebased ${totalRebased}/${totalChecked} stale PR(s)${totalConflicts > 0 ? `, ${totalConflicts} conflict(s) escalated` : ''}${totalSkipped > 0 ? `, skipped ${totalSkipped}` : ''}`
          : `Checked ${totalChecked} PR(s), none required rebasing`;

      logger.info(message);
      events.emit('scheduler:task_completed' as Parameters<typeof events.emit>[0], {
        taskId: 'maintenance:auto-rebase-stale-prs',
        message,
        totalChecked,
        totalRebased,
        totalConflicts,
        totalSkipped,
        rebasedPRs: rebasedPRs.length > 0 ? rebasedPRs : undefined,
        conflictPRs: conflictPRs.length > 0 ? conflictPRs : undefined,
        skippedPRs: skippedPRs.length > 0 ? skippedPRs : undefined,
      });
    } else {
      logger.info('No PRs in review status to check for stale rebase');
    }
  } catch (error) {
    logger.error('Auto-rebase stale PRs check failed:', error);
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

      // Check for unpushed commits (compare local branch to remote)
      let hasUnpushedCommits = false;
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
      } catch (_error) {
        // Remote branch might not exist yet - treat as unpushed
        logger.debug(`Could not check unpushed commits for ${worktree.branch}, assuming unpushed`);
        hasUnpushedCommits = true;
      }

      // If no uncommitted changes and no unpushed commits, skip
      if (!hasUncommittedChanges && !hasUnpushedCommits) {
        logger.debug(`Worktree ${worktree.branch} is clean and up-to-date`);
        continue;
      }

      logger.info(
        `Worktree ${worktree.branch} (${feature.title}) has uncommitted: ${hasUncommittedChanges}, unpushed: ${hasUnpushedCommits}, status: ${feature.status}`
      );

      // For verified/done features with unpushed work, trigger post-completion workflow
      if (
        (feature.status === 'verified' || feature.status === 'done') &&
        (hasUncommittedChanges || hasUnpushedCommits)
      ) {
        logger.info(`Triggering post-completion workflow for ${feature.title} (${feature.status})`);

        try {
          const globalSettings = await settingsService.getGlobalSettings();
          const result = await gitWorkflowService.runPostCompletionWorkflow(
            projectPath,
            feature.id,
            feature,
            worktree.path,
            globalSettings,
            undefined,
            events
          );

          if (result) {
            totalRecovered++;
            recoveredWorktrees.push(
              `${worktree.branch} (${feature.title}) - committed: ${!!result.commitHash}, pushed: ${result.pushed}, PR: ${!!result.prUrl}`
            );
            logger.info(`Successfully recovered ${worktree.branch}: ${JSON.stringify(result)}`);
          } else {
            logger.debug(`No recovery actions needed for ${worktree.branch}`);
          }
        } catch (error) {
          logger.error(`Failed to run post-completion workflow for ${worktree.branch}:`, error);
          totalWarnings++;
          warningWorktrees.push({
            worktree: worktree.branch,
            status: feature.status,
            reason: `Recovery failed: ${error instanceof Error ? error.message : String(error)}`,
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
