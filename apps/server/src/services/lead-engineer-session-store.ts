/**
 * Lead Engineer — Session Store
 *
 * Handles session persistence (save/restore/remove),
 * project completion detection, and orphaned checkpoint reconciliation.
 */

import path from 'node:path';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@protolabsai/utils';
import type { LeadEngineerSession } from '@protolabsai/types';
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import type { PipelineCheckpointService } from './pipeline-checkpoint-service.js';
import type { PersistedSessionData } from './lead-engineer-types.js';

const logger = createLogger('LeadEngineerService');

export interface SessionStoreDeps {
  featureLoader: FeatureLoader;
  settingsService: SettingsService;
  dataDir: string;
}

export class LeadEngineerSessionStore {
  constructor(private deps: SessionStoreDeps) {}

  getSessionFilePath(_projectPath?: string): string {
    return path.join(this.deps.dataDir, 'lead-engineer-sessions.json');
  }

  async save(session: LeadEngineerSession): Promise<void> {
    try {
      const filePath = this.getSessionFilePath();
      const result = await readJsonWithRecovery<{
        sessions: Record<string, PersistedSessionData>;
        savedAt: string;
      } | null>(filePath, null);
      const doc = result.data ?? { sessions: {}, savedAt: '' };
      doc.sessions ??= {};
      const data: PersistedSessionData = {
        projectPath: session.projectPath,
        projectSlug: session.projectSlug,
        maxConcurrency: session.worldState.maxConcurrency,
        startedAt: session.startedAt,
      };
      doc.sessions[session.projectPath] = data;
      doc.savedAt = new Date().toISOString();
      await atomicWriteJson(filePath, doc);
    } catch (err) {
      logger.error(`Failed to save session for ${session.projectSlug}:`, err);
    }
  }

  async remove(projectPath: string): Promise<void> {
    try {
      const filePath = this.getSessionFilePath();
      const result = await readJsonWithRecovery<{
        sessions: Record<string, PersistedSessionData>;
        savedAt: string;
      } | null>(filePath, null);
      if (!result.data?.sessions) return;
      delete result.data.sessions[projectPath];
      result.data.savedAt = new Date().toISOString();
      await atomicWriteJson(filePath, result.data);
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
      const filePath = this.getSessionFilePath();
      const result = await readJsonWithRecovery<{
        sessions: Record<string, PersistedSessionData>;
        savedAt: string;
      } | null>(filePath, null);
      if (!result.data?.sessions) return;

      for (const [projectPath, data] of Object.entries(result.data.sessions)) {
        try {
          const isCompleted = await this.isProjectCompleted(projectPath);
          if (isCompleted) {
            await this.remove(projectPath);
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
    try {
      const filePath = this.getSessionFilePath();
      const result = await readJsonWithRecovery<{
        sessions: Record<string, PersistedSessionData>;
        savedAt: string;
      } | null>(filePath, null);
      if (!result.data?.sessions) return [];
      return Object.keys(result.data.sessions);
    } catch {
      return [];
    }
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
