import { codeRabbitResolverService } from './coderabbit-resolver-service.js';

import type { ServiceContainer } from '../server/services.js';

/**
 * Wires Lead Engineer service and EM agent lifecycle control.
 */
export function register(container: ServiceContainer): void {
  const {
    leadEngineerService,
    emAgent,
    discordBotService,
    factStoreService,
    trajectoryStoreService,
    leadHandoffService,
    antagonisticReviewService,
    deviationRuleService,
  } = container;

  // Lead Engineer cross-service wiring
  leadEngineerService.setCodeRabbitResolver(codeRabbitResolverService);
  leadEngineerService.setDiscordBot(discordBotService);
  leadEngineerService.setFactStoreService(factStoreService);
  leadEngineerService.setTrajectoryStoreService(trajectoryStoreService);
  leadEngineerService.setHandoffService(leadHandoffService);
  leadEngineerService.setAntagonisticReviewService(antagonisticReviewService);
  leadEngineerService.setDeviationRuleService(deviationRuleService);

  // EM Agent: yield lifecycle control to Lead Engineer when active
  emAgent.setLeadEngineerService(leadEngineerService);
}
