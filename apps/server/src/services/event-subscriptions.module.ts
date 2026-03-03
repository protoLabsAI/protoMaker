import { createLogger } from '@protolabs-ai/utils';
import type { Feature } from '@protolabs-ai/types';

import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('Server:Wiring');

/**
 * Wires event-driven subscriptions for board reconciliation and escalation recovery.
 */
export function register(container: ServiceContainer): void {
  const { events, featureLoader, autoModeService, escalationRouter } = container;

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

  // escalation:acknowledged → unblock associated feature when human acknowledges
  events.subscribe((type, payload) => {
    if (type !== 'escalation:acknowledged') return;
    const p = payload as { deduplicationKey?: string; acknowledgedBy?: string };
    if (!p.deduplicationKey) return;

    void (async () => {
      try {
        // Find the original signal in the escalation log to get featureId
        const logEntry = escalationRouter
          .getLog()
          .find((e) => e.signal.deduplicationKey === p.deduplicationKey);
        if (!logEntry) return;

        const featureId = logEntry.signal.context.featureId as string | undefined;
        const projectPath = logEntry.signal.context.projectPath as string | undefined;
        if (!featureId || !projectPath) return;

        const feature = await featureLoader.get(projectPath, featureId);
        if (!feature || feature.status !== 'blocked') return;

        await featureLoader.update(projectPath, featureId, {
          status: 'backlog',
          statusChangeReason: `Acknowledged by ${p.acknowledgedBy ?? 'unknown'}`,
        });
        logger.info(
          `[EscalationRecovery] Unblocked feature ${featureId} after acknowledgment by ${p.acknowledgedBy}`
        );
      } catch (err) {
        logger.warn('[EscalationRecovery] Failed to unblock feature after acknowledgment:', err);
      }
    })();
  });
}
