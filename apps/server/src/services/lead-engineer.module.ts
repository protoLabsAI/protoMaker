import { codeRabbitResolverService } from './coderabbit-resolver-service.js';

import type { ServiceContainer } from '../server/services.js';

/**
 * Wires Lead Engineer service, EM agent lifecycle control, and PR feedback service.
 */
export function register(container: ServiceContainer): void {
  const {
    leadEngineerService,
    emAgent,
    prFeedbackService,
    autoModeService,
    discordBotService,
    agentFactoryService,
    factStoreService,
    leadHandoffService,
    antagonisticReviewService,
  } = container;

  // Lead Engineer cross-service wiring
  leadEngineerService.setCodeRabbitResolver(codeRabbitResolverService);
  leadEngineerService.setPRFeedbackService(prFeedbackService);
  leadEngineerService.setDiscordBot(discordBotService);
  leadEngineerService.setAgentFactory(agentFactoryService);
  leadEngineerService.setFactStoreService(factStoreService);
  leadEngineerService.setHandoffService(leadHandoffService);
  leadEngineerService.setAntagonisticReviewService(antagonisticReviewService);

  // EM Agent: yield lifecycle control to Lead Engineer when active
  emAgent.setLeadEngineerService(leadEngineerService);

  // PR Feedback service wiring
  prFeedbackService.setAutoModeService(autoModeService);
  prFeedbackService.initialize();
  prFeedbackService.setLeadEngineerService(leadEngineerService);
}
