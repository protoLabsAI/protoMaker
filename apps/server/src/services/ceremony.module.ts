import type { ServiceContainer } from '../server/services.js';
import { ceremonyActionExecutor } from './ceremony-action-executor.js';

/**
 * Wires CeremonyService cross-service dependencies.
 * Passes schedulerService so CeremonyService can register/unregister standup tasks.
 * Initializes CeremonyActionExecutor to process retro completion events.
 */
export function register(container: ServiceContainer): void {
  const { ceremonyService, schedulerService, events, featureLoader } = container;
  ceremonyService.setSchedulerService(schedulerService);
  ceremonyActionExecutor.initialize(events, featureLoader);
}
