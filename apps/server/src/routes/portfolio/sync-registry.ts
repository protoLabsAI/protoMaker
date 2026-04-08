/**
 * Portfolio Sync-Registry Route — Compare Studio settings.projects[] against
 * the Workstacean project registry and optionally apply the sync.
 *
 * POST /api/portfolio/sync-registry
 *
 * Body: { dryRun?: boolean }  (default: dryRun = true)
 *
 * Returns a diff report:
 *   - missing: registry projects not present in settings (by projectPath)
 *   - orphaned: settings projects with no matching registry entry
 *   - mismatches: projects in both but with differing name/title
 *
 * When dryRun is false, missing projects are added to settings.projects[].
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { createLogger } from '@protolabsai/utils';
import type { SettingsService } from '../../services/settings-service.js';
import type { ProjectRef } from '@protolabsai/types';
import type { ProjectRegistryEntry } from '../../services/project-registry-service.js';

const logger = createLogger('PortfolioSyncRegistryRoute');

const DEFAULT_WORKSTACEAN_URL = 'http://workstacean:8082';

interface WorkstaceanResponse {
  success: boolean;
  data: ProjectRegistryEntry[];
}

interface SyncMissing {
  slug: string;
  title: string;
  projectPath: string;
}

interface SyncOrphaned {
  id: string;
  name: string;
  path: string;
}

interface SyncMismatch {
  slug: string;
  registryTitle: string;
  settingsName: string;
  projectPath: string;
}

interface SyncReport {
  dryRun: boolean;
  missing: SyncMissing[];
  orphaned: SyncOrphaned[];
  mismatches: SyncMismatch[];
  applied?: boolean;
  addedCount?: number;
}

interface SyncRegistryOptions {
  settingsService: SettingsService;
}

export function createPortfolioSyncRegistryRoutes({
  settingsService,
}: SyncRegistryOptions): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const dryRun = req.body.dryRun !== false;

    try {
      // Fetch registry from Workstacean
      const workstaceanUrl = process.env.WORKSTACEAN_URL ?? DEFAULT_WORKSTACEAN_URL;
      let registryEntries: ProjectRegistryEntry[] = [];
      try {
        const wRes = await fetch(`${workstaceanUrl}/api/projects`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (wRes.ok) {
          const body = (await wRes.json()) as WorkstaceanResponse;
          if (body.success) registryEntries = body.data;
        }
      } catch (err) {
        logger.warn(
          'Workstacean unreachable during sync:',
          err instanceof Error ? err.message : String(err)
        );
      }

      // Get current settings projects
      const settings = await settingsService.getGlobalSettings();
      const settingsProjects: ProjectRef[] = settings.projects ?? [];

      // Build lookup maps
      const settingsByPath = new Map<string, ProjectRef>();
      for (const sp of settingsProjects) {
        if (sp.path) settingsByPath.set(sp.path, sp);
      }

      const registryByPath = new Map<string, ProjectRegistryEntry>();
      for (const rp of registryEntries) {
        if (rp.projectPath) registryByPath.set(rp.projectPath, rp);
      }

      // Missing from settings (in registry but not in settings)
      const missing: SyncMissing[] = [];
      for (const rp of registryEntries) {
        if (!rp.projectPath) continue;
        if (!settingsByPath.has(rp.projectPath)) {
          missing.push({
            slug: rp.slug,
            title: rp.title ?? rp.slug,
            projectPath: rp.projectPath,
          });
        }
      }

      // Orphaned in settings (in settings but not in registry)
      const orphaned: SyncOrphaned[] = [];
      for (const sp of settingsProjects) {
        if (!sp.path) continue;
        if (!registryByPath.has(sp.path)) {
          orphaned.push({ id: sp.id, name: sp.name, path: sp.path });
        }
      }

      // Metadata mismatches (in both but with differing name/title)
      const mismatches: SyncMismatch[] = [];
      for (const rp of registryEntries) {
        if (!rp.projectPath) continue;
        const sp = settingsByPath.get(rp.projectPath);
        if (!sp) continue;
        const registryTitle = rp.title ?? rp.slug;
        if (registryTitle && sp.name && registryTitle !== sp.name) {
          mismatches.push({
            slug: rp.slug,
            registryTitle,
            settingsName: sp.name,
            projectPath: rp.projectPath,
          });
        }
      }

      const report: SyncReport = { dryRun, missing, orphaned, mismatches };

      if (!dryRun && missing.length > 0) {
        const newRefs: ProjectRef[] = missing.map((m) => ({
          id: randomUUID(),
          name: m.title,
          path: m.projectPath,
        }));

        const updatedProjects = [...settingsProjects, ...newRefs];
        await settingsService.updateGlobalSettings({ projects: updatedProjects });

        report.applied = true;
        report.addedCount = newRefs.length;
        logger.info(`Sync applied: added ${newRefs.length} projects to settings`);
      }

      res.json(report);
    } catch (err) {
      logger.error('Sync registry failed:', err);
      res.status(500).json({ error: 'Failed to sync registry' });
    }
  });

  return router;
}
