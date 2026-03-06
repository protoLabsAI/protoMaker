import { createLogger } from '@protolabsai/utils';

import type { ServiceContainer } from '../server/services.js';
import { EventLedgerService } from './event-ledger-service.js';

const logger = createLogger('Server:Wiring');

/**
 * Wires the EventLedgerService into the event bus, subscribing to all
 * lifecycle event types for persistent audit logging.
 */
export async function register(container: ServiceContainer): Promise<void> {
  const { events, dataDir } = container;

  const eventLedgerService = new EventLedgerService(dataDir);

  // Initialize ID set from disk (non-blocking — starts the Promise but doesn't await it here)
  void eventLedgerService.initialize().catch((err) => {
    logger.warn(
      'EventLedger: initialization failed, idempotency checks may miss existing IDs',
      err
    );
  });

  // Subscribe to all 13 lifecycle events
  eventLedgerService.subscribeToLifecycleEvents(events);

  logger.info('EventLedger: lifecycle event subscriptions registered');
}
