/**
 * Ava Crew Member - Strategic oversight, stuck agents, blocked features, auto-mode health
 *
 * Lightweight check (every 10 min):
 *   - Stuck agents (running > 2h) — Ava decides escalation strategy
 *   - Blocked feature count — Ava decides unblocking approach
 *   - Auto-mode health — features in backlog but auto-mode not running
 *   - Capacity utilization — agents at max but high-priority backlog items exist
 *
 * PR pipeline monitoring → delegated to PR Maintainer crew member
 * Board consistency → delegated to Board Janitor crew member
 *
 * Escalates when: warnings found (stuck agents, many blocked features, auto-mode issues)
 */

import type {
  CrewMemberDefinition,
  CrewCheckContext,
  CrewCheckResult,
} from '../crew-loop-service.js';

const STUCK_AGENT_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export const avaCrewMember: CrewMemberDefinition = {
  id: 'ava',
  displayName: 'Ava (Chief of Staff)',
  templateName: 'ava',
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

    // 1. Check for stuck agents (running > 2h)
    let runningAgentCount = 0;
    try {
      const runningAgents = await ctx.autoModeService.getRunningAgents();
      runningAgentCount = runningAgents.length;
      const now = Date.now();
      let stuckCount = 0;

      for (const agent of runningAgents) {
        const runningMs = now - agent.startTime;
        if (runningMs > STUCK_AGENT_THRESHOLD_MS) {
          stuckCount++;
          const runningMin = Math.round(runningMs / 60_000);
          findings.push({
            type: 'stuck-agent',
            message: `Agent for feature ${agent.featureId} has been running for ${runningMin} minutes`,
            severity: 'warning',
            context: { featureId: agent.featureId, runningMs, projectPath: agent.projectPath },
          });
        }
      }

      metrics.runningAgents = runningAgentCount;
      metrics.stuckAgents = stuckCount;
      if (stuckCount > 0) raise('warning');
    } catch (error) {
      findings.push({
        type: 'check-error',
        message: `Failed to check running agents: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'info',
      });
    }

    // 2. Count blocked features
    try {
      for (const projectPath of ctx.projectPaths) {
        const allFeatures = await ctx.featureLoader.getAll(projectPath);
        const blockedFeatures = allFeatures.filter((f) => f.status === 'blocked');
        if (blockedFeatures.length >= 3) {
          findings.push({
            type: 'many-blocked',
            message: `${blockedFeatures.length} features are blocked in ${projectPath}`,
            severity: 'warning',
            context: { count: blockedFeatures.length, projectPath },
          });
          raise('warning');
        }

        // 3. Auto-mode health: features in backlog but no agents running
        const backlogFeatures = allFeatures.filter((f) => f.status === 'backlog');
        const isAutoModeRunning = ctx.autoModeService.getActiveAutoLoopProjects().length > 0;
        if (backlogFeatures.length > 0 && !isAutoModeRunning && runningAgentCount === 0) {
          findings.push({
            type: 'auto-mode-idle',
            message: `${backlogFeatures.length} features in backlog but auto-mode is not running`,
            severity: 'warning',
            context: { backlogCount: backlogFeatures.length, projectPath },
          });
          raise('warning');
        }

        // 4. Capacity utilization: agents at max but high-priority backlog items
        const globalSettings = await ctx.settingsService.getGlobalSettings();
        const maxConcurrency = globalSettings.maxConcurrency || 6;
        if (runningAgentCount >= maxConcurrency && backlogFeatures.length > 0) {
          findings.push({
            type: 'capacity-saturated',
            message: `Agent capacity full (${runningAgentCount}/${maxConcurrency}) with ${backlogFeatures.length} features waiting`,
            severity: 'info',
            context: {
              running: runningAgentCount,
              max: maxConcurrency,
              waiting: backlogFeatures.length,
              projectPath,
            },
          });
          raise('info');
        }

        metrics.blockedFeatures =
          ((metrics.blockedFeatures as number) || 0) + blockedFeatures.length;
        metrics.backlogFeatures =
          ((metrics.backlogFeatures as number) || 0) + backlogFeatures.length;
      }
    } catch (error) {
      findings.push({
        type: 'check-error',
        message: `Failed to check features: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'info',
      });
    }

    const RANK_TO_SEVERITY: Severity[] = ['ok', 'info', 'warning', 'critical'];
    const maxSeverity = RANK_TO_SEVERITY[maxRank] ?? 'ok';
    const needsEscalation = maxRank >= SEVERITY_RANK.warning;

    const summary =
      findings.length === 0
        ? 'All systems nominal'
        : `${findings.length} finding(s): ${findings.filter((f) => f.severity === 'warning' || f.severity === 'critical').length} actionable`;

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

    return `Automated crew loop check detected issues requiring Ava's strategic attention.

**Severity:** ${result.severity}
**Summary:** ${result.summary}

**Findings:**
${findingsList}

**Metrics:** ${JSON.stringify(result.metrics, null, 2)}

**Delegation guidance:**
- PR pipeline issues (stale PRs, format failures, CodeRabbit threads) → Delegate to PR Maintainer via \`execute_dynamic_agent\` with template \`pr-maintainer\`
- Board consistency issues (merged-not-done, orphaned in-progress, stale deps) → Delegate to Board Janitor via \`execute_dynamic_agent\` with template \`board-janitor\`
- Infrastructure issues (memory, health) → Delegate to Frank via \`execute_dynamic_agent\` with template \`frank\`

**Direct action items (Ava only):**
1. For stuck agents: decide whether to stop, send context, or let continue
2. For blocked features: identify root cause and unblocking strategy
3. For auto-mode idle: start auto-mode if appropriate
4. Post a summary of actions to Discord #dev`;
  },

  escalationTools: [
    'Read',
    'Glob',
    'Grep',
    'Bash',
    'mcp__plugin_automaker_automaker__list_features',
    'mcp__plugin_automaker_automaker__get_feature',
    'mcp__plugin_automaker_automaker__update_feature',
    'mcp__plugin_automaker_automaker__list_running_agents',
    'mcp__plugin_automaker_automaker__stop_agent',
    'mcp__plugin_automaker_automaker__send_message_to_agent',
    'mcp__plugin_automaker_automaker__start_auto_mode',
    'mcp__plugin_automaker_automaker__get_auto_mode_status',
    'mcp__plugin_automaker_automaker__get_board_summary',
    'mcp__plugin_automaker_automaker__execute_dynamic_agent',
    'mcp__plugin_automaker_discord__discord_send',
  ],
};
