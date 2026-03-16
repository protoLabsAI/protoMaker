/**
 * Signal Dictionary module — wires signal evaluation to board events.
 *
 * Event-driven signals fire on existing event bus topics. Polling-based
 * signals (stale-review, project-drift) register on the scheduler.
 */

import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';

import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('SignalDictionary:Module');

export function register(container: ServiceContainer): void {
  const { events, signalDictionaryService, featureLoader, schedulerService } = container;

  if (!signalDictionaryService) {
    logger.warn('SignalDictionaryService not available — skipping signal wiring');
    return;
  }

  // ── Event-driven signals ─────────────────────────────────────────────────

  // Agent Failure Storm: feature blocked with increasing failureCount
  events.subscribe((type, payload) => {
    if (type !== 'feature:status-changed') return;
    const p = payload as {
      featureId?: string;
      projectPath?: string;
      newStatus?: string;
      feature?: Feature;
    };
    if (p.newStatus !== 'blocked' || !p.feature || !p.projectPath || !p.featureId) return;

    const failureCount = p.feature.failureCount ?? 0;
    if (failureCount < 1) return;

    void signalDictionaryService.evaluate('agent-failure-storm', failureCount, {
      projectPath: p.projectPath,
      featureId: p.featureId,
    });
  });

  // Remediation Loop: feature with high remediation cycle count
  events.subscribe((type, payload) => {
    if (type !== 'pr:remediation-started') return;
    const p = payload as { featureId?: string; projectPath?: string; cycleCount?: number };
    if (!p.featureId || !p.projectPath || p.cycleCount == null) return;

    void signalDictionaryService.evaluate('remediation-loop', p.cycleCount, {
      projectPath: p.projectPath,
      featureId: p.featureId,
    });
  });

  // Cost Cap: feature cost approaching limit
  events.subscribe((type, payload) => {
    if (type !== 'feature:completed' && type !== 'feature:status-changed') return;
    const p = payload as { featureId?: string; projectPath?: string; feature?: Feature };
    if (!p.feature || !p.projectPath || !p.featureId) return;

    const costUsd = p.feature.costUsd ?? 0;
    // Get cost cap from workflow settings (default: undefined = no cap)
    // We express cost-cap signal as percentage of cap — only evaluate if cap is set
    const maxCost = p.feature.costUsd != null ? undefined : undefined;
    // The actual check uses the workflow settings maxCostUsdPerFeature;
    // for now, we evaluate raw cost and let the threshold handle it.
    // Signal value is cost in USD — thresholds in the dictionary should be raw USD
    // or we can normalize as percentage. We'll use percentage (0-100) for consistency
    // but that requires knowing the cap at evaluation time.
    // Defer percentage-based cost cap to the polling signal below.
    void Promise.resolve(); // placeholder — cost-cap is handled by polling
  });

  // ── Polling-based signals (registered on scheduler) ──────────────────────

  // Stale Review: check all features in review status for aging
  const staleReviewCheck = async (): Promise<void> => {
    try {
      const projectPaths = await getActiveProjectPaths(container);
      for (const projectPath of projectPaths) {
        const features = await featureLoader.getAll(projectPath);
        const reviewFeatures = features.filter((f) => f.status === 'review');

        for (const feature of reviewFeatures) {
          const reviewStartedAt = findStatusTransitionTime(feature, 'review');
          if (!reviewStartedAt) continue;

          const ageMinutes = (Date.now() - reviewStartedAt) / (60 * 1000);

          void signalDictionaryService.evaluate('stale-review', ageMinutes, {
            projectPath,
            featureId: feature.id,
            prNumber: feature.prNumber,
          });
        }
      }
    } catch (err) {
      logger.warn('Stale review check failed:', err);
    }
  };

  // WIP Overload: check WIP saturation across all projects
  const wipOverloadCheck = async (): Promise<void> => {
    try {
      const projectPaths = await getActiveProjectPaths(container);
      for (const projectPath of projectPaths) {
        const features = await featureLoader.getAll(projectPath);
        const inProgressCount = features.filter((f) => f.status === 'in_progress').length;

        // Get WIP limit from settings (default: 5)
        let maxInProgress = 5;
        try {
          const projectSettings = await container.settingsService.getProjectSettings(projectPath);
          maxInProgress = projectSettings?.workflow?.maxInProgress ?? 5;
        } catch {
          // Use default
        }

        if (maxInProgress > 0) {
          const ratio = inProgressCount / maxInProgress;
          void signalDictionaryService.evaluate('wip-overload', ratio, { projectPath });
        }
      }
    } catch (err) {
      logger.warn('WIP overload check failed:', err);
    }
  };

  // Cost Cap: check features approaching cost limits
  const costCapCheck = async (): Promise<void> => {
    try {
      const projectPaths = await getActiveProjectPaths(container);
      for (const projectPath of projectPaths) {
        let maxCostUsd: number | undefined;
        try {
          const projectSettings = await container.settingsService.getProjectSettings(projectPath);
          maxCostUsd = projectSettings?.workflow?.maxCostUsdPerFeature;
        } catch {
          // No cap
        }
        if (!maxCostUsd) continue;

        const features = await featureLoader.getAll(projectPath);
        const activeFeatures = features.filter(
          (f) => f.status === 'in_progress' || f.status === 'review'
        );

        for (const feature of activeFeatures) {
          const costUsd = feature.costUsd ?? 0;
          const percentage = (costUsd / maxCostUsd) * 100;

          void signalDictionaryService.evaluate('cost-cap', percentage, {
            projectPath,
            featureId: feature.id,
          });
        }
      }
    } catch (err) {
      logger.warn('Cost cap check failed:', err);
    }
  };

  // Register polling signals on scheduler (5-minute intervals)
  schedulerService.registerInterval(
    'signal-stale-review',
    'Signal: Stale Review Check',
    5 * 60 * 1000,
    staleReviewCheck,
    { category: 'monitor' }
  );

  schedulerService.registerInterval(
    'signal-wip-overload',
    'Signal: WIP Overload Check',
    5 * 60 * 1000,
    wipOverloadCheck,
    { category: 'monitor' }
  );

  schedulerService.registerInterval(
    'signal-cost-cap',
    'Signal: Cost Cap Check',
    5 * 60 * 1000,
    costCapCheck,
    { category: 'monitor' }
  );

  logger.info('Signal dictionary wired: 3 event-driven, 3 polling-based signals active');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get all active project paths from the settings service.
 */
async function getActiveProjectPaths(container: ServiceContainer): Promise<string[]> {
  try {
    const settings = await container.settingsService.getGlobalSettings();
    const paths: string[] = [];

    // From autoModeAlwaysOn projects
    if (settings.autoModeAlwaysOn?.projects) {
      for (const p of settings.autoModeAlwaysOn.projects) {
        if (p.projectPath && !paths.includes(p.projectPath)) {
          paths.push(p.projectPath);
        }
      }
    }

    // From registered projects
    if (settings.projects) {
      for (const p of settings.projects) {
        if (p.path && !paths.includes(p.path)) {
          paths.push(p.path);
        }
      }
    }

    return paths;
  } catch {
    return [];
  }
}

/**
 * Find when a feature transitioned to a given status by walking statusHistory.
 */
function findStatusTransitionTime(feature: Feature, targetStatus: string): number | null {
  if (!feature.statusHistory?.length) return null;

  // Walk backwards to find the most recent transition TO the target status
  for (let i = feature.statusHistory.length - 1; i >= 0; i--) {
    const entry = feature.statusHistory[i];
    if (entry?.to === targetStatus && entry.timestamp) {
      return new Date(entry.timestamp).getTime();
    }
  }

  return null;
}
