/**
 * Maintenance Tasks - Preset scheduled tasks for system health
 *
 * Registers periodic maintenance tasks with the SchedulerService:
 * - Data integrity check (every 5 minutes): monitors feature directory count
 * - Ava Gateway heartbeat (every 30 minutes): board health evaluation
 * - Stale feature detection (hourly): finds features stuck in running/in-progress
 * - Worktree auto-cleanup (daily): auto-removes worktrees for merged branches with safety checks
 * - Branch auto-cleanup (weekly): auto-deletes local branches already merged to main with safety checks
 *
 * All tasks emit events for UI display and logging.
 */

import { createLogger } from '@automaker/utils';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { SchedulerService } from './scheduler-service.js';
import type { EventEmitter } from '../lib/events.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { FeatureHealthService } from './feature-health-service.js';
import type { AvaGatewayService } from './ava-gateway-service.js';
import type { DataIntegrityWatchdogService } from './data-integrity-watchdog-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import { mergeEligibilityService } from './merge-eligibility-service.js';
import { githubMergeService } from './github-merge-service.js';

const execFileAsync = promisify(execFile);

const logger = createLogger('MaintenanceTasks');

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

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
 * Register all maintenance tasks with the scheduler.
 * Called once during server initialization.
 */
export async function registerMaintenanceTasks(
  scheduler: SchedulerService,
  events: EventEmitter,
  autoModeService: AutoModeService,
  featureHealthService?: FeatureHealthService,
  avaGatewayService?: AvaGatewayService,
  integrityWatchdogService?: DataIntegrityWatchdogService,
  featureLoader?: FeatureLoader,
  settingsService?: SettingsService
): Promise<void> {
  logger.info('Registering maintenance tasks...');

  let taskCount = 3; // Base: stale-features, stale-worktrees, branch-cleanup

  // Every 5 minutes: Data integrity check
  if (integrityWatchdogService) {
    await scheduler.registerTask(
      'maintenance:data-integrity',
      'Data Integrity Check',
      '*/5 * * * *', // Every 5 minutes
      async () => {
        await checkDataIntegrity(integrityWatchdogService, events, autoModeService);
      }
    );
    taskCount++;
  }

  // Every 30 minutes: Ava Gateway heartbeat check
  if (avaGatewayService) {
    await scheduler.registerTask(
      'maintenance:ava-heartbeat',
      'Ava Gateway Heartbeat',
      '*/30 * * * *', // Every 30 minutes
      async () => {
        await runAvaHeartbeat(avaGatewayService, events);
      }
    );
    taskCount++;
  }

  // Hourly: Check for stale features (stuck in running for >2 hours)
  await scheduler.registerTask(
    'maintenance:stale-features',
    'Stale Feature Detection',
    '0 * * * *', // Every hour at :00
    async () => {
      await checkStaleFeatures(events, autoModeService);
    }
  );

  // Daily at 3am: Auto-cleanup stale worktrees for merged branches
  await scheduler.registerTask(
    'maintenance:stale-worktrees',
    'Stale Worktree Auto-Cleanup',
    '0 3 * * *', // Daily at 3:00 AM
    async () => {
      const projectPaths = getKnownProjectPaths(autoModeService);
      await detectStaleWorktrees(events, projectPaths);
    }
  );

  // Weekly on Sunday at 4am: Auto-delete merged branches
  await scheduler.registerTask(
    'maintenance:branch-cleanup',
    'Merged Branch Auto-Cleanup',
    '0 4 * * 0', // Sunday at 4:00 AM
    async () => {
      const projectPaths = getKnownProjectPaths(autoModeService);
      await checkMergedBranches(events, projectPaths);
    }
  );

  // Every 6 hours: Board health reconciliation with auto-fix
  if (featureHealthService) {
    await scheduler.registerTask(
      'maintenance:board-health',
      'Board Health Reconciliation',
      '0 */6 * * *', // Every 6 hours
      async () => {
        const projectPaths = getKnownProjectPaths(autoModeService);
        await runBoardHealthAudit(featureHealthService, events, projectPaths);
      }
    );
    taskCount++;
  }

  // Every 5 minutes: Auto-merge eligible PRs
  if (featureLoader && settingsService) {
    await scheduler.registerTask(
      'maintenance:auto-merge-prs',
      'Auto-Merge Eligible PRs',
      '*/5 * * * *', // Every 5 minutes
      async () => {
        const projectPaths = getKnownProjectPaths(autoModeService);
        await autoMergeEligiblePRs(featureLoader, settingsService, events, projectPaths);
      }
    );
    taskCount++;
    logger.info('Registered auto-merge PRs maintenance task');
  } else {
    logger.warn(
      `Skipping auto-merge PRs task registration - featureLoader: ${!!featureLoader}, settingsService: ${!!settingsService}`
    );
  }

  logger.info(`Registered ${taskCount} maintenance tasks`);
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
 * Run Ava Gateway heartbeat check to evaluate board health.
 * Invokes Ava agent to analyze board state and identify issues.
 */
async function runAvaHeartbeat(
  avaGatewayService: AvaGatewayService,
  events: EventEmitter
): Promise<void> {
  logger.info('Running Ava Gateway heartbeat...');

  try {
    const result = await avaGatewayService.runHeartbeat();

    if (result.status === 'alert' && result.alerts) {
      logger.info(`Ava heartbeat: ${result.alerts.length} alert(s) raised`);
      events.emit('scheduler:task_completed' as Parameters<typeof events.emit>[0], {
        taskId: 'maintenance:ava-heartbeat',
        message: `Ava identified ${result.alerts.length} alert(s) requiring attention`,
        alertCount: result.alerts.length,
        alerts: result.alerts,
      });
    } else {
      logger.info('Ava heartbeat: all systems nominal');
    }
  } catch (error) {
    logger.error('Ava heartbeat check failed:', error);
    // Don't throw - allow scheduler to continue
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
async function detectStaleWorktrees(events: EventEmitter, projectPaths: string[]): Promise<void> {
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
        // Detect default branch (try 'main' first, fall back to 'master')
        let defaultBranch = 'main';
        try {
          await execFileAsync('git', ['rev-parse', '--verify', 'main'], {
            cwd,
            encoding: 'utf-8',
            timeout: 5_000,
          });
        } catch {
          try {
            await execFileAsync('git', ['rev-parse', '--verify', 'master'], {
              cwd,
              encoding: 'utf-8',
              timeout: 5_000,
            });
            defaultBranch = 'master';
          } catch {
            // Neither main nor master exist, skip this project
            logger.warn(`No main or master branch found for ${cwd}, skipping`);
            continue;
          }
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
          if (wt.branch === 'main' || wt.branch === 'master') continue;

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
async function checkMergedBranches(events: EventEmitter, projectPaths: string[]): Promise<void> {
  logger.info('Checking for merged branches...');

  try {
    const cwd = projectPaths[0];
    if (!cwd) {
      logger.info('No known project paths, skipping merged branch check');
      return;
    }

    // Detect default branch (try main, fall back to master)
    let defaultBranch = 'main';
    try {
      await execFileAsync('git', ['rev-parse', '--verify', 'main'], {
        encoding: 'utf-8',
        timeout: 5_000,
        cwd,
      });
    } catch {
      try {
        await execFileAsync('git', ['rev-parse', '--verify', 'master'], {
          encoding: 'utf-8',
          timeout: 5_000,
          cwd,
        });
        defaultBranch = 'master';
      } catch {
        // Fall back to 'main' if neither exists
      }
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
      .filter((branch) => branch && branch !== 'main' && branch !== 'master');

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
 * Finds and fixes: orphaned epic refs, dangling deps, completed epics, stale running, merged-not-done.
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

      // Get all features in 'review' status
      const allFeatures = await featureLoader.getAll(projectPath);
      const reviewFeatures = allFeatures.filter((f) => f.status === 'review');

      logger.debug(`Found ${reviewFeatures.length} features in review status for ${projectPath}`);

      for (const feature of reviewFeatures) {
        if (!feature.prNumber) {
          logger.debug(`Feature ${feature.id} in review status but has no PR number, skipping`);
          continue;
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
