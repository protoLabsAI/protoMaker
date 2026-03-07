// CRDT sync module — wires EventBus to CrdtSyncService for cross-instance event propagation.
// Startup handles the actual start() call after repoRoot is resolved.

import type { ServiceContainer } from '../server/services.js';

export async function register(container: ServiceContainer): Promise<void> {
  // Bridge the local EventBus to the CRDT sync channel.
  // After this call, broadcast() publishes feature events to remote peers and
  // incoming remote feature events are re-emitted locally.
  container.crdtSyncService.attachEventBus(container.events);

  // Register capacity provider so each heartbeat includes fresh instance metrics.
  // The provider is synchronous and non-blocking; backlog count is refreshed
  // async in the background on each call.
  container.crdtSyncService.setCapacityProvider(() =>
    container.autoModeService.getCapacityMetrics()
  );
}
