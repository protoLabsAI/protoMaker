import type { ServiceContainer } from './services.js';

/**
 * Interface for a self-registering service module.
 *
 * Each module co-locates its wiring logic with the service it owns.
 * `wiring.ts` is a thin orchestrator that calls `register()` on each module in order.
 *
 * New services only need to create/edit their own `*.module.ts` — never touch `wiring.ts`.
 */
export interface ServiceModule {
  register(container: ServiceContainer): void | Promise<void>;
}
