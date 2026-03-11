import type { ServiceContainer } from '../server/services.js';
import { ceremonyActionExecutor } from './ceremony-action-executor.js';

/**
 * Wires CeremonyService cross-service dependencies.
 * Passes schedulerService so CeremonyService can register/unregister standup tasks.
 * Passes calendarService so CeremonyService can upsert/delete ceremony calendar events.
 * Initializes CeremonyActionExecutor to process retro completion events.
 */
export function register(container: ServiceContainer): void {
  const { ceremonyService, schedulerService, calendarService, events, featureLoader } = container;
  ceremonyService.setSchedulerService(schedulerService);
  ceremonyService.setCalendarService(calendarService);
  ceremonyActionExecutor.initialize(events, featureLoader);
}
