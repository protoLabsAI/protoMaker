/**
 * Registry routes — fleet-wide project registry via Workstacean
 *
 * GET  /api/registry/projects — return the authoritative project registry
 * POST /api/registry/sync     — reconcile settings.projects[] with registry
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { createLogger } from '@protolabsai/utils';
import {
  ProjectRegistryService,
  type ProjectRegistryEntry,
} from '../../services/project-registry-service.js';
import { SettingsService } from '../../services/settings-service.js';
import type { ProjectRef } from '../../types/settings.js';

const logger = createLogger('Registry:Routes');

export function createRegistryRoutes(settingsService: SettingsService): Router {
  const router = Router();

  /**
   * GET /api/registry/projects
   *
   * Returns the project registry from Workstacean (with local fallback).
   * Query params:
   *   projectPath (required) — used to locate the local snapshot for fallback
   */
  router.get('/projects', async (req: Request, res: Response) => {
    const { projectPath } = req.query as Record<string, string>;
    if (!projectPath) {
      res.status(400).json({ success: false, error: 'projectPath query param is required' });
      return;
    }

    try {
      const svc = new ProjectRegistryService({ projectRoot: projectPath });
      await svc.start();
      const projects = svc.getProjects();
      svc.stop();
      res.json({
        success: true,
        source: 'workstacean',
        count: projects.length,
        projects,
      });
    } catch (err) {
      logger.error('Failed to fetch registry projects', err);
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /api/registry/sync
   *
   * Reconcile settings.projects[] with the Workstacean registry.
   *
   * Body:
   *   projectPath (required) — used to locate the local snapshot for fallback
   *   dryRun (optional, default true) — when false, applies changes to settings
   *
   * Returns:
   *   added     — registry projects added to settings.projects[]
   *   orphaned  — settings.projects[] entries not found in registry
   *   unchanged — projects already in sync
   *   source    — where the registry data came from
   */
  router.post('/sync', async (req: Request, res: Response) => {
    const { projectPath, dryRun = true } = req.body as {
      projectPath?: string;
      dryRun?: boolean;
    };

    if (!projectPath) {
      res.status(400).json({ success: false, error: 'projectPath is required' });
      return;
    }

    try {
      const svc = new ProjectRegistryService({ projectRoot: projectPath });
      await svc.start();
      const registryProjects = svc.getProjects();
      const source = 'workstacean';
      svc.stop();

      const settings = await settingsService.getGlobalSettings();
      const currentRefs: ProjectRef[] = settings.projects ?? [];

      // Build lookup maps
      const refsByPath = new Map<string, ProjectRef>(currentRefs.map((r) => [r.path, r]));
      const registryByPath = new Map<string, ProjectRegistryEntry>(
        registryProjects
          .filter((p): p is ProjectRegistryEntry & { projectPath: string } => !!p.projectPath)
          .map((p) => [p.projectPath, p])
      );

      // Find registry projects missing from settings
      const added: Array<{ slug: string; title: string; path: string }> = [];
      const refsToAdd: ProjectRef[] = [];

      for (const project of registryProjects) {
        if (!project.projectPath) continue;
        if (refsByPath.has(project.projectPath)) continue;

        const newRef: ProjectRef = {
          id: randomUUID(),
          name: project.title ?? project.slug,
          path: project.projectPath as string,
        };
        added.push({
          slug: project.slug,
          title: project.title ?? project.slug,
          path: project.projectPath as string,
        });
        refsToAdd.push(newRef);
      }

      // Find settings entries not in registry (orphaned)
      const orphaned: Array<{ id: string; name: string; path: string }> = [];
      for (const ref of currentRefs) {
        if (!registryByPath.has(ref.path)) {
          orphaned.push({ id: ref.id, name: ref.name, path: ref.path });
        }
      }

      const unchanged = currentRefs.length - orphaned.length;

      // Apply changes unless dry run
      if (!dryRun && refsToAdd.length > 0) {
        const updatedProjects = [...currentRefs, ...refsToAdd];
        await settingsService.updateGlobalSettings({ projects: updatedProjects });
        logger.info(`sync_registry: added ${refsToAdd.length} project(s) to settings.projects[]`);
      }

      res.json({
        success: true,
        dryRun,
        source,
        summary: {
          added: added.length,
          orphaned: orphaned.length,
          unchanged,
        },
        added,
        orphaned,
      });
    } catch (err) {
      logger.error('Failed to sync registry', err);
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
