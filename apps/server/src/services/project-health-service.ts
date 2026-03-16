/**
 * ProjectHealthService — Auto-computes project health from signals
 *
 * Derives on-track / at-risk / off-track from:
 *   - Milestone progress vs target dates
 *   - WIP saturation
 *   - Blocked feature count
 *   - Error budget burn rate
 *
 * Health is recomputed on feature:status-changed events and on a 15-minute interval.
 * Manual health overrides are respected but expire after 7 days.
 *
 * @see docs/internal/portfolio-philosophy.md "Auto-Computed Project Health"
 */

import { createLogger } from '@protolabsai/utils';
import type { ProjectHealth, Project } from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';
import type { ProjectService } from './project-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('ProjectHealth');

/** How long a manual health override lasts before auto-compute resumes. */
const MANUAL_OVERRIDE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface HealthFactors {
  lateMilestoneCount: number;
  blockedFeatureCount: number;
  wipRatio: number;
  totalFeatures: number;
  completedFeatures: number;
}

export class ProjectHealthService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly featureLoader: FeatureLoader,
    private readonly settingsService: SettingsService,
    private readonly events: EventEmitter
  ) {}

  /**
   * Compute health for a single project and persist it.
   * Skips if a manual override is still active (< 7 days old).
   */
  async computeAndUpdate(projectPath: string, projectSlug: string): Promise<ProjectHealth | null> {
    try {
      const project = await this.projectService.getProject(projectPath, projectSlug);
      if (!project) return null;

      // Respect manual overrides that are < 7 days old
      if (this.hasActiveManualOverride(project)) {
        return project.health ?? 'on-track';
      }

      const factors = await this.computeFactors(projectPath, project);
      const health = this.deriveHealth(factors);

      // Only update if health changed
      if (project.health !== health) {
        await this.projectService.updateProject(projectPath, projectSlug, { health });
        logger.info(
          `Project "${projectSlug}" health: ${project.health ?? 'unset'} -> ${health} ` +
            `(late=${factors.lateMilestoneCount}, blocked=${factors.blockedFeatureCount}, wip=${factors.wipRatio.toFixed(1)})`
        );
      }

      return health;
    } catch (err) {
      logger.warn(`Failed to compute health for project "${projectSlug}":`, err);
      return null;
    }
  }

  /**
   * Compute health for ALL projects in a given project path.
   */
  async computeAll(projectPath: string): Promise<void> {
    try {
      const slugs = await this.projectService.listProjects(projectPath);
      for (const slug of slugs) {
        await this.computeAndUpdate(projectPath, slug);
      }
    } catch (err) {
      logger.warn(`Failed to compute health for projects in ${projectPath}:`, err);
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /**
   * Compute the raw health factors for a project.
   */
  private async computeFactors(projectPath: string, project: Project): Promise<HealthFactors> {
    const now = Date.now();

    // Count late milestones
    let lateMilestoneCount = 0;
    if (project.milestones) {
      for (const milestone of project.milestones) {
        if (milestone.status === 'completed') continue;
        if (!milestone.targetDate) continue;

        const targetMs = new Date(milestone.targetDate).getTime();
        if (now > targetMs) {
          lateMilestoneCount++;
        }
      }
    }

    // Count features by status
    const features = await this.featureLoader.getAll(projectPath);
    // Filter to features belonging to this project (by projectSlug or epicId)
    const projectFeatures = features.filter((f) => {
      if (f.projectSlug === project.slug) return true;
      // Also match features in project milestones by epicId
      if (f.epicId && project.milestones?.some((m) => m.epicId === f.epicId)) return true;
      return false;
    });

    const blockedFeatureCount = projectFeatures.filter((f) => f.status === 'blocked').length;
    const inProgressCount = projectFeatures.filter((f) => f.status === 'in_progress').length;
    const completedFeatures = projectFeatures.filter((f) => f.status === 'done').length;

    // Get WIP limit
    let maxInProgress = 5;
    try {
      const projectSettings = await this.settingsService.getProjectSettings(projectPath);
      maxInProgress = projectSettings?.workflow?.maxInProgress ?? 5;
    } catch {
      // Use default
    }

    const wipRatio = maxInProgress > 0 ? inProgressCount / maxInProgress : 0;

    return {
      lateMilestoneCount,
      blockedFeatureCount,
      wipRatio,
      totalFeatures: projectFeatures.length,
      completedFeatures,
    };
  }

  /**
   * Derive health from factors using the rules in portfolio-philosophy.md:
   *
   * | Condition                                                        | Health    |
   * |------------------------------------------------------------------|-----------|
   * | All milestones on schedule, WIP within limits, < 3 blocked       | On track  |
   * | Any milestone late, OR WIP at limit, OR >= 3 blocked             | At risk   |
   * | 2+ milestones late, OR WIP > 2x limit, OR > 3 blocked features  | Off track |
   */
  private deriveHealth(factors: HealthFactors): ProjectHealth {
    const { lateMilestoneCount, blockedFeatureCount, wipRatio } = factors;

    // Off track: severe conditions
    if (lateMilestoneCount >= 2 || wipRatio >= 2.0 || blockedFeatureCount > 3) {
      return 'off-track';
    }

    // At risk: warning conditions
    if (lateMilestoneCount >= 1 || wipRatio >= 1.0 || blockedFeatureCount >= 3) {
      return 'at-risk';
    }

    return 'on-track';
  }

  /**
   * Check if a project has a manual health override that hasn't expired.
   * A manual override is the most recent statusUpdate with a health value.
   */
  private hasActiveManualOverride(project: Project): boolean {
    const updates = project.updates;
    if (!updates?.length) return false;

    // Find most recent status update
    const sorted = [...updates].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const latest = sorted[0];
    if (!latest) return false;

    const age = Date.now() - new Date(latest.createdAt).getTime();
    return age < MANUAL_OVERRIDE_EXPIRY_MS;
  }
}
