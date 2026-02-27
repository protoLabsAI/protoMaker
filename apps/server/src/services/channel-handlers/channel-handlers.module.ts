import type { ServiceContainer } from '../../server/services.js';

/**
 * Wires the channel router into pipeline orchestrator and HITL form service.
 *
 * Must be called before any pipeline or HITL form service wiring that depends
 * on the channel router being set.
 */
export function register(container: ServiceContainer): void {
  const { pipelineOrchestrator, hitlFormService, channelRouter } = container;

  pipelineOrchestrator.setChannelRouter(channelRouter);
  hitlFormService.setChannelRouter(channelRouter);
}
