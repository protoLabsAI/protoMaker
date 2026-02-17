/**
 * Board Janitor Crew Member - Board consistency checks
 *
 * Lightweight check (every 10 min):
 *   - Features in review with merged PRs → should be done
 *   - Features in in_progress with no running agent for >4h → orphaned
 *   - Dependency chain: features with deps on done features but deps not cleared
 *   - Features in in_progress with unsatisfied deps
 *
 * Escalates when: any findings at warning level
 * Emits escalation signals through EscalationRouter for anomaly tracking
 */

import type {
  CrewMemberDefinition,
  CrewCheckContext,
  CrewCheckResult,
} from '../crew-loop-service.js';
import { EscalationSource, EscalationSeverity } from '@automaker/types';

const ORPHANED_IN_PROGRESS_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

export const boardJanitorCrewMember: CrewMemberDefinition = {
  id: 'board-janitor',
  displayName: 'Board Janitor',
  templateName: 'board-janitor',
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

    // Get running agents once for cross-referencing
    let runningAgentFeatureIds: Set<string>;
    try {
      const runningAgents = await ctx.autoModeService.getRunningAgents();
      runningAgentFeatureIds = new Set(runningAgents.map((a) => a.featureId));
      metrics.runningAgents = runningAgents.length;
    } catch {
      runningAgentFeatureIds = new Set();
    }

    try {
      for (const projectPath of ctx.projectPaths) {
        if (ctx.managedProjectPaths?.has(projectPath)) continue;

        const allFeatures = await ctx.featureLoader.getAll(projectPath);

        // 1. Features in review with merged PR → should be done
        const reviewFeatures = allFeatures.filter((f) => f.status === 'review');
        for (const feature of reviewFeatures) {
          if (feature.prMergedAt) {
            findings.push({
              type: 'merged-not-done',
              message: `Feature "${feature.title}" has merged PR but is still in review`,
              severity: 'warning',
              context: {
                featureId: feature.id,
                prNumber: feature.prNumber,
                projectPath,
              },
            });
            raise('warning');
          }
        }

        // 2. Features in in_progress with no running agent for >4h
        const inProgressFeatures = allFeatures.filter((f) => f.status === 'in_progress');
        for (const feature of inProgressFeatures) {
          if (!runningAgentFeatureIds.has(feature.id)) {
            const startedAt = feature.startedAt;
            if (startedAt) {
              const inProgressAge = Date.now() - new Date(startedAt).getTime();
              if (inProgressAge > ORPHANED_IN_PROGRESS_THRESHOLD_MS) {
                const hoursInProgress = Math.round(inProgressAge / (60 * 60 * 1000));
                findings.push({
                  type: 'orphaned-in-progress',
                  message: `Feature "${feature.title}" in-progress for ${hoursInProgress}h with no running agent`,
                  severity: 'warning',
                  context: {
                    featureId: feature.id,
                    hoursInProgress,
                    projectPath,
                  },
                });
                raise('warning');

                // Emit escalation signal for orphaned in-progress anomaly
                ctx.events.emit('escalation:signal-received', {
                  source: EscalationSource.board_anomaly,
                  severity: EscalationSeverity.medium,
                  type: 'orphaned_in_progress',
                  context: {
                    featureId: feature.id,
                    featureTitle: feature.title,
                    hoursInProgress,
                    projectPath,
                    startedAt,
                  },
                  deduplicationKey: `orphaned_in_progress_${feature.id}`,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          }
        }

        // 3. Dependency chain: features depending on done features with deps not cleared
        for (const feature of allFeatures) {
          if (feature.dependencies && feature.dependencies.length > 0) {
            const doneDeps = feature.dependencies.filter((depId) => {
              const dep = allFeatures.find((f) => f.id === depId);
              return dep && dep.status === 'done';
            });
            if (
              doneDeps.length > 0 &&
              doneDeps.length === feature.dependencies.length &&
              feature.status === 'blocked'
            ) {
              findings.push({
                type: 'stale-deps',
                message: `Feature "${feature.title}" is blocked but all dependencies are done`,
                severity: 'warning',
                context: {
                  featureId: feature.id,
                  dependencies: feature.dependencies,
                  projectPath,
                },
              });
              raise('warning');

              // Emit escalation signal for broken dependency chain
              ctx.events.emit('escalation:signal-received', {
                source: EscalationSource.board_anomaly,
                severity: EscalationSeverity.medium,
                type: 'stale_dependencies',
                context: {
                  featureId: feature.id,
                  featureTitle: feature.title,
                  dependencies: feature.dependencies,
                  doneDependencies: doneDeps,
                  projectPath,
                },
                deduplicationKey: `stale_deps_${feature.id}`,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }

        // 4. Failed features (failureCount >= 2) — repeated failures need escalation
        const failedOrBlockedFeatures = allFeatures.filter(
          (f) => (f.status === 'blocked' || f.status === 'backlog') && (f.failureCount || 0) >= 2
        );
        for (const feature of failedOrBlockedFeatures) {
          findings.push({
            type: 'repeated-failure',
            message: `Feature "${feature.title}" has failed ${feature.failureCount} times`,
            severity: 'warning',
            context: {
              featureId: feature.id,
              failureCount: feature.failureCount,
              error: feature.error,
              projectPath,
            },
          });
          raise('warning');

          ctx.events.emit('escalation:signal-received', {
            source: EscalationSource.board_anomaly,
            severity: EscalationSeverity.high,
            type: 'repeated_feature_failure',
            context: {
              featureId: feature.id,
              featureTitle: feature.title,
              failureCount: feature.failureCount,
              error: feature.error,
              projectPath,
            },
            deduplicationKey: `repeated_failure_${feature.id}`,
            timestamp: new Date().toISOString(),
          });
        }

        // 5. Circular dependency deadlock detection (DFS)
        {
          const featureMap = new Map(allFeatures.map((f) => [f.id, f]));
          const visited = new Set<string>();
          const inStack = new Set<string>();

          const hasCycle = (featureId: string): boolean => {
            if (inStack.has(featureId)) return true;
            if (visited.has(featureId)) return false;

            visited.add(featureId);
            inStack.add(featureId);

            const feature = featureMap.get(featureId);
            if (feature?.dependencies) {
              for (const depId of feature.dependencies) {
                const dep = featureMap.get(depId);
                if (dep && dep.status !== 'done' && dep.status !== 'verified') {
                  if (hasCycle(depId)) return true;
                }
              }
            }

            inStack.delete(featureId);
            return false;
          };

          for (const feature of allFeatures) {
            if (
              feature.dependencies?.length &&
              feature.status !== 'done' &&
              feature.status !== 'verified' &&
              !visited.has(feature.id)
            ) {
              if (hasCycle(feature.id)) {
                findings.push({
                  type: 'dependency-deadlock',
                  message: `Feature "${feature.title}" is involved in a circular dependency`,
                  severity: 'critical',
                  context: {
                    featureId: feature.id,
                    dependencies: feature.dependencies,
                    projectPath,
                  },
                });
                raise('critical');

                ctx.events.emit('escalation:signal-received', {
                  source: EscalationSource.board_anomaly,
                  severity: EscalationSeverity.critical,
                  type: 'dependency_deadlock',
                  context: {
                    featureId: feature.id,
                    featureTitle: feature.title,
                    dependencies: feature.dependencies,
                    projectPath,
                  },
                  deduplicationKey: `deadlock_${feature.id}`,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          }
        }

        // 6. Features in in_progress with unsatisfied dependencies
        for (const feature of inProgressFeatures) {
          if (feature.dependencies && feature.dependencies.length > 0) {
            const unsatisfiedDeps = feature.dependencies.filter((depId) => {
              const dep = allFeatures.find((f) => f.id === depId);
              return dep && dep.status !== 'done' && dep.status !== 'verified';
            });
            if (unsatisfiedDeps.length > 0) {
              findings.push({
                type: 'unsatisfied-deps',
                message: `Feature "${feature.title}" is in-progress but has ${unsatisfiedDeps.length} unsatisfied dependencies`,
                severity: 'warning',
                context: {
                  featureId: feature.id,
                  unsatisfiedDeps,
                  projectPath,
                },
              });
              raise('warning');

              // Emit escalation signal for broken dependency chain (in-progress with unmet deps)
              ctx.events.emit('escalation:signal-received', {
                source: EscalationSource.board_anomaly,
                severity: EscalationSeverity.high,
                type: 'unsatisfied_dependencies',
                context: {
                  featureId: feature.id,
                  featureTitle: feature.title,
                  dependencies: feature.dependencies,
                  unsatisfiedDependencies: unsatisfiedDeps,
                  projectPath,
                },
                deduplicationKey: `unsatisfied_deps_${feature.id}`,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }

        metrics.totalFeatures = ((metrics.totalFeatures as number) || 0) + allFeatures.length;
        metrics.reviewFeatures = ((metrics.reviewFeatures as number) || 0) + reviewFeatures.length;
        metrics.inProgressFeatures =
          ((metrics.inProgressFeatures as number) || 0) + inProgressFeatures.length;
      }
    } catch (error) {
      findings.push({
        type: 'check-error',
        message: `Failed to check board consistency: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'info',
      });
    }

    const RANK_TO_SEVERITY: Severity[] = ['ok', 'info', 'warning', 'critical'];
    const maxSeverity = RANK_TO_SEVERITY[maxRank] ?? 'ok';
    const needsEscalation = maxRank >= SEVERITY_RANK.warning;

    const summary =
      findings.length === 0
        ? 'Board consistent'
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

    return `Board consistency crew loop check detected issues requiring attention.

**Severity:** ${result.severity}
**Summary:** ${result.summary}

**Findings:**
${findingsList}

**Metrics:** ${JSON.stringify(result.metrics, null, 2)}

Please:
1. For merged-not-done: move feature to done via \`move_feature\`
2. For orphaned-in-progress: reset feature to backlog via \`update_feature\`
3. For stale-deps: unblock feature by moving to backlog via \`update_feature\`
4. For unsatisfied-deps: stop any agent if running, reset to backlog, fix deps with \`set_feature_dependencies\`
5. For repeated-failure: investigate error, consider increasing complexity or filing a bug
6. For dependency-deadlock: break the cycle by removing one dependency via \`set_feature_dependencies\`
7. Post a summary to Discord #dev if more than 2 fixes were made

This is an automated triage request triggered by the crew loop system.`;
  },

  escalationTools: [
    'Read',
    'Glob',
    'Grep',
    'mcp__plugin_automaker_automaker__list_features',
    'mcp__plugin_automaker_automaker__get_feature',
    'mcp__plugin_automaker_automaker__update_feature',
    'mcp__plugin_automaker_automaker__move_feature',
    'mcp__plugin_automaker_automaker__set_feature_dependencies',
    'mcp__plugin_automaker_automaker__get_dependency_graph',
    'mcp__plugin_automaker_discord__discord_send',
  ],
};
