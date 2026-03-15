/**
 * Maintenance module wiring
 *
 * Starts MaintenanceOrchestrator and registers check modules:
 * - board-health (full tier, 6h): FeatureHealthService board audit with auto-fix
 * - resource-usage (critical tier, 5min): HealthMonitorService resource check
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
    featureHealthService,
    healthMonitorService,
    schedulerService,
    events,
    eventHistoryService,
    autoModeService,
  } = container;

  // Board health check (full tier) — replaces built-in:board-health automation
  const boardHealthCheck: MaintenanceCheck = {
    id: 'board-health',
    name: 'Board Health Reconciliation',
    tier: 'full',
    async run(context: MaintenanceCheckContext): Promise<MaintenanceCheckResult> {
      const t0 = Date.now();
      let totalIssues = 0;
      let totalFixed = 0;

      for (const projectPath of context.projectPaths) {
        try {
          const report = await featureHealthService.audit(projectPath, true);
          totalIssues += report.issues.length;
          totalFixed += report.fixed.length;
        } catch (err) {
          logger.error(`Board health audit failed for ${projectPath}:`, err);
        }
      }

      return {
        checkId: 'board-health',
        passed: true,
        summary: `Board health: ${totalIssues} issues found, ${totalFixed} auto-fixed across ${context.projectPaths.length} projects`,
        details: { totalIssues, totalFixed, projectCount: context.projectPaths.length },
        durationMs: Date.now() - t0,
      };
    },
  };

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

  maintenanceOrchestrator.register(boardHealthCheck);
  maintenanceOrchestrator.register(resourceUsageCheck);

  maintenanceOrchestrator.start(schedulerService, events, eventHistoryService, () => {
    const paths = new Set<string>();
    for (const p of autoModeService.getActiveAutoLoopProjects()) {
      paths.add(p);
    }
    return Array.from(paths);
  });

  logger.info('MaintenanceOrchestrator started with board-health and resource-usage checks');
}
