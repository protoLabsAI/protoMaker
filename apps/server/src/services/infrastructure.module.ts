import { createLogger } from '@protolabs-ai/utils';

import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('Server:Wiring');

/**
 * Wires health monitor, Ava Gateway initialization,
 * and spec generation monitor.
 */
export function register(container: ServiceContainer): void {
  const { events, repoRoot, healthMonitorService, avaGatewayService, specGenerationMonitor } =
    container;

  // Health Monitor Service event emitter wiring
  healthMonitorService.setEventEmitter(events);

  // Ava Gateway Service initialization
  void avaGatewayService
    .initialize(events, repoRoot, process.env.DISCORD_CHANNEL_INFRA || '')
    .then(() => {
      avaGatewayService.start();
      logger.info('Ava Gateway Service started and listening to events');
    })
    .catch((err) => {
      logger.error('Ava Gateway Service initialization failed:', err);
    });

  // Spec Generation Monitor start
  specGenerationMonitor.startMonitoring();
}
