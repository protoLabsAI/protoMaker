/**
 * Failure Recovery Actions
 *
 * Actions for retrying and escalating failed features.
 */

import type { GOAPActionDefinition } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import type { GOAPActionRegistry } from '../goap-action-registry.js';
import type { FeatureLoader } from '../feature-loader.js';

const logger = createLogger('GOAPActions:FailureRecovery');

const MAX_RETRIES = 3;

export const RETRY_FAILED_FEATURE: GOAPActionDefinition = {
  id: 'retry_failed_feature',
  name: 'Retry Failed Feature',
  description: 'Move a retryable failed feature (failureCount < 2) back to backlog for retry',
  category: 'failure-recovery',
  preconditions: [{ key: 'retryable_failed_count', value: 0, operator: 'gt' }],
  effects: [{ key: 'has_failed_features', value: false }],
  cost: 3,
};

export const ESCALATE_FAILED_FEATURE: GOAPActionDefinition = {
  id: 'escalate_failed_feature',
  name: 'Escalate Chronic Failure',
  description:
    'Escalate a chronically failing feature (failureCount >= 2) to architectural complexity',
  category: 'failure-recovery',
  preconditions: [{ key: 'has_chronic_failures', value: true }],
  effects: [{ key: 'has_chronic_failures', value: false }],
  cost: 5,
};

export function registerFailureRecoveryActions(
  registry: GOAPActionRegistry,
  featureLoader: FeatureLoader
): void {
  registry.register(RETRY_FAILED_FEATURE, async (projectPath) => {
    const features = await featureLoader.getAll(projectPath);
    const failed = features.find((f) => f.status === 'failed' && (f.failureCount || 0) < 2);
    if (failed) {
      const newFailureCount = (failed.failureCount || 0) + 1;
      await featureLoader.update(projectPath, failed.id, {
        status: 'backlog',
        failureCount: newFailureCount,
        error: undefined,
      });
      logger.info('Retried failed feature', {
        projectPath,
        featureId: failed.id,
        failureCount: newFailureCount,
      });
    } else {
      logger.debug('No retryable failed features found');
    }
  });

  registry.register(ESCALATE_FAILED_FEATURE, async (projectPath) => {
    const features = await featureLoader.getAll(projectPath);
    const chronic = features.find((f) => f.status === 'failed' && (f.failureCount || 0) >= 2);
    if (chronic) {
      await featureLoader.update(projectPath, chronic.id, {
        status: 'backlog',
        complexity: 'architectural',
        failureCount: (chronic.failureCount || 0) + 1,
        error: undefined,
      });
      logger.info('Escalated chronic failure to architectural', {
        projectPath,
        featureId: chronic.id,
      });
    } else {
      logger.debug('No chronic failures found to escalate');
    }
  });
}
