/**
 * Project Health module — wires auto-computed project health.
 *
 * Recomputes health on feature:status-changed events (debounced per-project)
 * and on a 15-minute scheduler interval.
 */

import { createLogger } from '@protolabsai/utils';
import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('ProjectHealth:Module');

export function register(container: ServiceContainer): void {
  const { events, projectHealthService, schedulerService } = container;

  if (!projectHealthService) {
    logger.warn('ProjectHealthService not available — skipping health wiring');
    return;
  }

  // Debounce per-project: don't recompute health more than once per 30 seconds per project
  const lastCompute = new Map<string, number>();
  const DEBOUNCE_MS = 30_000;

  // Event-driven: recompute on feature status changes
  events.subscribe((type, payload) => {
    if (type !== 'feature:status-changed') return;
    const p = payload as { projectPath?: string };
    if (!p.projectPath) return;

    const now = Date.now();
    const lastTime = lastCompute.get(p.projectPath) ?? 0;
    if (now - lastTime < DEBOUNCE_MS) return;

    lastCompute.set(p.projectPath, now);
    void projectHealthService.computeAll(p.projectPath);
  });

  // Polling: recompute all project health every 15 minutes
  const healthCheck = async (): Promise<void> => {
    try {
      const settings = await container.settingsService.getGlobalSettings();
      const paths = new Set<string>();

      if (settings.autoModeAlwaysOn?.projects) {
        for (const p of settings.autoModeAlwaysOn.projects) {
          if (p.projectPath) paths.add(p.projectPath);
        }
      }
      if (settings.projects) {
        for (const p of settings.projects) {
          if (p.path) paths.add(p.path);
        }
      }

      for (const projectPath of paths) {
        await projectHealthService.computeAll(projectPath);
      }
    } catch (err) {
      logger.warn('Project health check failed:', err);
    }
  };

  schedulerService.registerInterval(
    'project-health',
    'Auto-Computed Project Health',
    15 * 60 * 1000,
    healthCheck,
    { category: 'health' }
  );

  logger.info('Project health wired: event-driven + 15-minute polling');
}
