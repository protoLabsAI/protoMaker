/**
 * GET /api/projects/:slug/summary
 *
 * Returns a unified project summary for the frontend project page:
 *   - project:        core metadata (slug, title, status, health, etc.)
 *   - featureCount:   feature counts keyed by FeatureStatus
 *   - milestones:     milestones with completion % (based on done features)
 *   - artifacts:      grouped artifact index entries (ceremonies, changelogs, escalations)
 *   - recentTimeline: last 20 EventLedger events for the project
 *
 * Query params:
 *   ?projectPath=<absolute path>  — base path for project file storage (required)
 */

import type { Request, Response } from 'express';
import type { ProjectService } from '../../../services/project-service.js';
import type { ProjectArtifactService } from '../../../services/project-artifact-service.js';
import type { EventLedgerService } from '../../../services/event-ledger-service.js';
import type { ProjectSummary, MilestoneSummary } from '@protolabsai/types';

export function createSummaryHandler(
  projectService: ProjectService,
  projectArtifactService: ProjectArtifactService,
  eventLedger: EventLedgerService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { slug } = req.params as { slug: string };
      const { projectPath } = req.query as { projectPath?: string };

      if (!slug) {
        res.status(400).json({ success: false, error: 'Project slug is required' });
        return;
      }

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query param is required' });
        return;
      }

      // ── Project metadata ──────────────────────────────────────────────────

      const project = await projectService.getProject(projectPath, slug);

      if (!project) {
        res.status(404).json({ success: false, error: `Project "${slug}" not found` });
        return;
      }

      // ── Feature counts ────────────────────────────────────────────────────

      const { features } = await projectService.getProjectFeatures(projectPath, slug);

      const featureCount: Record<string, number> = {};
      for (const feature of features) {
        const status = feature.status as string;
        featureCount[status] = (featureCount[status] ?? 0) + 1;
      }

      // ── Milestone completion ──────────────────────────────────────────────

      // Build featureId → status lookup for efficient O(1) access
      const featureStatusMap = new Map(features.map((f) => [f.id, f.status as string]));

      const milestones: MilestoneSummary[] = project.milestones.map((m) => {
        const phaseCount = m.phases.length;
        const completedPhaseCount = m.phases.filter(
          (p) => p.featureId && featureStatusMap.get(p.featureId) === 'done'
        ).length;
        const completionPct =
          phaseCount > 0 ? Math.round((completedPhaseCount / phaseCount) * 100) : 0;

        return {
          slug: m.slug,
          title: m.title,
          status: m.status,
          completionPct,
          phaseCount,
          completedPhaseCount,
        };
      });

      // ── Artifacts ─────────────────────────────────────────────────────────

      const [ceremonies, changelogs, escalations] = await Promise.all([
        projectArtifactService.listArtifacts(projectPath, slug, 'ceremony-report'),
        projectArtifactService.listArtifacts(projectPath, slug, 'changelog'),
        projectArtifactService.listArtifacts(projectPath, slug, 'escalation'),
      ]);

      // ── Recent timeline (last 20 events) ─────────────────────────────────

      const allEvents = await eventLedger.queryByProject(slug);
      const recentTimeline = allEvents.slice(-20);

      // ── Response ──────────────────────────────────────────────────────────

      const summary: ProjectSummary = {
        project: {
          slug: project.slug,
          title: project.title,
          goal: project.goal,
          status: project.status,
          health: project.health,
          priority: project.priority,
          lead: project.lead,
          startDate: project.startDate,
          targetDate: project.targetDate,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
        featureCount,
        milestones,
        artifacts: { ceremonies, changelogs, escalations },
        recentTimeline,
      };

      res.json({ success: true, summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  };
}
