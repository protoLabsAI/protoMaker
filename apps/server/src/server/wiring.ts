// Cross-service wiring: thin orchestrator — all wiring logic lives in co-located *.module.ts files.
// New services only need to create/edit their own *.module.ts — never touch this file.

import type { ServiceContainer } from './services.js';

import { register as registerCore } from '../services/core.module.js';
import { register as registerEscalationChannels } from '../services/escalation-channels/escalation-channels.module.js';
import { register as registerEventSubscriptions } from '../services/event-subscriptions.module.js';
import { register as registerChannelHandlers } from '../services/channel-handlers/channel-handlers.module.js';
import { register as registerLeadEngineer } from '../services/lead-engineer.module.js';
import { register as registerWorktreeLifecycle } from '../services/worktree-lifecycle.module.js';
import { register as registerDiscord } from '../services/discord.module.js';
import { register as registerScheduler } from '../services/scheduler.module.js';
import { register as registerInfrastructure } from '../services/infrastructure.module.js';

/**
 * Wire all cross-service dependencies by invoking each module's register() in order.
 * Ordering matters — some modules depend on others having run first (e.g. Discord before DiscordDM).
 */
export async function wireServices(services: ServiceContainer): Promise<void> {
  await registerCore(services);
  await registerEscalationChannels(services);
  await registerEventSubscriptions(services);
  await registerChannelHandlers(services);
  await registerLeadEngineer(services);
  await registerWorktreeLifecycle(services);
  await registerDiscord(services);
  await registerScheduler(services);
  await registerInfrastructure(services);

  // Start built-in sensors (websocket-clients + electron-idle) after all wiring is complete.
  // This ensures the sensor registry is fully initialised before polling begins.
  services.sensorRegistryService.startBuiltinSensors();
}
