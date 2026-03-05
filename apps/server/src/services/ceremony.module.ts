import type { ServiceContainer } from '../server/services.js';

/**
 * Wires CeremonyService cross-service dependencies.
 * Passes schedulerService so CeremonyService can register/unregister standup tasks.
 */
export function register(container: ServiceContainer): void {
  const { ceremonyService, schedulerService } = container;
  ceremonyService.setSchedulerService(schedulerService);
}
