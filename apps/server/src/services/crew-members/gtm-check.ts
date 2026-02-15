/**
 * GTM Crew Member - Content pipeline monitoring (placeholder)
 *
 * Lightweight check (every 6h, disabled by default):
 *   - Recently completed features without announcements
 *
 * Escalates when: content pipeline items need attention
 */

import type {
  CrewMemberDefinition,
  CrewCheckContext,
  CrewCheckResult,
} from '../crew-loop-service.js';

export const gtmCrewMember: CrewMemberDefinition = {
  id: 'gtm',
  displayName: 'GTM Specialist',
  templateName: 'jon',
  defaultSchedule: '0 */6 * * *',
  enabledByDefault: false,

  async check(ctx: CrewCheckContext): Promise<CrewCheckResult> {
    const findings: CrewCheckResult['findings'] = [];
    const metrics: Record<string, unknown> = {};

    // Placeholder: check for recently completed features that might need announcements
    try {
      let doneCount = 0;
      for (const projectPath of ctx.projectPaths) {
        const allFeatures = await ctx.featureLoader.getAll(projectPath);
        const recentlyDone = allFeatures.filter((f) => {
          if (f.status !== 'done' || !f.completedAt) return false;
          const completedAge = Date.now() - new Date(f.completedAt).getTime();
          // Completed in last 24 hours
          return completedAge < 24 * 60 * 60 * 1000;
        });
        doneCount += recentlyDone.length;
      }

      metrics.recentCompletions = doneCount;

      if (doneCount > 0) {
        findings.push({
          type: 'content-pipeline',
          message: `${doneCount} feature(s) completed in last 24h — may need announcements`,
          severity: 'info',
          context: { count: doneCount },
        });
      }
    } catch {
      // Placeholder — non-critical
    }

    return {
      needsEscalation: false, // GTM never auto-escalates for now
      summary:
        findings.length === 0
          ? 'No content pipeline items'
          : `${findings.length} item(s) for review`,
      severity: findings.length > 0 ? 'info' : 'ok',
      findings,
      metrics,
    };
  },

  buildEscalationPrompt(result: CrewCheckResult): string {
    const findingsList = result.findings
      .map((f) => `- [${f.severity.toUpperCase()}] ${f.type}: ${f.message}`)
      .join('\n');

    return `Content pipeline check detected items needing attention.

**Findings:**
${findingsList}

**Metrics:** ${JSON.stringify(result.metrics, null, 2)}

Please review recently completed features and determine if any need:
1. Release notes or changelog entries
2. Discord announcements
3. Documentation updates`;
  },

  escalationTools: [
    'Read',
    'Glob',
    'Grep',
    'mcp__plugin_automaker_automaker__list_features',
    'mcp__plugin_automaker_automaker__get_feature',
    'mcp__plugin_automaker_discord__discord_send',
  ],
};
