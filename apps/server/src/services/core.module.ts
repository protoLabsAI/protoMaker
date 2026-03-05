import type { ServiceContainer } from '../server/services.js';

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
    headsdownService,
    agentFactoryService,
    dynamicAgentExecutor,
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

  // HeadsdownService agent execution wiring
  headsdownService.setAgentExecution(agentFactoryService, dynamicAgentExecutor);

  // DevServerService event emitter wiring
  devServerService.setEventEmitter(events);

  // Notification Service event emitter wiring
  notificationService.setEventEmitter(events);

  // Actionable Items Service event emitter wiring
  actionableItemService.setEventEmitter(events);

  // Data Integrity Watchdog wiring
  integrityWatchdogService.setEventEmitter(events);
  featureLoader.setIntegrityWatchdog(integrityWatchdogService);

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
}
