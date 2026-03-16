/**
 * DanglingDependencyCheck - Detects features that depend on non-existent features.
 *
 * When a feature is deleted, other features that depended on it are left with a
 * dangling dependency reference. These prevent the dependency resolver from
 * scheduling the affected feature correctly.
 *
 * Auto-fix: remove the dangling dependency IDs from the feature's dependencies array.
 */

import { createLogger } from '@protolabsai/utils';
import type { FeatureLoader } from '../../feature-loader.js';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';

const logger = createLogger('DanglingDependencyCheck');

export class DanglingDependencyCheck implements MaintenanceCheck {
  readonly id = 'dangling-dependency';

  constructor(private readonly featureLoader: FeatureLoader) {}

  async run(projectPath: string): Promise<MaintenanceIssue[]> {
    const issues: MaintenanceIssue[] = [];

    try {
      const features = await this.featureLoader.getAll(projectPath);
      const featureMap = new Map(features.map((f) => [f.id, f]));

      for (const feature of features) {
        if (!feature.dependencies || feature.dependencies.length === 0) continue;

        const dangling = feature.dependencies.filter((depId) => !featureMap.has(depId));
        if (dangling.length === 0) continue;

        issues.push({
          checkId: this.id,
          severity: 'warning',
          featureId: feature.id,
          message: `Feature "${feature.title || feature.id}" depends on ${dangling.length} non-existent feature(s): ${dangling.join(', ')}`,
          autoFixable: true,
          fixDescription: 'Remove dangling dependency IDs',
          context: {
            featureId: feature.id,
            danglingIds: dangling,
            validIds: feature.dependencies.filter((depId) => featureMap.has(depId)),
            projectPath,
          },
        });
      }
    } catch (error) {
      logger.error(`DanglingDependencyCheck failed for ${projectPath}:`, error);
    }

    return issues;
  }

  async fix(projectPath: string, issue: MaintenanceIssue): Promise<void> {
    const featureId = issue.featureId;
    if (!featureId) return;

    const validIds = issue.context?.validIds as string[] | undefined;
    if (!validIds) return;

    logger.info(`Removing dangling dependencies from feature ${featureId}`);
    await this.featureLoader.update(projectPath, featureId, { dependencies: validIds });
    logger.info(`Removed dangling dependencies from feature ${featureId}`);
  }
}
