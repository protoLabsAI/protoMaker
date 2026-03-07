/**
 * Lead Engineer — Session Store
 *
 * Handles session persistence (save/restore/remove),
 * project completion detection, and orphaned checkpoint reconciliation.
 */

import path from 'node:path';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@protolabsai/utils';
import { getAutomakerDir } from '@protolabsai/platform';
import type { LeadEngineerSession } from '@protolabsai/types';
import type { FeatureStore } from '@protolabsai/types';
import type { SettingsService } from './settings-service.js';
import type { PipelineCheckpointService } from './pipeline-checkpoint-service.js';
import type { PersistedSessionData } from './lead-engineer-types.js';

const logger = createLogger('LeadEngineerService');

export interface SessionStoreDeps {
  featureLoader: FeatureStore;
  settingsService: SettingsService;
}

export class LeadEngineerSessionStore {
  constructor(private deps: SessionStoreDeps) {}

  getSessionFilePath(projectPath: string): string {
    return path.join(getAutomakerDir(projectPath), 'lead-engineer-sessions.json');
  }

  async save(session: LeadEngineerSession): Promise<void> {
    try {
      const data: PersistedSessionData = {
        projectPath: session.projectPath,
        projectSlug: session.projectSlug,
        maxConcurrency: session.worldState.maxConcurrency,
        startedAt: session.startedAt,
      };
      await atomicWriteJson(this.getSessionFilePath(session.projectPath), data);
    } catch (err) {
      logger.error(`Failed to save session for ${session.projectSlug}:`, err);
    }
  }

  async remove(projectPath: string): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      await fs.unlink(this.getSessionFilePath(projectPath));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`Failed to remove session for ${projectPath}:`, err);
      }
    }
  }

  async restore(
    startSession: (
      projectPath: string,
      projectSlug: string,
      maxConcurrency: number
    ) => Promise<void>
  ): Promise<void> {
    try {
      const allProjects = await this.findProjectsWithSessions();
      for (const projectPath of allProjects) {
        try {
          const result = await readJsonWithRecovery<PersistedSessionData | null>(
            this.getSessionFilePath(projectPath),
            null
          );
          if (!result.data) continue;

          const data = result.data;
          const isCompleted = await this.isProjectCompleted(data.projectPath);
          if (isCompleted) {
            await this.remove(data.projectPath);
            continue;
          }

          logger.info(`Restoring Lead Engineer session for ${data.projectSlug}`);
          await startSession(data.projectPath, data.projectSlug, data.maxConcurrency);
        } catch (err) {
          logger.error(`Failed to restore session for ${projectPath}:`, err);
        }
      }
    } catch (err) {
      logger.error('Failed to restore sessions:', err);
    }
  }

  async findProjectsWithSessions(): Promise<string[]> {
    const projects: string[] = [];
    const fs = await import('node:fs/promises');

    try {
      const globalSettings = await this.deps.settingsService.getGlobalSettings();
      const projectPaths = new Set<string>();

      for (const project of globalSettings.projects ?? []) {
        if (project.path) projectPaths.add(project.path);
      }
      if (projectPaths.size === 0) projectPaths.add(process.cwd());

      for (const projectPath of projectPaths) {
        try {
          await fs.access(projectPath);
          await fs.access(this.getSessionFilePath(projectPath));
          projects.push(projectPath);
        } catch {
          // No session file for this project
        }
      }
    } catch {
      try {
        await fs.access(this.getSessionFilePath(process.cwd()));
        projects.push(process.cwd());
      } catch {
        // Nothing
      }
    }

    return projects;
  }

  async isProjectCompleted(projectPath: string): Promise<boolean> {
    try {
      const features = await this.deps.featureLoader.getAll(projectPath);
      return (
        features.length > 0 && features.every((f) => f.status === 'done' || f.status === 'verified')
      );
    } catch {
      return false;
    }
  }

  async reconcileCheckpoints(
    projectPath: string,
    checkpointService: PipelineCheckpointService
  ): Promise<{ deleted: string[] }> {
    const deleted: string[] = [];

    try {
      const checkpoints = await checkpointService.listAll(projectPath);
      if (checkpoints.length === 0) return { deleted };

      const features = await this.deps.featureLoader.getAll(projectPath);
      const featureMap = new Map(features.map((f) => [f.id, f]));

      for (const checkpoint of checkpoints) {
        const feature = featureMap.get(checkpoint.featureId);
        const isOrphaned = !feature || feature.status === 'backlog';

        if (isOrphaned) {
          try {
            await checkpointService.delete(projectPath, checkpoint.featureId);
            deleted.push(checkpoint.featureId);
            logger.info(`[RECONCILE-CP] Deleted orphaned checkpoint for ${checkpoint.featureId}`);
          } catch (err) {
            logger.warn(`[RECONCILE-CP] Failed to delete checkpoint:`, err);
          }
        }
      }
    } catch (err) {
      logger.error(`[RECONCILE-CP] Failed to reconcile checkpoints:`, err);
    }

    return { deleted };
  }
}
