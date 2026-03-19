import { createLogger } from '@protolabsai/utils';

import type { ServiceContainer } from '../server/services.js';
import { getPRWatcherService } from './pr-watcher-service.js';

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
    integrityWatchdogService,
    featureLoader,
    healthMonitorService,
    specGenerationMonitor,
    leadEngineerService,
    archivalService,
  } = container;

  // Wire schedulerService into interval-tracked services so their timers
  // appear in schedulerService.listAll() and can be inspected centrally.
  healthMonitorService.setSchedulerService(schedulerService);
  specGenerationMonitor.setSchedulerService(schedulerService);
  leadEngineerService.setSchedulerService(schedulerService);
  const prWatcher = getPRWatcherService();
  if (prWatcher) {
    prWatcher.setSchedulerService(schedulerService);
  }
  archivalService.setSchedulerService(schedulerService);

  // Scheduler Service initialization and task registration via AutomationService
  schedulerService.initialize(events, dataDir);
  schedulerService.setSettingsService(settingsService);
  void schedulerService
    .start()
    .then(async () => {
      await automationService.syncWithScheduler({
        events,
        autoModeService,
        integrityWatchdogService,
        featureLoader,
        settingsService,
      });

      // Apply taskOverrides from global settings after all tasks are registered
      await schedulerService.applySettingsOverrides();
    })
    .catch((err) => {
      logger.error('Scheduler startup or automation sync failed:', err);
    });
}
