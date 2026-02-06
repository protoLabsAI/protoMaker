/**
 * WIP Management Actions
 *
 * Actions for managing work-in-progress: stuck features,
 * runaway agents, and backlog ordering.
 */

import type { GOAPActionDefinition } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import type { GOAPActionRegistry } from '../goap-action-registry.js';
import type { FeatureLoader } from '../feature-loader.js';
import type { AutoModeService } from '../auto-mode-service.js';

const logger = createLogger('GOAPActions:WIPManagement');

/** 2 hours in ms — standard stale threshold */
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
/** 4 hours in ms — very stale / runaway threshold */
const VERY_STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;

export const ESCALATE_STUCK_FEATURE: GOAPActionDefinition = {
  id: 'escalate_stuck_feature',
  name: 'Escalate Stuck Feature',
  description: 'Escalate a feature running > 2 hours to architectural complexity',
  category: 'wip-management',
  preconditions: [{ key: 'has_stale_features', value: true }],
  effects: [{ key: 'has_stale_features', value: false }],
  cost: 5,
};

export const STOP_RUNAWAY_FEATURE: GOAPActionDefinition = {
  id: 'stop_runaway_feature',
  name: 'Stop Runaway Feature',
  description: 'Stop a feature running > 4 hours — likely stuck in a loop',
  category: 'wip-management',
  preconditions: [{ key: 'has_very_stale_features', value: true }],
  effects: [{ key: 'has_very_stale_features', value: false }],
  cost: 4,
};

export const REBALANCE_PRIORITIES: GOAPActionDefinition = {
  id: 'rebalance_priorities',
  name: 'Rebalance Priorities',
  description: 'Reorder backlog so higher-priority features are processed first',
  category: 'wip-management',
  preconditions: [{ key: 'has_misordered_backlog', value: true }],
  effects: [{ key: 'has_misordered_backlog', value: false }],
  cost: 2,
};

export function registerWIPManagementActions(
  registry: GOAPActionRegistry,
  featureLoader: FeatureLoader,
  autoModeService: AutoModeService
): void {
  registry.register(ESCALATE_STUCK_FEATURE, async (projectPath) => {
    const features = await featureLoader.getAll(projectPath);
    const now = Date.now();
    const stale = features.find(
      (f) =>
        f.status === 'running' &&
        f.startedAt &&
        now - new Date(f.startedAt).getTime() > STALE_THRESHOLD_MS
    );
    if (stale) {
      await featureLoader.update(projectPath, stale.id, {
        complexity: 'architectural',
        startedAt: new Date().toISOString(), // Reset so not re-detected immediately
      });
      logger.info('Escalated stuck feature to architectural', {
        projectPath,
        featureId: stale.id,
      });
    } else {
      logger.debug('No stale features found to escalate');
    }
  });

  registry.register(STOP_RUNAWAY_FEATURE, async (projectPath, branchName) => {
    const features = await featureLoader.getAll(projectPath);
    const now = Date.now();
    const runaway = features.find(
      (f) =>
        f.status === 'running' &&
        f.startedAt &&
        now - new Date(f.startedAt).getTime() > VERY_STALE_THRESHOLD_MS
    );
    if (runaway) {
      // Stop the agent and move back to backlog
      try {
        await autoModeService.stopFeature(runaway.id);
      } catch {
        // Agent may already be stopped
      }
      await featureLoader.update(projectPath, runaway.id, {
        status: 'backlog',
        error: 'Stopped by GOAP: exceeded 4-hour runtime limit',
        failureCount: (runaway.failureCount || 0) + 1,
        startedAt: undefined,
      });
      logger.info('Stopped runaway feature', {
        projectPath,
        featureId: runaway.id,
      });
    } else {
      logger.debug('No runaway features found to stop');
    }
  });

  registry.register(REBALANCE_PRIORITIES, async (projectPath) => {
    // This is a signal action — auto-mode already sorts by priority.
    // The effect clears the flag so we don't keep firing.
    // In the future this could do more sophisticated reordering.
    logger.info('Rebalance priorities signal processed', { projectPath });
  });
}
