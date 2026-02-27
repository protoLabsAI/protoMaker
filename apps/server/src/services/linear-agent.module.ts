import { createLogger } from '@protolabs-ai/utils';

import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('Server:Wiring');

/**
 * Wires Linear comment follow-up routing, issue creation pipeline,
 * Linear agent service, and project planning service.
 */
export function register(container: ServiceContainer): void {
  const {
    events,
    settingsService,
    repoRoot,
    autoModeService,
    issueCreationService,
    linearAgentService,
    linearAgentRouter,
    projectPlanningService,
  } = container;

  // Listen for Linear comment follow-up events and route to agent
  events.subscribe((type, payload) => {
    if (type === 'linear:comment:followup') {
      const { featureId, projectPath, commentBody, userName } = payload as {
        featureId: string;
        projectPath: string;
        commentBody: string;
        userName: string;
      };
      logger.info(`Routing Linear comment to agent for feature ${featureId}`, { userName });

      autoModeService
        .followUpFeature(projectPath, featureId, commentBody, undefined, true)
        .catch((error) => {
          logger.error(`Failed to send Linear comment to agent for feature ${featureId}:`, error);
        });
    }
  });

  // Issue Management Pipeline initialization
  issueCreationService.initialize();

  // Linear Agent Service configuration
  linearAgentService.configure(settingsService, repoRoot);
  linearAgentRouter.start();

  // Project Planning Service start
  if (projectPlanningService) {
    projectPlanningService.start();
  }
}
