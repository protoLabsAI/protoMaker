// CRDT sync module — no cross-service wiring needed at this stage.
// Startup handles the actual start() call after repoRoot is resolved.

import type { ServiceContainer } from '../server/services.js';

export async function register(_container: ServiceContainer): Promise<void> {
  // No cross-service wiring required for crdt-sync at startup.
  // CrdtSyncService.start() is called from startup.ts with repoRoot.
}
