import { createLogger } from '@protolabs-ai/utils';

import { registerMaintenanceTasks } from './maintenance-tasks.js';
import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('Server:Wiring');

/**
 * Wires scheduler service initialization and registers maintenance tasks.
 */
export function register(container: ServiceContainer): void {
  const {
    events,
    dataDir,
    settingsService,
    schedulerService,
    autoModeService,
    featureHealthService,
    integrityWatchdogService,
    featureLoader,
    graphiteSyncScheduler,
  } = container;

  // Scheduler Service initialization and maintenance task registration
  schedulerService.initialize(events, dataDir);
  void schedulerService
    .start()
    .then(() => {
      return registerMaintenanceTasks(
        schedulerService,
        events,
        autoModeService,
        featureHealthService,
        integrityWatchdogService,
        featureLoader,
        settingsService,
        graphiteSyncScheduler
      );
    })
    .catch((err) => {
      logger.error('Scheduler startup or maintenance task registration failed:', err);
    });
}
