/**
 * Maintenance module wiring
 *
 * Starts MaintenanceOrchestrator and registers check modules:
 * - board-health (full tier, 6h): FeatureHealthService board audit with auto-fix
 * - resource-usage (critical tier, 5min): HealthMonitorService resource check
 * - webhook-health (full tier, 6h): Warns when PRs in review have no CI events after grace period
 */

import { createLogger } from '@protolabsai/utils';
import type {
  MaintenanceCheck,
  MaintenanceCheckContext,
  MaintenanceCheckResult,
} from '@protolabsai/types';
import type { ServiceContainer } from '../server/services.js';
import { WebhookHealthCheck } from './maintenance/checks/webhook-health-check.js';

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

  // feature-readiness check removed — Lead Engineer INTAKE phase handles description enrichment

  // Webhook health check (full tier) — warns when PRs in review have no CI events
  const { featureLoader } = container;
  const webhookHealthCheckInstance = new WebhookHealthCheck(featureLoader);
  const webhookHealthCheck: MaintenanceCheck = {
    id: 'webhook-health',
    name: 'Webhook CI Health',
    tier: 'full',
    async run(context: MaintenanceCheckContext): Promise<MaintenanceCheckResult> {
      const t0 = Date.now();
      let totalWarnings = 0;

      for (const projectPath of context.projectPaths) {
        try {
          const issues = await webhookHealthCheckInstance.run(projectPath);
          totalWarnings += issues.length;

          for (const issue of issues) {
            logger.warn(`[webhook-health] ${issue.message} (project: ${projectPath})`);
          }
        } catch (err) {
          logger.error(`Webhook health check failed for ${projectPath}:`, err);
        }
      }

      return {
        checkId: 'webhook-health',
        passed: totalWarnings === 0,
        summary:
          totalWarnings === 0
            ? `Webhook health: all PRs in review have received CI events`
            : `Webhook health: ${totalWarnings} PR(s) in review with no CI events — webhook may be misconfigured`,
        details: { totalWarnings, projectCount: context.projectPaths.length },
        durationMs: Date.now() - t0,
      };
    },
  };

  maintenanceOrchestrator.register(boardHealthCheck);
  maintenanceOrchestrator.register(resourceUsageCheck);
  maintenanceOrchestrator.register(webhookHealthCheck);

  // Wire TopicBus for hierarchical event routing of sweep results
  if (container.topicBus) {
    maintenanceOrchestrator.setTopicBus(container.topicBus);
  }

  maintenanceOrchestrator.start(schedulerService, events, eventHistoryService, () => {
    const paths = new Set<string>();
    for (const p of autoModeService.getActiveAutoLoopProjects()) {
      paths.add(p);
    }
    return Array.from(paths);
  });

  logger.info(
    'MaintenanceOrchestrator started with board-health, resource-usage, and webhook-health checks'
  );
}
