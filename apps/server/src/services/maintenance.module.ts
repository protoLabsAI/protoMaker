/**
 * Maintenance module wiring
 *
 * Starts MaintenanceOrchestrator and registers check modules:
 * - resource-usage (critical tier, 5min): HealthMonitorService resource check
 *
 * Board health is handled by:
 *   - automation-service maintenance:stale-features (hourly)
 *   - ava-cron-tasks ava-daily-board-health (daily Discord report)
 */

import { createLogger } from '@protolabsai/utils';
import type {
  MaintenanceCheck,
  MaintenanceCheckContext,
  MaintenanceCheckResult,
} from '@protolabsai/types';
import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('Server:Wiring');

export function register(container: ServiceContainer): void {
  const {
    maintenanceOrchestrator,
    healthMonitorService,
    schedulerService,
    events,
    eventHistoryService,
    autoModeService,
  } = container;

  // Resource usage check (critical tier) — replaces HealthMonitorService periodic loop
  const resourceUsageCheck: MaintenanceCheck = {
    id: 'resource-usage',
    name: 'Resource Usage Monitor',
    tier: 'critical',
    async run(context: MaintenanceCheckContext): Promise<MaintenanceCheckResult> {
      const t0 = Date.now();
      try {
        const result = await healthMonitorService.runHealthCheck();
        const criticalIssues = result.issues.filter((i) => i.severity === 'critical');
        return {
          checkId: 'resource-usage',
          passed: criticalIssues.length === 0,
          summary: `Health status: ${result.status} — ${result.issues.length} issues (${criticalIssues.length} critical)`,
          details: {
            status: result.status,
            issueCount: result.issues.length,
            criticalCount: criticalIssues.length,
            metrics: result.metrics,
          },
          durationMs: Date.now() - t0,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          checkId: 'resource-usage',
          passed: false,
          summary: `Health check failed: ${error}`,
          durationMs: Date.now() - t0,
          error,
        };
      }
    },
  };

  maintenanceOrchestrator.register(resourceUsageCheck);

  maintenanceOrchestrator.start(schedulerService, events, eventHistoryService, () => {
    const paths = new Set<string>();
    for (const p of autoModeService.getActiveAutoLoopProjects()) {
      paths.add(p);
    }
    return Array.from(paths);
  });

  logger.info('MaintenanceOrchestrator started with resource-usage check');
}
