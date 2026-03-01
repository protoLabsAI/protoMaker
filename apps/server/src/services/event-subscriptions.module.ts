import { createLogger } from '@protolabs-ai/utils';
import type { Feature } from '@protolabs-ai/types';

import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('Server:Wiring');

/**
 * Wires event-driven subscriptions: retro/bug Linear issue sync.
 *
 * Note: linear:comment:followup subscription lives in linear-agent.module.ts.
 */
export function register(container: ServiceContainer): void {
  const { events, settingsService, featureLoader, autoModeService } = container;

  // Listen for retro improvements and create Linear issues when configured
  events.subscribe(async (type, payload) => {
    if (type !== 'retro:improvement:linear-sync') return;
    try {
      const p = payload as {
        projectPath: string;
        projectTitle: string;
        title: string;
        description: string;
        priority: number;
      };

      const { getWorkflowSettings } = await import('../lib/settings-helpers.js');
      const workflowSettings = await getWorkflowSettings(p.projectPath, settingsService, '[Retro]');
      if (!workflowSettings.retro.enabled) return;

      const { LinearMCPClient } = await import('./linear-mcp-client.js');
      const linearClient = new LinearMCPClient(settingsService, p.projectPath);
      let teamId: string;
      try {
        teamId = await linearClient.getTeamId();
      } catch {
        logger.warn('[Retro] No Linear teamId configured, skipping issue creation');
        return;
      }
      const result = await linearClient.createIssue({
        title: p.title,
        description: p.description,
        teamId,
        projectId: workflowSettings.retro.improvementLinearProjectId,
        priority: p.priority ?? 3,
      });

      logger.info(`[Retro] Created Linear issue ${result.identifier}: ${p.title}`);
    } catch (error) {
      logger.warn('[Retro] Failed to create Linear issue for improvement:', error);
    }
  });

  // Listen for bug:linear-sync events and create Linear issues in the Bugs project
  events.subscribe(async (type, payload) => {
    if (type !== 'bug:linear-sync') return;
    try {
      const p = payload as {
        projectPath: string;
        title: string;
        description: string;
        priority: number;
        failureCategory: string;
        featureId: string;
      };

      const { getWorkflowSettings } = await import('../lib/settings-helpers.js');
      const workflowSettings = await getWorkflowSettings(p.projectPath, settingsService, '[Bugs]');
      if (!workflowSettings.bugs.enabled || !workflowSettings.bugs.linearProjectId) return;

      const { LinearMCPClient } = await import('./linear-mcp-client.js');
      const linearClient = new LinearMCPClient(settingsService, p.projectPath);
      let teamId: string;
      try {
        teamId = await linearClient.getTeamId();
      } catch {
        logger.warn('[Bugs] No Linear teamId configured, skipping bug issue creation');
        return;
      }
      const result = await linearClient.createIssue({
        title: p.title,
        description: p.description,
        teamId,
        projectId: workflowSettings.bugs.linearProjectId,
        priority: p.priority ?? 3,
      });

      logger.info(`[Bugs] Created Linear issue ${result.identifier}: ${p.title}`);
    } catch (error) {
      logger.warn('[Bugs] Failed to create Linear issue for bug:', error);
    }
  });

  // feature:stopped → reset stale in_progress features to backlog immediately
  events.subscribe((type, payload) => {
    if (type !== 'feature:stopped') return;
    const p = payload as { featureId?: string; projectPath?: string };
    if (!p.featureId || !p.projectPath) return;

    void (async () => {
      try {
        const feature = await featureLoader.get(p.projectPath!, p.featureId!);
        const staleStatuses = new Set(['running', 'in_progress', 'in-progress']);
        if (!feature || !staleStatuses.has(feature.status ?? '')) return;

        const runningAgents = await autoModeService.getRunningAgents();
        const isActuallyRunning = runningAgents.some(
          (a) => a.featureId === p.featureId && a.projectPath === p.projectPath
        );
        if (isActuallyRunning) return;

        await featureLoader.update(p.projectPath!, p.featureId!, {
          status: 'backlog',
          statusChangeReason: 'Agent stopped — auto-recovering to backlog',
        });
        logger.info(
          `[BoardReconcile] Reset stale in_progress feature ${p.featureId} to backlog after agent stop`
        );
      } catch (err) {
        logger.warn('[BoardReconcile] Failed to reset stale feature on agent stop:', err);
      }
    })();
  });

  // feature:deleted → clean dangling epicId and dependency refs immediately
  events.subscribe((type, payload) => {
    if (type !== 'feature:deleted') return;
    const p = payload as { featureId?: string; projectPath?: string };
    if (!p.featureId || !p.projectPath) return;

    void (async () => {
      try {
        const allFeatures = await featureLoader.getAll(p.projectPath!);
        for (const feature of allFeatures) {
          const updates: Partial<Feature> = {};
          if (feature.epicId === p.featureId) updates.epicId = undefined;
          if (feature.dependencies?.includes(p.featureId!)) {
            updates.dependencies = feature.dependencies.filter((d) => d !== p.featureId);
          }
          if (Object.keys(updates).length > 0) {
            await featureLoader.update(p.projectPath!, feature.id, updates);
            logger.info(
              `[BoardReconcile] Removed dangling ref to deleted feature ${p.featureId} from ${feature.id}`
            );
          }
        }
      } catch (err) {
        logger.warn('[BoardReconcile] Failed to clean dangling refs after feature delete:', err);
      }
    })();
  });
}
