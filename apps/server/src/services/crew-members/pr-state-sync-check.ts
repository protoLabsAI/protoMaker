/**
 * PR State Sync Crew Member - GitHub to Linear status bridge
 *
 * Lightweight check (every 5 min):
 *   - Runs GitHubStateChecker for all registered projects
 *   - Emits events for detected state changes
 *   - No direct escalation (relies on event system for bridge integration)
 *
 * Escalates when: never (event-driven architecture handles state sync)
 */

import type {
  CrewMemberDefinition,
  CrewCheckContext,
  CrewCheckResult,
} from '../crew-loop-service.js';
import { GitHubStateChecker } from '../github-state-checker.js';
import type { Drift } from '../reconciliation-service.js';

/**
 * Map drift severity to crew check severity
 */
function mapDriftSeverity(
  driftSeverity: 'low' | 'medium' | 'high' | 'critical'
): 'ok' | 'info' | 'warning' | 'critical' {
  switch (driftSeverity) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'warning';
    case 'medium':
      return 'info';
    case 'low':
      return 'info';
    default:
      return 'ok';
  }
}

/**
 * Format drift message for findings
 */
function formatDriftMessage(drift: Drift): string {
  switch (drift.type) {
    case 'pr-merged-status-stale':
      return `PR #${drift.prNumber} merged at ${drift.details.mergedAt}, but feature ${drift.featureId} still in review`;
    case 'pr-ci-failure': {
      const failedChecks = (drift.details.failedChecks || []) as Array<{ name: string }>;
      return `PR #${drift.prNumber} has CI failures: ${failedChecks.map((c) => c.name).join(', ')}`;
    }
    case 'pr-has-feedback':
      return `PR #${drift.prNumber} has changes requested`;
    case 'pr-approved-not-merged':
      return `PR #${drift.prNumber} approved but not merged`;
    case 'pr-stale':
      return `PR #${drift.prNumber} stale (${drift.details.daysSinceUpdate} days since update)`;
    default:
      return `Unknown drift type: ${drift.type}`;
  }
}

/**
 * Group drifts by type for metrics
 */
function groupDriftsByType(drifts: Drift[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const drift of drifts) {
    groups[drift.type] = (groups[drift.type] || 0) + 1;
  }
  return groups;
}

/**
 * Group drifts by severity for metrics
 */
function groupDriftsBySeverity(drifts: Drift[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const drift of drifts) {
    groups[drift.severity] = (groups[drift.severity] || 0) + 1;
  }
  return groups;
}

export const prStateSyncCrewMember: CrewMemberDefinition = {
  id: 'pr-state-sync',
  displayName: 'PR State Sync',
  templateName: 'pr-state-sync',
  defaultSchedule: '*/5 * * * *', // Every 5 minutes
  enabledByDefault: true,

  async check(ctx: CrewCheckContext): Promise<CrewCheckResult> {
    type Severity = CrewCheckResult['severity'];
    const findings: CrewCheckResult['findings'] = [];
    const metrics: Record<string, unknown> = {};

    try {
      // Initialize GitHubStateChecker with feature loader
      const githubStateChecker = new GitHubStateChecker(ctx.featureLoader);

      // Register all projects
      for (const projectPath of ctx.projectPaths) {
        githubStateChecker.registerProject(projectPath);
      }

      // Check all projects for GitHub state drifts
      const drifts: Drift[] = await githubStateChecker.checkAllProjects();

      // Convert drifts to findings and emit events
      for (const drift of drifts) {
        const severity: Severity = mapDriftSeverity(drift.severity);

        findings.push({
          type: drift.type,
          message: formatDriftMessage(drift),
          severity,
          context: {
            projectPath: drift.projectPath,
            featureId: drift.featureId,
            prNumber: drift.prNumber,
            details: drift.details,
          },
        });

        // Emit event for the bridge to handle
        ctx.events.emit('github-state-drift', {
          timestamp: new Date().toISOString(),
          drift,
        });
      }

      // Track metrics
      metrics.totalDrifts = drifts.length;
      metrics.driftsByType = groupDriftsByType(drifts);
      metrics.driftsBySeverity = groupDriftsBySeverity(drifts);
    } catch (error) {
      findings.push({
        type: 'check-error',
        message: `Failed to check GitHub state: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'info',
      });
    }

    const summary =
      findings.length === 0
        ? 'GitHub state in sync'
        : `${findings.length} drift(s) detected and emitted`;

    // Never escalate - this crew member is event-driven only
    return {
      needsEscalation: false,
      summary,
      severity: 'ok',
      findings,
      metrics,
    };
  },

  buildEscalationPrompt(_result: CrewCheckResult): string {
    // This crew member never escalates
    return '';
  },

  escalationTools: [],
};
