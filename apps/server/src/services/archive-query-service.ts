/**
 * ArchiveQueryService - Query interface for the feature archive.
 *
 * Archives are stored at {projectPath}/.automaker/archive/{featureId}/
 * Each archive directory contains:
 *   - feature.json       — the feature data at time of archival
 *   - agent-output.md    — agent output (optional)
 *   - archive-meta.json  — metadata: archivedAt, projectPath, projectSlug
 *
 * The ArchivalService writes to this directory before deleting from active features.
 * This service provides read, search, and retention cleanup operations.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';

const logger = createLogger('ArchiveQueryService');

const DEFAULT_RETENTION_DAYS = 90;

// ─────────────────────────────────────────────────────────────────────────────
// Path helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getArchiveDir(projectPath: string): string {
  return path.join(projectPath, '.automaker', 'archive');
}

export function getFeatureArchiveDir(projectPath: string, featureId: string): string {
  return path.join(getArchiveDir(projectPath), featureId);
}

export function getArchiveMetaPath(projectPath: string, featureId: string): string {
  return path.join(getFeatureArchiveDir(projectPath, featureId), 'archive-meta.json');
}

export function getArchivedFeatureJsonPath(projectPath: string, featureId: string): string {
  return path.join(getFeatureArchiveDir(projectPath, featureId), 'feature.json');
}

export function getArchivedAgentOutputPath(projectPath: string, featureId: string): string {
  return path.join(getFeatureArchiveDir(projectPath, featureId), 'agent-output.md');
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ArchiveMeta {
  archivedAt: string; // ISO timestamp
  projectPath: string;
  projectSlug?: string;
}

export interface ArchivedFeatureSummary {
  featureId: string;
  title: string;
  status: string;
  archivedAt: string;
  projectPath: string;
  projectSlug?: string;
  epicId?: string;
  isEpic?: boolean;
}

export interface ArchivedFeatureDetail {
  featureId: string;
  feature: Feature;
  agentOutput: string | null;
  meta: ArchiveMeta;
}

export interface ListArchivesOptions {
  projectPath: string;
  dateFrom?: string; // ISO date string (inclusive)
  dateTo?: string; // ISO date string (inclusive)
  projectSlug?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class ArchiveQueryService {
  /**
   * List all archived features for a project, with optional date range and projectSlug filters.
   */
  async listArchivedFeatures(options: ListArchivesOptions): Promise<ArchivedFeatureSummary[]> {
    const { projectPath, dateFrom, dateTo, projectSlug } = options;
    const archiveDir = getArchiveDir(projectPath);

    let entries: string[];
    try {
      entries = await fs.readdir(archiveDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }

    const results: ArchivedFeatureSummary[] = [];

    for (const entry of entries) {
      try {
        const featureDir = path.join(archiveDir, entry);
        const stat = await fs.stat(featureDir);
        if (!stat.isDirectory()) continue;

        // Load meta
        const metaPath = path.join(featureDir, 'archive-meta.json');
        let meta: ArchiveMeta;
        try {
          const raw = await fs.readFile(metaPath, 'utf-8');
          meta = JSON.parse(raw) as ArchiveMeta;
        } catch {
          // Fall back to directory mtime if meta file is missing
          meta = {
            archivedAt: stat.mtime.toISOString(),
            projectPath,
          };
        }

        // Apply projectSlug filter
        if (projectSlug && meta.projectSlug !== projectSlug) continue;

        // Apply date range filter
        if (dateFrom && meta.archivedAt < dateFrom) continue;
        if (dateTo) {
          // Include the entire dateTo day by comparing to end-of-day
          const endOfDay = dateTo.length === 10 ? `${dateTo}T23:59:59.999Z` : dateTo;
          if (meta.archivedAt > endOfDay) continue;
        }

        // Load feature.json for metadata
        const featureJsonPath = path.join(featureDir, 'feature.json');
        let feature: Feature;
        try {
          const raw = await fs.readFile(featureJsonPath, 'utf-8');
          feature = JSON.parse(raw) as Feature;
        } catch {
          // If feature.json is missing, use minimal metadata from entry name
          results.push({
            featureId: entry,
            title: entry,
            status: 'done',
            archivedAt: meta.archivedAt,
            projectPath,
            projectSlug: meta.projectSlug,
          });
          continue;
        }

        results.push({
          featureId: entry,
          title: feature.title ?? entry,
          status: feature.status ?? 'done',
          archivedAt: meta.archivedAt,
          projectPath,
          projectSlug:
            meta.projectSlug ??
            ((feature as unknown as Record<string, unknown>).projectSlug as string | undefined),
          epicId: feature.epicId,
          isEpic: feature.isEpic,
        });
      } catch (err) {
        logger.warn(`Failed to read archive entry ${entry}:`, err);
      }
    }

    // Sort by archivedAt descending (most recent first)
    results.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));

    return results;
  }

  /**
   * Load the full archived feature.json for a specific feature.
   */
  async getArchivedFeatureJson(projectPath: string, featureId: string): Promise<Feature | null> {
    const featureJsonPath = getArchivedFeatureJsonPath(projectPath, featureId);
    try {
      const raw = await fs.readFile(featureJsonPath, 'utf-8');
      return JSON.parse(raw) as Feature;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * Load the archived agent-output.md for a specific feature.
   */
  async getArchivedAgentOutput(projectPath: string, featureId: string): Promise<string | null> {
    const agentOutputPath = getArchivedAgentOutputPath(projectPath, featureId);
    try {
      return await fs.readFile(agentOutputPath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * Load full archive detail for a feature: feature.json + agent-output.md + meta.
   */
  async getArchivedFeatureDetail(
    projectPath: string,
    featureId: string
  ): Promise<ArchivedFeatureDetail | null> {
    const feature = await this.getArchivedFeatureJson(projectPath, featureId);
    if (!feature) return null;

    const agentOutput = await this.getArchivedAgentOutput(projectPath, featureId);

    const metaPath = getArchiveMetaPath(projectPath, featureId);
    let meta: ArchiveMeta;
    try {
      const raw = await fs.readFile(metaPath, 'utf-8');
      meta = JSON.parse(raw) as ArchiveMeta;
    } catch {
      const featureDir = getFeatureArchiveDir(projectPath, featureId);
      let mtime = new Date().toISOString();
      try {
        const stat = await fs.stat(featureDir);
        mtime = stat.mtime.toISOString();
      } catch {
        // ignore
      }
      meta = { archivedAt: mtime, projectPath };
    }

    return { featureId, feature, agentOutput, meta };
  }

  /**
   * Run retention cleanup: delete archives older than retentionDays across the given projects.
   * Returns the number of archives deleted.
   */
  async runRetentionCleanup(
    projectPaths: string[],
    retentionDays: number = DEFAULT_RETENTION_DAYS
  ): Promise<number> {
    const cutoffMs = retentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let totalDeleted = 0;

    for (const projectPath of projectPaths) {
      const archiveDir = getArchiveDir(projectPath);

      let entries: string[];
      try {
        entries = await fs.readdir(archiveDir);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
        logger.warn(`Failed to read archive dir for ${projectPath}:`, err);
        continue;
      }

      for (const entry of entries) {
        try {
          const featureDir = path.join(archiveDir, entry);
          const stat = await fs.stat(featureDir);
          if (!stat.isDirectory()) continue;

          // Determine archive age from meta or directory mtime
          let archivedAt: Date;
          const metaPath = path.join(featureDir, 'archive-meta.json');
          try {
            const raw = await fs.readFile(metaPath, 'utf-8');
            const meta = JSON.parse(raw) as ArchiveMeta;
            archivedAt = new Date(meta.archivedAt);
          } catch {
            archivedAt = stat.mtime;
          }

          const ageMs = now - archivedAt.getTime();
          if (ageMs > cutoffMs) {
            await fs.rm(featureDir, { recursive: true, force: true });
            totalDeleted++;
            logger.debug(
              `Deleted archive ${entry} from ${projectPath} (age: ${Math.round(ageMs / 86400000)}d)`
            );
          }
        } catch (err) {
          logger.warn(`Failed to check/delete archive ${entry} in ${projectPath}:`, err);
        }
      }
    }

    if (totalDeleted > 0) {
      logger.info(`Archive retention cleanup: deleted ${totalDeleted} archive(s)`);
    }

    return totalDeleted;
  }
}
