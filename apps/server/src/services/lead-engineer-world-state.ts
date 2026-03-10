/**
 * Lead Engineer — World State Builder
 *
 * Builds and incrementally updates the LeadWorldState from board data,
 * running agents, open PRs, milestones, and metrics.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import type {
  Feature,
  EventType,
  LeadWorldState,
  LeadFeatureSnapshot,
  LeadAgentSnapshot,
  LeadPRSnapshot,
  LeadMilestoneSnapshot,
} from '@protolabsai/types';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { ProjectService } from './project-service.js';
import type { MetricsService } from './metrics-service.js';
import type { SettingsService } from './settings-service.js';

const execAsync = promisify(exec);
const logger = createLogger('LeadEngineerService');

export interface WorldStateBuilderDeps {
  featureLoader: FeatureLoader;
  autoModeService: AutoModeService;
  projectService: ProjectService;
  metricsService: MetricsService;
  settingsService: SettingsService;
}

export class WorldStateBuilder {
  constructor(private deps: WorldStateBuilderDeps) {}

  /**
   * Build a complete WorldState from scratch.
   */
  async build(
    projectPath: string,
    projectSlug: string,
    maxConcurrency?: number
  ): Promise<LeadWorldState> {
    const features = await this.deps.featureLoader.getAll(projectPath);

    // Terminal statuses — features in these states need no further processing
    const TERMINAL_STATUSES = new Set(['done', 'completed', 'verified']);

    // Board counts (all features, including terminal)
    const boardCounts: Record<string, number> = {};
    for (const f of features) {
      const status = f.status || 'backlog';
      boardCounts[status] = (boardCounts[status] || 0) + 1;
    }

    // Feature snapshots — only non-terminal features enter world state
    // so the state machine and rules never process features that are already done
    const featureMap: Record<string, LeadFeatureSnapshot> = {};
    // All-features lookup used for milestone completion checks (done features must be visible there)
    const allFeaturesById: Record<string, Feature> = {};
    for (const f of features) {
      allFeaturesById[f.id] = f;
      if (!TERMINAL_STATUSES.has(f.status as string)) {
        featureMap[f.id] = this.featureToSnapshot(f);
      }
    }

    // Running agents
    const agents: LeadAgentSnapshot[] = [];
    try {
      const runningAgents = await this.deps.autoModeService.getRunningAgents();
      for (const a of runningAgents) {
        if (a.projectPath === projectPath) {
          agents.push({
            featureId: a.featureId,
            startTime: new Date(a.startTime).toISOString(),
            branch: a.branchName ?? undefined,
          });
        }
      }
    } catch {
      // Running agents API may fail
    }

    // Open PRs — check auto-merge status
    const openPRs: LeadPRSnapshot[] = [];
    const reviewFeatures = features.filter((f) => f.status === 'review' && f.prNumber);
    for (const f of reviewFeatures) {
      const prSnapshot: LeadPRSnapshot = {
        featureId: f.id,
        prNumber: f.prNumber!,
        prUrl: f.prUrl,
        prCreatedAt: f.prCreatedAt,
      };

      try {
        const { stdout } = await execAsync(`gh pr view ${f.prNumber} --json autoMergeRequest`, {
          cwd: projectPath,
          timeout: 10000,
        });
        const data = JSON.parse(stdout);
        prSnapshot.autoMergeEnabled = !!data.autoMergeRequest;
      } catch {
        // gh CLI may fail — leave autoMergeEnabled undefined
      }

      openPRs.push(prSnapshot);
    }

    // Milestones
    const milestones: LeadMilestoneSnapshot[] = [];
    try {
      const project = await this.deps.projectService.getProject(projectPath, projectSlug);
      if (project?.milestones) {
        for (const ms of project.milestones) {
          const totalPhases = ms.phases?.length || 0;
          const completedPhases =
            ms.phases?.filter((p) => {
              if (!p.featureId) return false;
              const f = allFeaturesById[p.featureId];
              return f && (f.status === 'done' || f.status === 'verified');
            }).length || 0;
          milestones.push({
            slug: ms.slug || ms.title.toLowerCase().replace(/\s+/g, '-'),
            title: ms.title,
            totalPhases,
            completedPhases,
          });
        }
      }
    } catch {
      // Project may not have milestones
    }

    // Metrics
    const completedFeatures = features.filter(
      (f) => f.status === 'done' || f.status === 'verified'
    ).length;
    const totalCostUsd = features.reduce((sum, f) => sum + (f.costUsd || 0), 0);

    let avgCycleTimeMs: number | undefined;
    try {
      const metrics = await this.deps.metricsService.getProjectMetrics(projectPath);
      avgCycleTimeMs = metrics.avgCycleTimeMs > 0 ? metrics.avgCycleTimeMs : undefined;
    } catch {
      // Metrics may not be available
    }

    // Auto-mode status
    const activeProjects = this.deps.autoModeService.getActiveAutoLoopProjects();
    const autoModeRunning = activeProjects.includes(projectPath);

    // Resolve max concurrency
    let resolvedMaxConcurrency = maxConcurrency || 1;
    try {
      const settings = await this.deps.settingsService.getGlobalSettings();
      resolvedMaxConcurrency = maxConcurrency || settings.maxConcurrency || 1;
    } catch {
      // Fallback
    }

    return {
      projectPath,
      projectSlug,
      updatedAt: new Date().toISOString(),
      boardCounts,
      features: featureMap,
      agents,
      openPRs,
      milestones,
      metrics: {
        totalFeatures: features.length,
        completedFeatures,
        totalCostUsd,
        avgCycleTimeMs,
      },
      autoModeRunning,
      maxConcurrency: resolvedMaxConcurrency,
    };
  }

  /**
   * Incrementally patch WorldState from a single event.
   */
  updateFromEvent(state: LeadWorldState, type: EventType, payload: unknown): void {
    const p = payload as Record<string, unknown> | null;
    const featureId = p?.featureId as string | undefined;
    const now = new Date().toISOString();

    state.updatedAt = now;

    switch (type) {
      case 'feature:status-changed': {
        if (featureId && state.features[featureId]) {
          const newStatus = p?.newStatus as string | undefined;
          if (newStatus) {
            const oldStatus = state.features[featureId].status;
            state.features[featureId].status = newStatus;
            if (oldStatus) {
              state.boardCounts[oldStatus] = Math.max(0, (state.boardCounts[oldStatus] || 0) - 1);
            }
            state.boardCounts[newStatus] = (state.boardCounts[newStatus] || 0) + 1;

            const wasCompleted = oldStatus === 'done' || oldStatus === 'verified';
            const isCompleted = newStatus === 'done' || newStatus === 'verified';
            if (isCompleted && !wasCompleted) {
              state.metrics.completedFeatures++;
              state.features[featureId].completedAt = now;
            } else if (!isCompleted && wasCompleted) {
              state.metrics.completedFeatures = Math.max(0, state.metrics.completedFeatures - 1);
            }
          }
        }
        break;
      }

      case 'feature:started': {
        if (featureId && state.features[featureId]) {
          const oldStatus = state.features[featureId].status;
          state.features[featureId].status = 'in_progress';
          state.features[featureId].startedAt = now;
          // Update board counts to reflect the status change
          if (oldStatus && oldStatus !== 'in_progress') {
            state.boardCounts[oldStatus] = Math.max(0, (state.boardCounts[oldStatus] || 0) - 1);
          }
          state.boardCounts['in_progress'] = (state.boardCounts['in_progress'] || 0) + 1;
          state.agents.push({ featureId, startTime: now });
        }
        break;
      }

      case 'feature:completed':
      case 'feature:stopped':
      case 'feature:error': {
        if (featureId) {
          state.agents = state.agents.filter((a) => a.featureId !== featureId);
        }
        break;
      }

      case 'feature:pr-merged': {
        if (featureId && state.features[featureId]) {
          state.features[featureId].prMergedAt = now;
          state.openPRs = state.openPRs.filter((pr) => pr.featureId !== featureId);
        }
        break;
      }

      case 'auto-mode:started': {
        state.autoModeRunning = true;
        break;
      }

      case 'auto-mode:stopped': {
        state.autoModeRunning = false;
        break;
      }

      case 'pr:approved':
      case 'github:pr:approved': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.reviewState = 'approved';
        }
        break;
      }

      case 'pr:changes-requested':
      case 'github:pr:changes-requested': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.reviewState = 'changes_requested';
        }
        break;
      }

      case 'pr:ci-failure': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.ciStatus = 'failing';
        }
        break;
      }

      case 'pr:remediation-started': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) {
            pr.isRemediating = true;
            pr.remediationCount = (pr.remediationCount || 0) + 1;
          }
        }
        break;
      }

      case 'pr:remediation-completed':
      case 'pr:remediation-failed': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.isRemediating = false;
        }
        break;
      }

      case 'pr:threads-resolved': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.unresolvedThreads = 0;
        }
        break;
      }

      case 'pr:merge-blocked-critical-threads': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) {
            pr.unresolvedThreads =
              (p?.unresolvedCount as number) ?? (p?.threadCount as number) ?? 1;
          }
        }
        break;
      }
    }
  }

  /**
   * Find or create a PR snapshot for a feature.
   */
  findOrCreatePR(
    state: LeadWorldState,
    featureId: string,
    payload: Record<string, unknown> | null
  ): LeadPRSnapshot | undefined {
    let pr = state.openPRs.find((p) => p.featureId === featureId);
    if (!pr) {
      const prNumber = (payload?.prNumber as number) ?? state.features[featureId]?.prNumber;
      if (!prNumber) return undefined;
      pr = { featureId, prNumber };
      state.openPRs.push(pr);
    }
    return pr;
  }

  /**
   * Convert a Feature to a LeadFeatureSnapshot.
   */
  featureToSnapshot(f: Feature): LeadFeatureSnapshot {
    return {
      id: f.id,
      title: f.title,
      status: (f.status as string) || 'backlog',
      branchName: f.branchName,
      prNumber: f.prNumber,
      prUrl: f.prUrl,
      prCreatedAt: f.prCreatedAt,
      prMergedAt: f.prMergedAt,
      costUsd: f.costUsd,
      failureCount: f.failureCount,
      dependencies: f.dependencies,
      epicId: f.epicId,
      isEpic: f.isEpic,
      complexity: f.complexity,
      startedAt: f.startedAt,
      completedAt: f.completedAt,
    };
  }
}
