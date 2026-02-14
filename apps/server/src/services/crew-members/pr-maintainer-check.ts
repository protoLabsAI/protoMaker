/**
 * PR Maintainer Crew Member - PR pipeline health checks
 *
 * Lightweight check (every 10 min):
 *   - Features in review with PRs: check age, auto-merge status
 *   - Features with worktrees but no PR (orphaned post-flight)
 *   - Stale review features (>30min with PR but no auto-merge)
 *   - Unresolved critical-severity threads
 *
 * Escalates when: any findings at warning level
 */

import type {
  CrewMemberDefinition,
  CrewCheckContext,
  CrewCheckResult,
} from '../crew-loop-service.js';
import { EscalationSource, EscalationSeverity } from '@automaker/types';

const STALE_REVIEW_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const STALE_PR_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check for unresolved critical-severity threads in a PR
 */
async function checkCriticalThreads(projectPath: string, prNumber: number): Promise<number> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  try {
    // Extract owner/repo from git remote
    const { stdout: remoteOutput } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectPath,
      timeout: 15_000,
      encoding: 'utf-8',
    });

    const remoteUrl = remoteOutput.trim();
    const match =
      remoteUrl.match(/github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/) ||
      remoteUrl.match(/^([^/]+)\/([^/\s]+)$/);

    if (!match) {
      throw new Error(`Could not parse GitHub owner/repo from remote: ${remoteUrl}`);
    }

    const [, owner, repoName] = match;

    // GraphQL query to fetch unresolved review threads
    const query = `
      query {
        repository(owner: "${owner}", name: "${repoName}") {
          pullRequest(number: ${prNumber}) {
            reviewThreads(first: 100) {
              nodes {
                id
                isResolved
                comments(first: 10) {
                  nodes {
                    body
                    author {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const { stdout } = await execFileAsync(
      'gh',
      ['api', 'graphql', '-f', `query=${query.replace(/\n/g, ' ')}`],
      {
        cwd: projectPath,
        timeout: 30_000,
        encoding: 'utf-8',
      }
    );

    const data = JSON.parse(stdout);
    const threads = data?.data?.repository?.pullRequest?.reviewThreads?.nodes || [];

    // Count unresolved threads with critical markers
    let criticalCount = 0;
    for (const thread of threads) {
      if (!thread.isResolved && thread.comments?.nodes?.length > 0) {
        // Check if any comment contains critical severity markers
        const hasCreiticalMarker = thread.comments.nodes.some((comment: { body?: string }) => {
          const body = comment.body?.toLowerCase() || '';
          return (
            body.includes('🔴') ||
            body.includes('critical') ||
            body.includes('severity: critical') ||
            body.includes('**critical**')
          );
        });
        if (hasCreiticalMarker) {
          criticalCount++;
        }
      }
    }

    return criticalCount;
  } catch (error) {
    throw new Error(
      `Failed to check critical threads: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

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

        // Check for unresolved critical-severity threads in PRs
        let totalCriticalThreads = 0;
        for (const feature of reviewFeatures) {
          if (feature.prNumber) {
            try {
              const criticalThreadCount = await checkCriticalThreads(projectPath, feature.prNumber);
              if (criticalThreadCount > 0) {
                totalCriticalThreads += criticalThreadCount;
                findings.push({
                  type: 'critical-threads',
                  message: `PR #${feature.prNumber} for "${feature.title}" has ${criticalThreadCount} unresolved critical-severity thread(s)`,
                  severity: 'critical',
                  context: {
                    featureId: feature.id,
                    prNumber: feature.prNumber,
                    criticalThreadCount,
                    projectPath,
                  },
                });
                raise('critical');
              }
            } catch (error) {
              // Log error but don't fail the entire check
              findings.push({
                type: 'thread-check-error',
                message: `Failed to check threads for PR #${feature.prNumber}: ${error instanceof Error ? error.message : String(error)}`,
                severity: 'info',
                context: {
                  featureId: feature.id,
                  prNumber: feature.prNumber,
                  projectPath,
                },
              });
            }
          }
        }
        metrics.criticalThreads = totalCriticalThreads;

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
    // Group findings by severity for better visibility
    const criticalFindings = result.findings.filter((f) => f.severity === 'critical');
    const warningFindings = result.findings.filter((f) => f.severity === 'warning');
    const infoFindings = result.findings.filter((f) => f.severity === 'info');

    const formatFindings = (findings: typeof result.findings) =>
      findings.map((f) => `- [${f.severity.toUpperCase()}] ${f.type}: ${f.message}`).join('\n');

    const sections = [];

    if (criticalFindings.length > 0) {
      sections.push(
        `**Critical Issues (${criticalFindings.length}):**\n${formatFindings(criticalFindings)}`
      );
    }
    if (warningFindings.length > 0) {
      sections.push(
        `**Warnings (${warningFindings.length}):**\n${formatFindings(warningFindings)}`
      );
    }
    if (infoFindings.length > 0) {
      sections.push(`**Info (${infoFindings.length}):**\n${formatFindings(infoFindings)}`);
    }

    const findingsSection = sections.join('\n\n');

    return `PR pipeline crew loop check detected issues requiring attention.

**Severity:** ${result.severity}
**Summary:** ${result.summary}

**Findings:**
${findingsSection}

**Metrics:** ${JSON.stringify(result.metrics, null, 2)}

Please:
1. For critical-threads: use \`resolve_review_threads\` to address unresolved critical-severity feedback
2. For stale PRs: check PR status with \`check_pr_status\`, resolve threads with \`resolve_review_threads\`, enable auto-merge
3. For orphaned worktrees: check for uncommitted work, create PR with \`create_pr_from_worktree\` if needed
4. For format failures: fix from inside the worktree (\`cd <worktree> && npx prettier --write $(git diff --name-only --diff-filter=ACMR)\`)
5. For branches behind main: rebase and force-push

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
