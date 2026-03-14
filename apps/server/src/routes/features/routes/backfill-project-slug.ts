/**
 * POST /api/features/backfill-project-slug
 *
 * One-time migration: scans all features in a project, identifies their project
 * association via epicId chain or milestoneSlug, and sets projectSlug.
 *
 * Idempotent — never overwrites features that already have projectSlug set.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { ProjectService } from '../../../services/project-service.js';

const logger = createLogger('features/backfill-project-slug');

interface BackfillRequest {
  projectPath: string;
}

interface BackfillDetail {
  featureId: string;
  title: string;
  resolvedSlug: string;
  resolvedVia: 'milestoneSlug' | 'epicId' | 'epicMilestoneSlug';
}

/**
 * Build a lookup from milestoneSlug → projectSlug by scanning all projects.
 */
async function buildMilestoneToProjectMap(
  projectPath: string,
  projectService: ProjectService
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const slugs = await projectService.listProjects(projectPath);
  await Promise.all(
    slugs.map(async (projectSlug) => {
      const project = await projectService.getProject(projectPath, projectSlug);
      if (!project) return;
      for (const milestone of project.milestones ?? []) {
        if (milestone.slug) {
          map.set(milestone.slug, projectSlug);
        }
      }
    })
  );

  return map;
}

/**
 * Walk the epicId chain upward to find a projectSlug or milestoneSlug
 * on the ancestor epic.
 */
function resolveViaEpicChain(
  featureId: string,
  featureMap: Map<string, Feature>,
  milestoneToProject: Map<string, string>
): { projectSlug: string; via: 'epicId' | 'epicMilestoneSlug' } | null {
  const visited = new Set<string>();
  let current: Feature | undefined = featureMap.get(featureId);

  while (current?.epicId) {
    const epicId = current.epicId;
    if (visited.has(epicId)) break; // cycle guard
    visited.add(epicId);

    const epic = featureMap.get(epicId);
    if (!epic) break;

    // Epic already has a projectSlug — done
    if (epic.projectSlug) {
      return { projectSlug: epic.projectSlug, via: 'epicId' };
    }

    // Epic has a milestoneSlug — resolve via map
    if (epic.milestoneSlug) {
      const slug = milestoneToProject.get(epic.milestoneSlug);
      if (slug) return { projectSlug: slug, via: 'epicMilestoneSlug' };
    }

    current = epic;
  }

  return null;
}

export function createBackfillProjectSlugHandler(
  featureLoader: FeatureLoader,
  projectService: ProjectService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as BackfillRequest;

      if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Load all features and build a quick-lookup map
      const allFeatures = await featureLoader.getAll(projectPath);
      const featureMap = new Map<string, Feature>(allFeatures.map((f) => [f.id, f]));

      // Build milestoneSlug → projectSlug index from all projects
      const milestoneToProject = await buildMilestoneToProjectMap(projectPath, projectService);

      let alreadyHadSlug = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      const details: BackfillDetail[] = [];

      for (const feature of allFeatures) {
        // Skip features that already have a projectSlug — idempotent
        if (feature.projectSlug) {
          alreadyHadSlug++;
          continue;
        }

        let resolvedSlug: string | null = null;
        let resolvedVia: BackfillDetail['resolvedVia'] | null = null;

        // Strategy 1: direct milestoneSlug → projectSlug lookup
        if (feature.milestoneSlug) {
          const slug = milestoneToProject.get(feature.milestoneSlug);
          if (slug) {
            resolvedSlug = slug;
            resolvedVia = 'milestoneSlug';
          }
        }

        // Strategy 2: epicId chain lookup
        if (!resolvedSlug && feature.epicId) {
          const resolution = resolveViaEpicChain(feature.id, featureMap, milestoneToProject);
          if (resolution) {
            resolvedSlug = resolution.projectSlug;
            resolvedVia = resolution.via;
          }
        }

        if (!resolvedSlug || !resolvedVia) {
          // Cannot resolve — skip
          skipped++;
          continue;
        }

        try {
          await featureLoader.update(projectPath, feature.id, { projectSlug: resolvedSlug });

          // Keep the in-memory map up-to-date so sibling features can benefit
          featureMap.set(feature.id, { ...feature, projectSlug: resolvedSlug });

          updated++;
          details.push({
            featureId: feature.id,
            title: feature.title ?? '',
            resolvedSlug,
            resolvedVia,
          });

          logger.info(
            `Backfilled projectSlug="${resolvedSlug}" for feature ${feature.id} (via ${resolvedVia})`
          );
        } catch (updateError) {
          logger.error(`Failed to update feature ${feature.id}:`, updateError);
          errors++;
        }
      }

      logger.info(
        `Backfill complete: ${updated} updated, ${skipped} skipped, ` +
          `${alreadyHadSlug} already had slug, ${errors} errors`
      );

      res.json({
        success: errors === 0,
        totalFeatures: allFeatures.length,
        alreadyHadSlug,
        updated,
        skipped,
        errors,
        details,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Backfill project slug failed:', error);
      res.status(500).json({ success: false, error: msg });
    }
  };
}
