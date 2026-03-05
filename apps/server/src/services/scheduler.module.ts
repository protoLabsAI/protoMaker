import { createLogger } from '@protolabsai/utils';

import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('Server:Wiring');

/**
 * Wires scheduler service initialization and registers automations + maintenance tasks.
 *
 * Delegates to automationService.syncWithScheduler() which:
 * 1. Registers built-in maintenance tasks
 * 2. Registers any user-defined cron automations from storage
 */
export function register(container: ServiceContainer): void {
  const {
    events,
    dataDir,
    settingsService,
    schedulerService,
    automationService,
    autoModeService,
    featureHealthService,
    integrityWatchdogService,
    featureLoader,
  } = container;

  // Scheduler Service initialization and task registration via AutomationService
  schedulerService.initialize(events, dataDir);
  schedulerService.setSettingsService(settingsService);
  void schedulerService
    .start()
    .then(async () => {
      await automationService.syncWithScheduler({
        events,
        autoModeService,
        featureHealthService,
        integrityWatchdogService,
        featureLoader,
        settingsService,
      });

      // Register calendar job executor — scans for due jobs every minute
      await schedulerService.registerTask(
        'job-executor:tick',
        'Calendar Job Executor',
        '* * * * *',
        () => container.jobExecutorService.tick(),
        true
      );

      // Apply taskOverrides from global settings after all tasks are registered
      await schedulerService.applySettingsOverrides();
    })
    .catch((err) => {
      logger.error('Scheduler startup or automation sync failed:', err);
    });
}
