/**
 * PR Maintainer Crew Member - PR pipeline health checks
 *
 * Lightweight check (every 10 min):
 *   - Features in review with PRs: check age, auto-merge status
 *   - Features with worktrees but no PR (orphaned post-flight)
 *   - Stale review features (>30min with PR but no auto-merge)
 *
 * Escalates when: any findings at warning level
 */

import type {
  CrewMemberDefinition,
  CrewCheckContext,
  CrewCheckResult,
} from '../crew-loop-service.js';

const STALE_REVIEW_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const STALE_PR_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export const prMaintainerCrewMember: CrewMemberDefinition = {
  id: 'pr-maintainer',
  displayName: 'PR Maintainer',
  templateName: 'pr-maintainer',
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

    try {
      for (const projectPath of ctx.projectPaths) {
        const allFeatures = await ctx.featureLoader.getAll(projectPath);
        const reviewFeatures = allFeatures.filter((f) => f.status === 'review');

        // 1. Check for stale PRs in review (>24h)
        for (const feature of reviewFeatures) {
          const reviewTimestamp = feature.reviewStartedAt ?? feature.completedAt;
          if (reviewTimestamp) {
            const reviewAge = Date.now() - new Date(reviewTimestamp).getTime();
            if (reviewAge > STALE_PR_THRESHOLD_MS) {
              const hoursInReview = Math.round(reviewAge / (60 * 60 * 1000));
              findings.push({
                type: 'stale-pr',
                message: `PR for "${feature.title}" has been in review for ${hoursInReview}h`,
                severity: 'warning',
                context: {
                  featureId: feature.id,
                  prNumber: feature.prNumber,
                  hoursInReview,
                  projectPath,
                },
              });
              raise('warning');
            }
          }
        }

        // 2. Check for review features without auto-merge (>30min)
        for (const feature of reviewFeatures) {
          if (feature.prNumber) {
            const reviewTimestamp = feature.reviewStartedAt ?? feature.completedAt;
            if (reviewTimestamp) {
              const reviewAge = Date.now() - new Date(reviewTimestamp).getTime();
              if (reviewAge > STALE_REVIEW_THRESHOLD_MS) {
                findings.push({
                  type: 'review-needs-attention',
                  message: `Feature "${feature.title}" (PR #${feature.prNumber}) in review for ${Math.round(reviewAge / 60_000)}min — may need auto-merge or thread resolution`,
                  severity: 'info',
                  context: {
                    featureId: feature.id,
                    prNumber: feature.prNumber,
                    reviewAgeMin: Math.round(reviewAge / 60_000),
                    projectPath,
                  },
                });
                raise('info');
              }
            }
          }
        }

        // 3. Check for features with worktrees but no PR (orphaned post-flight)
        const inProgressOrReview = allFeatures.filter(
          (f) => f.status === 'in_progress' || f.status === 'review'
        );
        for (const feature of inProgressOrReview) {
          if (feature.branchName && !feature.prNumber && feature.status === 'review') {
            findings.push({
              type: 'orphaned-worktree',
              message: `Feature "${feature.title}" in review with branch "${feature.branchName}" but no PR number`,
              severity: 'warning',
              context: {
                featureId: feature.id,
                branchName: feature.branchName,
                projectPath,
              },
            });
            raise('warning');
          }
        }

        metrics.reviewFeatures = ((metrics.reviewFeatures as number) || 0) + reviewFeatures.length;
      }
    } catch (error) {
      findings.push({
        type: 'check-error',
        message: `Failed to check PR pipeline: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'info',
      });
    }

    const RANK_TO_SEVERITY: Severity[] = ['ok', 'info', 'warning', 'critical'];
    const maxSeverity = RANK_TO_SEVERITY[maxRank] ?? 'ok';
    const needsEscalation = maxRank >= SEVERITY_RANK.warning;

    const summary =
      findings.length === 0
        ? 'PR pipeline healthy'
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

    return `PR pipeline crew loop check detected issues requiring attention.

**Severity:** ${result.severity}
**Summary:** ${result.summary}

**Findings:**
${findingsList}

**Metrics:** ${JSON.stringify(result.metrics, null, 2)}

Please:
1. For stale PRs: check PR status with \`check_pr_status\`, resolve threads with \`resolve_review_threads\`, enable auto-merge
2. For orphaned worktrees: check for uncommitted work, create PR with \`create_pr_from_worktree\` if needed
3. For format failures: fix from inside the worktree (\`cd <worktree> && npx prettier --write $(git diff --name-only --diff-filter=ACMR)\`)
4. For branches behind main: rebase and force-push

This is an automated triage request triggered by the crew loop system.`;
  },

  escalationTools: [
    'Read',
    'Glob',
    'Grep',
    'Bash',
    'mcp__plugin_automaker_automaker__check_pr_status',
    'mcp__plugin_automaker_automaker__resolve_review_threads',
    'mcp__plugin_automaker_automaker__merge_pr',
    'mcp__plugin_automaker_automaker__create_pr_from_worktree',
    'mcp__plugin_automaker_automaker__list_worktrees',
    'mcp__plugin_automaker_automaker__get_worktree_status',
    'mcp__plugin_automaker_automaker__list_features',
    'mcp__plugin_automaker_automaker__get_feature',
    'mcp__plugin_automaker_automaker__update_feature',
    'mcp__plugin_automaker_discord__discord_send',
  ],
};
