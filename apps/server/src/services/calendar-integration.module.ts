import type { ServiceContainer } from '../server/services.js';

/**
 * Wires CalendarIntegrationService into the event bus and CalendarService.
 * Enables ops-type calendar entries to be created from feature lifecycle
 * and auto-mode events.
 */
export function register(container: ServiceContainer): void {
  const { calendarIntegrationService, events, calendarService } = container;
  calendarIntegrationService.initialize(events, calendarService);
}
