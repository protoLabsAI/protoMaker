/**
 * Ava Cron Tasks — registers recurring Ava agent tasks in the SchedulerService.
 *
 * Three built-in tasks:
 * 1. ava-daily-board-health (09:00 daily)   — stale features, blocked agents, open PRs with failing CI
 * 2. ava-pr-triage         (every 4 hours)  — CodeRabbit threads, CI failures, merge conflicts
 * 3. ava-staging-ping      (every 30 min)   — capacity heartbeat + quiet-staging alert
 */

import { createLogger } from '@protolabsai/utils';
import type { SchedulerService } from './scheduler-service.js';
import type { ReactiveSpawnerService } from './reactive-spawner-service.js';

const logger = createLogger('AvaCronTasks');

export interface AvaCronTaskDeps {
  schedulerService: SchedulerService;
  reactiveSpawnerService: ReactiveSpawnerService;
  projectPath: string;
}

/**
 * Register Ava's built-in recurring tasks in the SchedulerService.
 * Must be called after ReactiveSpawnerService is initialized.
 */
export async function registerAvaCronTasks(deps: AvaCronTaskDeps): Promise<void> {
  const { schedulerService, reactiveSpawnerService, projectPath: _projectPath } = deps;

  // 1. Daily board health check at 09:00
  await schedulerService.registerTask(
    'ava-daily-board-health',
    'Ava Daily Board Health',
    '0 9 * * *',
    async () => {
      logger.info('[AvaCronTasks] Running ava-daily-board-health');
      const result = await reactiveSpawnerService.spawnForCron(
        'ava-daily-board-health',
        'Check the board for stale features (no activity in the past 24 hours), ' +
          'blocked agents, and open PRs with failing CI. ' +
          'File tickets for anything that needs attention.'
      );
      if (!result.spawned) {
        logger.warn(
          `[AvaCronTasks] ava-daily-board-health skipped: ${result.skippedReason ?? result.error}`
        );
      }
    },
    true
  );

  // 2. PR triage every 4 hours
  await schedulerService.registerTask(
    'ava-pr-triage',
    'Ava PR Triage',
    '0 */4 * * *',
    async () => {
      logger.info('[AvaCronTasks] Running ava-pr-triage');
      const result = await reactiveSpawnerService.spawnForCron(
        'ava-pr-triage',
        'Scan all open PRs for CodeRabbit review threads, CI failures, and merge conflicts. ' +
          'Take direct action where possible; file tickets for anything that requires a new PR.'
      );
      if (!result.spawned) {
        logger.warn(
          `[AvaCronTasks] ava-pr-triage skipped: ${result.skippedReason ?? result.error}`
        );
      }
    },
    true
  );

  // 3. Staging ping every 30 minutes
  await schedulerService.registerTask(
    'ava-staging-ping',
    'Ava Staging Ping',
    '*/30 * * * *',
    async () => {
      logger.info('[AvaCronTasks] Running ava-staging-ping');
      const result = await reactiveSpawnerService.spawnForCron(
        'ava-staging-ping',
        'Post a capacity_heartbeat request to the Ava Channel. ' +
          'Report if staging has been quiet for more than 2 hours.'
      );
      if (!result.spawned) {
        logger.warn(
          `[AvaCronTasks] ava-staging-ping skipped: ${result.skippedReason ?? result.error}`
        );
      }
    },
    true
  );

  logger.info('[AvaCronTasks] Registered 3 Ava cron tasks');
}
