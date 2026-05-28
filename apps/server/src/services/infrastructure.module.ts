import { createLogger } from '@protolabsai/utils';

import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('Server:Wiring');

/**
 * Wires health monitor initialization.
 */
export function register(container: ServiceContainer): void {
  const { events, healthMonitorService } = container;

  // Health Monitor Service event emitter wiring
  healthMonitorService.setEventEmitter(events);
}
