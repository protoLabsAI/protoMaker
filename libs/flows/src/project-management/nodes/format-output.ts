/**
 * Format Output Node
 *
 * Converts the structured StatusReport into formatted markdown
 * suitable for posting to Linear project updates or Discord.
 */

import type { ProjectStatusState, HealthStatus } from '../types.js';

const HEALTH_EMOJI: Record<HealthStatus, string> = {
  'on-track': '🟢',
  'at-risk': '🟡',
  behind: '🔴',
};

const SEVERITY_EMOJI: Record<string, string> = {
  low: '🔵',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
};

/**
 * Format output node — converts StatusReport to markdown
 */
export async function formatOutput(
  state: ProjectStatusState
): Promise<Partial<ProjectStatusState>> {
  if (state.error || !state.statusReport) {
    return {
      formattedReport: state.error
        ? `## Status Report Failed\n\n${state.error}`
        : '## Status Report\n\nNo data available.',
    };
  }

  const report = state.statusReport;
  const emoji = HEALTH_EMOJI[report.health];
  const parts: string[] = [];

  // Header
  parts.push(`## ${emoji} Project Status Report`);
  parts.push('');
  parts.push(`*Generated: ${new Date(report.generatedAt).toLocaleString()}*`);
  if (report.projectSlug) {
    parts.push(`*Project: ${report.projectSlug}*`);
  }
  parts.push('');

  // Summary
  parts.push(`### Summary`);
  parts.push('');
  parts.push(report.summary);
  parts.push('');

  // Board Metrics
  parts.push('### Board Status');
  parts.push('');
  parts.push('| Status | Count |');
  parts.push('|--------|-------|');
  for (const [status, count] of Object.entries(report.metrics.board.byStatus)) {
    parts.push(`| ${status} | ${count} |`);
  }
  parts.push(`| **Total** | **${report.metrics.board.totalFeatures}** |`);
  parts.push('');

  // PR Metrics
  if (report.metrics.prs.openPRs > 0 || report.metrics.prs.mergedToday > 0) {
    parts.push('### Pull Requests');
    parts.push('');
    parts.push(`- Open: ${report.metrics.prs.openPRs}`);
    parts.push(`- Merged today: ${report.metrics.prs.mergedToday}`);
    if (report.metrics.prs.conflicting > 0) {
      parts.push(`- Conflicting: ${report.metrics.prs.conflicting}`);
    }
    if (report.metrics.prs.pendingReview > 0) {
      parts.push(`- Pending review: ${report.metrics.prs.pendingReview}`);
    }
    parts.push('');
  }

  // Agent Metrics
  if (report.metrics.agents.runningAgents > 0 || report.metrics.agents.totalCostUsd > 0) {
    parts.push('### Agents');
    parts.push('');
    parts.push(`- Running: ${report.metrics.agents.runningAgents}`);
    parts.push(`- Total cost: $${report.metrics.agents.totalCostUsd.toFixed(2)}`);
    if (report.metrics.agents.failureRate > 0) {
      parts.push(`- Failure rate: ${(report.metrics.agents.failureRate * 100).toFixed(0)}%`);
    }
    parts.push('');
  }

  // Risks
  if (report.risks.length > 0) {
    parts.push('### Risks');
    parts.push('');
    for (const risk of report.risks) {
      const emoji = SEVERITY_EMOJI[risk.severity] ?? '⚪';
      parts.push(
        `${emoji} **${risk.severity.toUpperCase()}** [${risk.category}]: ${risk.description}`
      );
      if (risk.mitigation) {
        parts.push(`  - *Mitigation:* ${risk.mitigation}`);
      }
    }
    parts.push('');
  }

  // Milestones
  if (report.milestones.length > 0) {
    parts.push('### Milestones');
    parts.push('');
    for (const milestone of report.milestones) {
      const bar =
        '█'.repeat(Math.floor(milestone.completionPercentage / 10)) +
        '░'.repeat(10 - Math.floor(milestone.completionPercentage / 10));
      parts.push(`**${milestone.name}** [${bar}] ${milestone.completionPercentage}%`);
      if (milestone.blockers.length > 0) {
        parts.push(`  - Blockers: ${milestone.blockers.join(', ')}`);
      }
    }
    parts.push('');
  }

  // Recommendations
  parts.push('### Recommendations');
  parts.push('');
  for (let i = 0; i < report.recommendations.length; i++) {
    parts.push(`${i + 1}. ${report.recommendations[i]}`);
  }
  parts.push('');

  // Analysis highlights
  if (report.analysis.highlights.length > 0) {
    parts.push('### Highlights');
    parts.push('');
    for (const highlight of report.analysis.highlights) {
      parts.push(`- ${highlight}`);
    }
    parts.push('');
  }

  return {
    formattedReport: parts.join('\n'),
  };
}
