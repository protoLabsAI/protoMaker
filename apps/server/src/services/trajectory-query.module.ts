import type { ServiceContainer } from '../server/services.js';

/**
 * Wires the TrajectoryQueryService into the service container.
 * Currently no cross-service dependencies; wiring is a no-op placeholder
 * that ensures the service is lifecycle-managed alongside the container.
 */
export function register(_services: ServiceContainer): void {
  // TrajectoryQueryService reads from disk on demand — no event subscriptions required.
}
