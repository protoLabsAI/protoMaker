/**
 * StuckFeatureCheck - Detects features stuck in in_progress without agent activity.
 *
 * A feature is considered stuck when its status is 'in_progress' and it has been
 * in that state longer than stuckThresholdMs without any activity. These features
 * typically represent agent runs that crashed without updating the feature record.
 *
 * Auto-fix: reset status to 'backlog'.
 */

import { createLogger } from '@protolabsai/utils';
import { STUCK_FEATURE_THRESHOLD_MS } from '../../../config/timeouts.js';
import type { FeatureLoader } from '../../feature-loader.js';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';

const logger = createLogger('StuckFeatureCheck');

export class StuckFeatureCheck implements MaintenanceCheck {
  readonly id = 'stuck-feature';

  constructor(
    private readonly featureLoader: FeatureLoader,
    private readonly stuckThresholdMs: number = STUCK_FEATURE_THRESHOLD_MS
  ) {}

  async run(projectPath: string): Promise<MaintenanceIssue[]> {
    const issues: MaintenanceIssue[] = [];

    try {
      const features = await this.featureLoader.getAll(projectPath);

      for (const feature of features) {
        if (feature.status !== 'in_progress') continue;
        if (!feature.startedAt) continue;

        const startedTime = new Date(feature.startedAt).getTime();
        const elapsed = Date.now() - startedTime;

        if (elapsed > this.stuckThresholdMs) {
          const elapsedMinutes = Math.round(elapsed / 60_000);
          issues.push({
            checkId: this.id,
            severity: 'warning',
            featureId: feature.id,
            message: `Feature "${feature.title || feature.id}" has been in_progress for ${elapsedMinutes} min without activity`,
            autoFixable: true,
            fixDescription: 'Reset status to backlog',
            context: {
              featureId: feature.id,
              featureTitle: feature.title,
              status: feature.status,
              startedAt: feature.startedAt,
              elapsedMs: elapsed,
              projectPath,
            },
          });
        }
      }
    } catch (error) {
      logger.error(`StuckFeatureCheck failed for ${projectPath}:`, error);
    }

    return issues;
  }

  async fix(projectPath: string, issue: MaintenanceIssue): Promise<void> {
    const featureId = issue.featureId;
    if (!featureId) return;

    logger.info(`Resetting stuck feature ${featureId} to backlog`);
    await this.featureLoader.update(projectPath, featureId, {
      status: 'backlog',
      startedAt: undefined,
      error: 'Auto-reset: Feature was stuck in in_progress state',
    });
    logger.info(`Reset stuck feature ${featureId} to backlog`);
  }
}
