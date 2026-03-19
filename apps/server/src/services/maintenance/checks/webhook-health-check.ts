/**
 * WebhookHealthCheck — warns when a project has PRs in review but no CI events
 * have been received within the grace period.
 *
 * A project in "review" state should be receiving check_suite / check_run events
 * from GitHub. If none arrive within GRACE_PERIOD_MS after the PR was first
 * tracked, it typically means the webhook is misconfigured or the secret is wrong.
 *
 * Detection:
 * - For each configured project path, load all features in 'review' status that
 *   have a prNumber.
 * - If any feature has been in review for longer than GRACE_PERIOD_MS and has no
 *   lastCheckSuiteId recorded, emit a 'warning' issue.
 *
 * No auto-fix — webhook misconfiguration requires operator intervention.
 */

import { createLogger } from '@protolabsai/utils';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';
import type { FeatureLoader } from '../../feature-loader.js';

const logger = createLogger('WebhookHealthCheck');

/** How long a PR can be in review without a CI event before we warn. */
export const WEBHOOK_HEALTH_GRACE_PERIOD_MS = 60 * 60 * 1000; // 1 hour

export class WebhookHealthCheck implements MaintenanceCheck {
  readonly id = 'webhook-health';

  constructor(
    private readonly featureLoader: FeatureLoader,
    private readonly nowMs: () => number = () => Date.now()
  ) {}

  async run(projectPath: string): Promise<MaintenanceIssue[]> {
    const issues: MaintenanceIssue[] = [];

    try {
      const features = await this.featureLoader.getAll(projectPath);

      const reviewFeatures = features.filter((f) => f.status === 'review' && f.prNumber != null);

      for (const feature of reviewFeatures) {
        // Determine how long the PR has been tracked
        const trackedSince = feature.prTrackedSince ?? feature.reviewStartedAt;

        if (!trackedSince) {
          // No timestamp available — skip, can't compute elapsed time
          continue;
        }

        const trackedSinceMs = new Date(trackedSince).getTime();
        const elapsedMs = this.nowMs() - trackedSinceMs;

        // Within grace period — too early to warn
        if (elapsedMs < WEBHOOK_HEALTH_GRACE_PERIOD_MS) {
          continue;
        }

        // If a CI event has already been seen, the webhook is working
        if (feature.lastCheckSuiteId != null) {
          continue;
        }

        logger.warn(
          `WebhookHealthCheck: PR #${feature.prNumber} for feature "${feature.id}" has been in review for ${Math.round(elapsedMs / 60_000)} min with no CI events`
        );

        issues.push({
          checkId: this.id,
          severity: 'warning',
          featureId: feature.id,
          message: `PR #${feature.prNumber} (${feature.title || feature.id}) has been in review for ${Math.round(elapsedMs / 60_000)} minutes with no CI events received. Webhook may be misconfigured.`,
          autoFixable: false,
          context: {
            featureId: feature.id,
            featureTitle: feature.title,
            prNumber: feature.prNumber,
            trackedSince,
            elapsedMinutes: Math.round(elapsedMs / 60_000),
            projectPath,
          },
        });
      }
    } catch (error) {
      logger.error(`WebhookHealthCheck failed for ${projectPath}:`, error);
    }

    return issues;
  }
}
