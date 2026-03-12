// CRDT sync module — wires EventBus to CrdtSyncService for cross-instance event propagation.
// Features are LOCAL only — only project events cross the wire.

import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { Project } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('CrdtSyncModule');

export async function register(container: ServiceContainer): Promise<void> {
  // Bridge the local EventBus to the CRDT sync channel.
  container.crdtSyncService.attachEventBus(container.events);

  // Register capacity provider so each heartbeat includes fresh instance metrics.
  container.crdtSyncService.setCapacityProvider(() =>
    container.autoModeService.getCapacityMetrics()
  );

  // Persist remote project events locally so project state stays in sync across instances.
  // Feature events are NOT synced — features are local to each instance.
  container.crdtSyncService.onRemoteFeatureEvent((eventType, payload) => {
    if (!payload.projectPath) return;
    const projectPath = container.repoRoot;

    switch (eventType) {
      case 'project:created':
      case 'project:updated': {
        const project = payload.project as Project | undefined;
        const slug = (payload.projectSlug as string) || project?.slug;
        if (!slug || !project) {
          logger.warn(`[CRDT] Received ${eventType} without project data, skipping`);
          break;
        }
        logger.info(`[CRDT] Persisting remote ${eventType} ${slug}`);
        container.projectService.persistRemoteProject(projectPath, project).catch((err) => {
          logger.error(`[CRDT] Failed to persist remote ${eventType} ${slug}: ${err}`);
        });
        break;
      }
      case 'project:deleted': {
        const projectSlug = payload.projectSlug as string | undefined;
        if (!projectSlug) {
          logger.warn('[CRDT] Received project:deleted without projectSlug, skipping');
          break;
        }
        logger.info(`[CRDT] Persisting remote project:deleted ${projectSlug}`);
        container.projectService.persistRemoteDelete(projectPath, projectSlug).catch((err) => {
          logger.error(`[CRDT] Failed to persist remote project:deleted ${projectSlug}: ${err}`);
        });
        break;
      }
      case 'categories:updated': {
        const categories = payload.categories;
        if (!Array.isArray(categories)) {
          logger.warn(
            '[CRDT] Received categories:updated without valid categories array, skipping'
          );
          break;
        }
        logger.info('[CRDT] Overwriting local categories from remote categories:updated');
        const categoriesPath = join(projectPath, '.automaker', 'categories.json');
        writeFile(categoriesPath, JSON.stringify(categories, null, 2), 'utf-8').catch((err) => {
          logger.error(`[CRDT] Failed to write remote categories: ${err}`);
        });
        break;
      }
    }
  });
}
