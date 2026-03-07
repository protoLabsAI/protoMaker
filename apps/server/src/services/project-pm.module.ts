/**
 * Project PM Module — event subscriptions for ProjectPMService.
 *
 * Wires:
 *   project:lifecycle:launched  → auto-create PM session + append welcome message
 *   project:completed           → archive PM session
 *   feature:completed           → append system message to PM session
 */

import { createLogger } from '@protolabsai/utils';
import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('ProjectPMModule');

type ProjectPmModuleDeps = Pick<ServiceContainer, 'events' | 'projectPmService'> &
  Partial<Pick<ServiceContainer, 'projectService'>>;

export async function register(services: ProjectPmModuleDeps): Promise<void> {
  const { events, projectPmService, projectService } = services;

  events.on('project:lifecycle:launched', (payload) => {
    const { projectPath, projectSlug } = payload as {
      projectPath: string;
      projectSlug: string;
      featuresInBacklog?: number;
      autoModeStarted?: boolean;
    };
    if (!projectPath || !projectSlug) return;

    projectPmService.getOrCreateSession(projectPath, projectSlug);
    projectPmService.appendSystemMessage(
      projectPath,
      projectSlug,
      `Project "${projectSlug}" launched. PM session initialized.`
    );
    logger.info(`PM session initialized for project ${projectSlug}`);

    if (projectService) {
      projectService
        .updateProject(projectPath, projectSlug, { status: 'active' })
        .catch((err) => logger.warn(`Failed to set project ${projectSlug} to active:`, err));
    }
  });

  events.on('project:completed', (payload) => {
    const { projectPath, projectSlug } = payload as {
      projectPath?: string;
      projectSlug?: string;
      project?: string;
    };
    const resolvedSlug = projectSlug ?? (payload as { project?: string }).project;
    if (!projectPath || !resolvedSlug) return;

    projectPmService
      .archiveSession(projectPath, resolvedSlug)
      .catch((err) => logger.warn(`Failed to archive PM session for ${resolvedSlug}:`, err));

    if (projectService) {
      projectService
        .updateProject(projectPath, resolvedSlug, {
          status: 'completed',
          completedAt: new Date().toISOString(),
        })
        .catch((err) => logger.warn(`Failed to set project ${resolvedSlug} to completed:`, err));
    }
  });

  events.on('feature:completed', (payload) => {
    const { featureId, featureTitle, projectPath } = payload as {
      featureId: string;
      featureTitle?: string;
      projectPath?: string;
    };
    if (!projectPath) return;

    // Append a system message to all sessions matching this projectPath
    for (const session of projectPmService.listSessions()) {
      if (session.projectPath === projectPath) {
        const title = featureTitle ?? featureId;
        projectPmService.appendSystemMessage(
          projectPath,
          session.projectSlug,
          `Feature completed: "${title}" (${featureId})`
        );
      }
    }
  });
}
