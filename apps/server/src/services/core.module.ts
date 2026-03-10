import type { ServiceContainer } from '../server/services.js';
import { getPRWatcherService } from './pr-watcher-service.js';

/**
 * Wires core service dependencies: calendar, headsdown, dev server, notifications,
 * data integrity watchdog, event stream buffer, auto-mode, and audit service.
 */
export function register(container: ServiceContainer): void {
  const {
    events,
    settingsService,
    featureLoader,
    autoModeService,
    featureHealthService,
    integrityWatchdogService,
    devServerService,
    notificationService,
    actionableItemService,
    calendarService,
    authorityService,
    leadEngineerService,
    auditService,
    eventStreamBuffer,
    hitlFormService,
  } = container;

  // HITLFormService — wire settingsService for featureFlags.pipeline gate
  hitlFormService.setSettingsService(settingsService);

  // Calendar service wiring
  calendarService.setFeatureLoader(featureLoader);

  // DevServerService event emitter wiring
  devServerService.setEventEmitter(events);

  // Notification Service event emitter wiring
  notificationService.setEventEmitter(events);

  // Actionable Items Service event emitter wiring
  actionableItemService.setEventEmitter(events);

  // Data Integrity Watchdog wiring
  integrityWatchdogService.setEventEmitter(events);
  featureLoader.setIntegrityWatchdog(integrityWatchdogService);

  // FeatureLoader event emitter — enables auto-emission of feature:status-changed
  featureLoader.setEventEmitter(events);

  // Event stream buffer subscription
  events.subscribe((type, payload) => {
    eventStreamBuffer.push(type, payload);
  });

  // Auto-mode cross-service wiring
  autoModeService.setAuthorityService(authorityService);
  autoModeService.setFeatureHealthService(featureHealthService);
  autoModeService.setIntegrityWatchdogService(integrityWatchdogService);
  autoModeService.setLeadEngineerService(leadEngineerService);

  // Audit service initialization
  auditService.initialize(authorityService);

  // PRWatcherService — initialize singleton with the app event bus so the watch_pr
  // Ava tool can call getPRWatcherService() without arguments and always get an instance.
  getPRWatcherService(events);
}
