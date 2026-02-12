/**
 * Ceremony Routes
 *
 * POST /api/ceremonies/trigger — manually trigger a ceremony for a project/milestone.
 * Loads project data, aggregates stats, and emits the appropriate event so
 * CeremonyService picks it up naturally.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { ProjectService } from '../../services/project-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('ceremonies');

type CeremonyType = 'standup' | 'retro' | 'project-retro';

interface TriggerBody {
  projectPath: string;
  projectSlug: string;
  milestoneSlug?: string;
  ceremonyType: CeremonyType;
}

export function createCeremoniesRoutes(
  events: EventEmitter,
  featureLoader: FeatureLoader,
  projectService: ProjectService
): Router {
  const router = Router();

  router.post(
    '/trigger',
    validatePathParams('projectPath'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { projectPath, projectSlug, milestoneSlug, ceremonyType } = req.body as TriggerBody;

        if (!projectPath || !projectSlug || !ceremonyType) {
          res.status(400).json({
            success: false,
            error: 'projectPath, projectSlug, and ceremonyType are required',
          });
          return;
        }

        const project = await projectService.getProject(projectPath, projectSlug);
        if (!project) {
          res.status(404).json({ success: false, error: `Project not found: ${projectSlug}` });
          return;
        }

        const allFeatures = await featureLoader.getAll(projectPath);

        if (ceremonyType === 'project-retro') {
          // Aggregate project-wide stats and emit project:completed
          let totalFeatures = 0;
          let totalCostUsd = 0;
          let failureCount = 0;
          const milestoneSummaries: Array<{
            milestoneTitle: string;
            featureCount: number;
            costUsd: number;
          }> = [];

          for (const milestone of project.milestones) {
            const milestoneFeatures = allFeatures.filter((f) =>
              milestone.phases.some((p) => p.featureId === f.id)
            );
            const costUsd = milestoneFeatures.reduce((sum, f) => sum + (f.costUsd || 0), 0);
            totalFeatures += milestoneFeatures.length;
            totalCostUsd += costUsd;
            failureCount += milestoneFeatures.filter((f) => (f.failureCount || 0) > 0).length;

            milestoneSummaries.push({
              milestoneTitle: milestone.title,
              featureCount: milestoneFeatures.length,
              costUsd,
            });
          }

          events.emit('project:completed', {
            projectPath,
            projectTitle: project.title,
            projectSlug,
            totalMilestones: project.milestones.length,
            totalFeatures,
            totalCostUsd,
            failureCount,
            milestoneSummaries,
          });

          events.emit('ceremony:triggered', {
            projectPath,
            projectSlug,
            ceremonyType,
          });

          logger.info(`Manually triggered project retro for "${project.title}"`);
          res.json({ success: true, message: `Project retro triggered for ${project.title}` });
          return;
        }

        // standup or retro — requires milestoneSlug
        if (!milestoneSlug) {
          res.status(400).json({
            success: false,
            error: 'milestoneSlug is required for standup and retro ceremonies',
          });
          return;
        }

        const milestone = project.milestones.find((m) => m.slug === milestoneSlug);
        if (!milestone) {
          res.status(404).json({
            success: false,
            error: `Milestone not found: ${milestoneSlug}`,
          });
          return;
        }

        const milestoneNumber = project.milestones.findIndex((m) => m.slug === milestoneSlug) + 1;

        if (ceremonyType === 'standup') {
          events.emit('milestone:started', {
            projectPath,
            projectTitle: project.title,
            projectSlug,
            milestoneTitle: milestone.title,
            milestoneNumber,
          });
        } else {
          // retro
          const milestoneFeatures = allFeatures.filter((f) =>
            milestone.phases.some((p) => p.featureId === f.id)
          );

          let totalCostUsd = 0;
          let failureCount = 0;
          const prUrls: string[] = [];
          const featureSummaries: Array<{
            id: string;
            title: string;
            status: string;
            costUsd: number;
            prUrl?: string;
            failureCount?: number;
          }> = [];

          for (const feature of milestoneFeatures) {
            const costUsd = feature.costUsd || 0;
            const featureFailures = feature.failureCount || 0;
            totalCostUsd += costUsd;
            if (featureFailures > 0) failureCount++;
            if (feature.prUrl) prUrls.push(feature.prUrl);

            featureSummaries.push({
              id: feature.id,
              title: feature.title || 'Untitled',
              status: feature.status || 'backlog',
              costUsd,
              prUrl: feature.prUrl,
              failureCount: featureFailures,
            });
          }

          events.emit('milestone:completed', {
            projectPath,
            projectTitle: project.title,
            projectSlug,
            milestoneTitle: milestone.title,
            milestoneNumber,
            featureCount: milestoneFeatures.length,
            totalCostUsd,
            failureCount,
            prUrls,
            featureSummaries,
          });
        }

        events.emit('ceremony:triggered', {
          projectPath,
          projectSlug,
          milestoneSlug,
          ceremonyType,
        });

        logger.info(
          `Manually triggered ${ceremonyType} for "${project.title}" milestone "${milestone.title}"`
        );
        res.json({
          success: true,
          message: `${ceremonyType} triggered for milestone "${milestone.title}"`,
        });
      } catch (error) {
        logger.error('Failed to trigger ceremony:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  return router;
}
