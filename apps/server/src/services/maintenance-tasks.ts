/**
 * Maintenance Tasks - Preset scheduled tasks for system health
 *
 * Registers periodic maintenance tasks with the SchedulerService:
 * - Ava Gateway heartbeat (every 30 minutes): board health evaluation
 * - Stale feature detection (hourly): finds features stuck in running/in-progress
 * - Worktree cleanup (daily): detects stale worktrees for merged branches
 * - Branch cleanup (weekly): identifies local branches already merged to main
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

const execFileAsync = promisify(execFile);

const logger = createLogger('MaintenanceTasks');

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Register all maintenance tasks with the scheduler.
 * Called once during server initialization.
 */
export async function registerMaintenanceTasks(
  scheduler: SchedulerService,
  events: EventEmitter,
  autoModeService: AutoModeService,
  featureHealthService?: FeatureHealthService,
  avaGatewayService?: AvaGatewayService
): Promise<void> {
  logger.info('Registering maintenance tasks...');

  let taskCount = 3; // Base: stale-features, stale-worktrees, branch-cleanup

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

  // Daily at 3am: Detect stale worktrees
  await scheduler.registerTask(
    'maintenance:stale-worktrees',
    'Stale Worktree Detection',
    '0 3 * * *', // Daily at 3:00 AM
    async () => {
      const projectPaths = getKnownProjectPaths(autoModeService);
      await detectStaleWorktrees(events, projectPaths);
    }
  );

  // Weekly on Sunday at 4am: Identify merged branches that can be cleaned up
  await scheduler.registerTask(
    'maintenance:branch-cleanup',
    'Merged Branch Cleanup Check',
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
 * Detect stale git worktrees (branches already merged or inactive).
 * Uses execFileAsync to avoid command injection and run asynchronously.
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
    const staleWorktrees: string[] = [];

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
            await execFileAsync('git', ['merge-base', '--is-ancestor', wt.branch, defaultBranch], {
              encoding: 'utf-8',
              timeout: 5_000,
              cwd,
            });
            // If no error, branch IS merged into the default branch
            staleCount++;
            staleWorktrees.push(`${wt.branch} (${wt.path})`);
          } catch {
            // Branch is not merged, it's active
          }
        }
      } catch (error) {
        logger.warn(`Stale worktree detection failed for ${cwd}:`, error);
        // Continue with other project paths
      }
    }

    if (staleCount > 0) {
      logger.info(`Found ${staleCount} stale worktree(s): ${staleWorktrees.join(', ')}`);
      events.emit('scheduler:task_completed' as Parameters<typeof events.emit>[0], {
        taskId: 'maintenance:stale-worktrees',
        message: `Found ${staleCount} worktree(s) with merged branches that can be removed`,
        staleWorktrees,
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
 * Check for local branches that are already merged to main.
 * Uses execFileAsync to avoid command injection and run asynchronously.
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

    if (mergedBranches.length > 0) {
      logger.info(`Found ${mergedBranches.length} merged branch(es): ${mergedBranches.join(', ')}`);
      events.emit('scheduler:task_completed' as Parameters<typeof events.emit>[0], {
        taskId: 'maintenance:branch-cleanup',
        message: `Found ${mergedBranches.length} local branch(es) already merged to main`,
        mergedBranches,
      });
    } else {
      logger.info('No merged branches to clean up');
    }
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
