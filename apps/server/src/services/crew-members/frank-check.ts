/**
 * Frank Crew Member - Server health, memory, capacity, health monitor data
 *
 * Lightweight check (every 10 min):
 *   - Run healthMonitorService.runHealthCheck() on-demand
 *   - Check memory pressure (V8 heap usage)
 *   - Check agent capacity utilization
 *
 * Escalates when: critical health issues (>95% memory, server degraded)
 */

import { createLogger } from '@automaker/utils';
import type {
  CrewMemberDefinition,
  CrewCheckContext,
  CrewCheckResult,
} from '../crew-loop-service.js';

const logger = createLogger('CrewMember:Frank');

const MEMORY_WARNING_PERCENT = 80;
const MEMORY_CRITICAL_PERCENT = 95;

export const frankCrewMember: CrewMemberDefinition = {
  id: 'frank',
  displayName: 'Frank (DevOps)',
  templateName: 'frank',
  defaultSchedule: '*/10 * * * *',
  enabledByDefault: true,

  async check(ctx: CrewCheckContext): Promise<CrewCheckResult> {
    type Severity = CrewCheckResult['severity'];
    const findings: CrewCheckResult['findings'] = [];
    const metrics: Record<string, unknown> = {};

    const SEVERITY_RANK: Record<Severity, number> = { ok: 0, info: 1, warning: 2, critical: 3 };
    let maxRank = 0;

    function raise(severity: Severity) {
      const rank = SEVERITY_RANK[severity];
      if (rank > maxRank) maxRank = rank;
    }

    // 1. Check V8 heap memory
    try {
      const v8 = await import('v8');
      const heapStats = v8.getHeapStatistics();
      const heapUsedMB = Math.round(heapStats.used_heap_size / 1024 / 1024);
      const heapLimitMB = Math.round(heapStats.heap_size_limit / 1024 / 1024);
      const heapPercent = Math.round((heapStats.used_heap_size / heapStats.heap_size_limit) * 100);

      metrics.heapUsedMB = heapUsedMB;
      metrics.heapLimitMB = heapLimitMB;
      metrics.heapPercent = heapPercent;

      if (heapPercent >= MEMORY_CRITICAL_PERCENT) {
        findings.push({
          type: 'memory-critical',
          message: `Heap usage critical: ${heapUsedMB}MB / ${heapLimitMB}MB (${heapPercent}%)`,
          severity: 'critical',
          context: { heapUsedMB, heapLimitMB, heapPercent },
        });
        raise('critical');
      } else if (heapPercent >= MEMORY_WARNING_PERCENT) {
        findings.push({
          type: 'memory-warning',
          message: `Heap usage elevated: ${heapUsedMB}MB / ${heapLimitMB}MB (${heapPercent}%)`,
          severity: 'warning',
          context: { heapUsedMB, heapLimitMB, heapPercent },
        });
        raise('warning');
      }
    } catch (error) {
      logger.warn('Failed to check heap stats:', error);
    }

    // 2. Check process memory (RSS)
    try {
      const memUsage = process.memoryUsage();
      const rssMB = Math.round(memUsage.rss / 1024 / 1024);
      metrics.rssMB = rssMB;
    } catch {
      // Non-critical
    }

    // 3. Check agent capacity
    try {
      const runningAgents = await ctx.autoModeService.getRunningAgents();
      metrics.runningAgents = runningAgents.length;

      // Get max concurrency from settings
      const globalSettings = await ctx.settingsService.getGlobalSettings();
      const maxConcurrency = globalSettings.maxConcurrency || 6;
      metrics.maxConcurrency = maxConcurrency;

      const utilizationPercent = Math.round((runningAgents.length / maxConcurrency) * 100);
      metrics.capacityUtilization = utilizationPercent;

      if (utilizationPercent >= 100) {
        findings.push({
          type: 'capacity-full',
          message: `Agent capacity at maximum: ${runningAgents.length}/${maxConcurrency} agents running`,
          severity: 'info',
          context: { running: runningAgents.length, max: maxConcurrency },
        });
        raise('info');
      }
    } catch (error) {
      findings.push({
        type: 'check-error',
        message: `Failed to check agent capacity: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'info',
      });
    }

    // 4. Run health monitor check (on-demand, no timer)
    try {
      const healthResult = await ctx.healthMonitorService.runHealthCheck();
      metrics.healthStatus = healthResult.status;

      if (healthResult.status === 'critical') {
        for (const issue of healthResult.issues) {
          findings.push({
            type: `health-${issue.type}`,
            message: issue.message,
            severity: issue.severity === 'critical' ? 'critical' : 'warning',
            context: { type: issue.type, severity: issue.severity },
          });
        }
        raise('critical');
      } else if (healthResult.status === 'degraded') {
        for (const issue of healthResult.issues) {
          findings.push({
            type: `health-${issue.type}`,
            message: issue.message,
            severity: 'warning',
            context: { type: issue.type, severity: issue.severity },
          });
        }
        raise('warning');
      }
    } catch (error) {
      findings.push({
        type: 'health-check-error',
        message: `Health monitor check failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'warning',
      });
      raise('warning');
    }

    // 5. Worktree health: count worktrees, find stale ones
    try {
      for (const projectPath of ctx.projectPaths) {
        const allFeatures = await ctx.featureLoader.getAll(projectPath);
        const featuresWithWorktrees = allFeatures.filter((f) => f.branchName);
        const activeFeatureIds = new Set(
          allFeatures
            .filter((f) => f.status === 'in_progress' || f.status === 'review')
            .map((f) => f.id)
        );

        // Count worktrees associated with features not in active states
        let staleWorktreeCount = 0;
        for (const feature of featuresWithWorktrees) {
          if (!activeFeatureIds.has(feature.id) && feature.status === 'done') {
            staleWorktreeCount++;
          }
        }

        metrics.featuresWithWorktrees =
          ((metrics.featuresWithWorktrees as number) || 0) + featuresWithWorktrees.length;
        metrics.staleWorktrees = ((metrics.staleWorktrees as number) || 0) + staleWorktreeCount;

        if (staleWorktreeCount >= 5) {
          findings.push({
            type: 'stale-worktrees',
            message: `${staleWorktreeCount} worktrees in ${projectPath} belong to done features — cleanup recommended`,
            severity: 'info',
            context: { staleWorktreeCount, projectPath },
          });
          raise('info');
        }
      }
    } catch (error) {
      logger.warn('Failed to check worktree health:', error);
    }

    const RANK_TO_SEVERITY: Severity[] = ['ok', 'info', 'warning', 'critical'];
    const maxSeverity = RANK_TO_SEVERITY[maxRank] ?? 'ok';
    const needsEscalation = maxRank >= SEVERITY_RANK.critical;

    const summary =
      findings.length === 0
        ? 'Server healthy'
        : `${findings.length} finding(s), status: ${maxSeverity}`;

    return {
      needsEscalation,
      summary,
      severity: maxSeverity,
      findings,
      metrics,
    };
  },

  buildEscalationPrompt(result: CrewCheckResult): string {
    const findingsList = result.findings
      .map((f) => `- [${f.severity.toUpperCase()}] ${f.type}: ${f.message}`)
      .join('\n');

    return `Server health is ${result.severity}. Automated crew loop check detected critical issues.

**Findings:**
${findingsList}

**Metrics:** ${JSON.stringify(result.metrics, null, 2)}

Please:
1. Read server logs with get_server_logs to diagnose the root cause
2. Check system health using get_detailed_health and health_check MCP tools
3. If memory is critical, identify the largest consumers
4. Post your findings and recommended actions to Discord #infra

This is an automated triage request triggered by the crew loop system.`;
  },

  escalationTools: [
    'Read',
    'Glob',
    'Grep',
    'Bash',
    'mcp__plugin_automaker_automaker__get_detailed_health',
    'mcp__plugin_automaker_automaker__health_check',
    'mcp__plugin_automaker_discord__discord_send',
  ],
};
