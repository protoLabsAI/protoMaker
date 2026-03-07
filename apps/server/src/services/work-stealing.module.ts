// Work-stealing module — wires WorkStealingService to EventBus and AutoModeService.
// Activated when proto.config.yaml defines workStealing config.

import type { ServiceContainer } from '../server/services.js';
import { WorkStealingService } from './work-stealing-service.js';

export async function register(container: ServiceContainer): Promise<void> {
  const service = new WorkStealingService(container.events, container.featureLoader);

  // Load work-stealing config from proto.config.yaml (uses defaults if missing)
  await service.configure(container.repoRoot);

  // Register event handlers for incoming work-stealing messages from peers
  service.registerHandlers();

  // Wire into auto-mode so idle instances trigger work requests
  container.autoModeService.setWorkStealingService(service);

  // Expose on container for status/diagnostics
  container.workStealingService = service;
}
