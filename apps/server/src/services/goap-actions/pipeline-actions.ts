/**
 * Pipeline Flow Actions
 *
 * Actions for moving features through the delivery pipeline:
 * promoting completed features to review, unblocking ready features.
 */

import type { GOAPActionDefinition } from '@automaker/types';
import { areDependenciesSatisfied } from '@automaker/dependency-resolver';
import { createLogger } from '@automaker/utils';
import type { GOAPActionRegistry } from '../goap-action-registry.js';
import type { FeatureLoader } from '../feature-loader.js';

const logger = createLogger('GOAPActions:Pipeline');

export const PROMOTE_COMPLETED_TO_REVIEW: GOAPActionDefinition = {
  id: 'promote_completed_to_review',
  name: 'Promote Completed to Review',
  description: 'Move features in "completed" status to "review" for human review',
  category: 'pipeline',
  preconditions: [{ key: 'has_completed_features', value: true }],
  effects: [{ key: 'has_completed_features', value: false }],
  cost: 1,
};

export const UNBLOCK_READY_FEATURES: GOAPActionDefinition = {
  id: 'unblock_ready_features',
  name: 'Unblock Ready Features',
  description:
    'Clear resolved dependencies on backlog features so auto-mode picks them up without delay',
  category: 'pipeline',
  preconditions: [{ key: 'has_blocked_ready_features', value: true }],
  effects: [{ key: 'has_blocked_ready_features', value: false }],
  cost: 2,
};

export function registerPipelineActions(
  registry: GOAPActionRegistry,
  featureLoader: FeatureLoader
): void {
  registry.register(PROMOTE_COMPLETED_TO_REVIEW, async (projectPath) => {
    const features = await featureLoader.getAll(projectPath);
    const completed = features.filter((f) => f.status === 'completed');
    let promoted = 0;
    for (const feature of completed) {
      await featureLoader.update(projectPath, feature.id, { status: 'review' });
      promoted++;
    }
    if (promoted > 0) {
      logger.info('Promoted completed features to review', { projectPath, count: promoted });
    } else {
      logger.debug('No completed features found to promote');
    }
  });

  registry.register(UNBLOCK_READY_FEATURES, async (projectPath) => {
    const features = await featureLoader.getAll(projectPath);
    // Find features that have dependencies but all deps are satisfied
    const ready = features.filter(
      (f) =>
        f.status === 'backlog' &&
        f.dependencies &&
        f.dependencies.length > 0 &&
        areDependenciesSatisfied(f, features)
    );
    // Clear the dependencies array so auto-mode treats them as regular unblocked backlog
    let unblocked = 0;
    for (const feature of ready) {
      await featureLoader.update(projectPath, feature.id, { dependencies: [] });
      unblocked++;
    }
    if (unblocked > 0) {
      logger.info('Cleared resolved dependencies on ready features', {
        projectPath,
        count: unblocked,
        featureIds: ready.map((f) => f.id),
      });
    } else {
      logger.debug('No blocked-but-ready features found');
    }
  });
}
