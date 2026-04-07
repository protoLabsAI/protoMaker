/**
 * PortfolioSitrepService - Fleet-wide status aggregation
 *
 * Provides a snapshot of all project loops, capacity utilization, and bottleneck
 * trends used by PortfolioScheduler and get_portfolio_forecast MCP tool.
 */

import type { Feature, GlobalSettings } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoLoopCoordinator } from './auto-mode/auto-loop-coordinator.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('PortfolioSitrep');

export type BottleneckType = 'agent_capacity' | 'pr_review' | 'cross_repo_blocked' | 'human_input';

export interface ProjectSitrep {
  projectPath: string;
  projectSlug: string;
  activeAgentCount: number;
  inFlightFeatures: string[];
  queueDepth: number;
  blockedCount: number;
  reviewCount: number;
  lastCompletionTime: string | null;
  isPaused: boolean;
  pauseReason: string | null;
  timePausedMs: number;
}

export interface PortfolioSitrep {
  projects: ProjectSitrep[];
  global: {
    totalCapacityUsed: number;
    totalCapacityAvailable: number;
    bottleneckTrend: BottleneckType | null;
  };
  timestamp: string;
}

export class PortfolioSitrepService {
  private featureLoader: FeatureLoader;
  private coordinator: AutoLoopCoordinator;
  private settingsService: SettingsService;
  private bottleneckHistory: BottleneckType[] = [];

  constructor(
    featureLoader: FeatureLoader,
    coordinator: AutoLoopCoordinator,
    settingsService: SettingsService
  ) {
    this.featureLoader = featureLoader;
    this.coordinator = coordinator;
    this.settingsService = settingsService;
  }

  /**
   * Classify the primary bottleneck for a project based on its feature distribution.
   */
  classifyBottleneck(features: Feature[]): BottleneckType {
    const inProgress = features.filter((f) => f.status === 'in_progress').length;
    const inReview = features.filter((f) => f.status === 'review').length;
    const blocked = features.filter((f) => f.status === 'blocked');
    const humanBlocked = blocked.filter((f) => f.assignee && f.assignee !== 'agent').length;
    const crossRepoBlocked = blocked.filter(
      (f) => f.blockingReason?.includes('cross-repo') || f.blockingReason?.includes('external')
    ).length;

    // Highest bottleneck score wins
    const scores: [BottleneckType, number][] = [
      ['pr_review', inReview * 2],
      ['agent_capacity', inProgress > 0 ? 1 : 0],
      ['human_input', humanBlocked * 3],
      ['cross_repo_blocked', crossRepoBlocked * 3],
    ];

    scores.sort((a, b) => b[1] - a[1]);
    return scores[0][1] > 0 ? scores[0][0] : 'agent_capacity';
  }

  /**
   * Get fleet-wide portfolio status snapshot.
   */
  async getPortfolioSitrep(projectPaths: string[]): Promise<PortfolioSitrep> {
    const settings = await this.settingsService.getGlobalSettings();
    const maxConcurrency = settings.systemMaxConcurrency ?? settings.maxConcurrency ?? 2;

    const projects: ProjectSitrep[] = [];
    let totalCapacityUsed = 0;
    const bottlenecks: BottleneckType[] = [];

    for (const projectPath of projectPaths) {
      const features = await this.featureLoader.getAll(projectPath);

      const inProgress = features.filter((f) => f.status === 'in_progress');
      const backlog = features.filter((f) => f.status === 'backlog');
      const blocked = features.filter((f) => f.status === 'blocked');
      const review = features.filter((f) => f.status === 'review');

      // Find the most recent completion
      const completions = features
        .filter((f) => f.completedAt)
        .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
      const lastCompletionTime = completions[0]?.completedAt ?? null;

      // Check loop state for pause info
      const loopKey = this.coordinator.makeKey(projectPath, null);
      const loopState = this.coordinator.getState(loopKey);
      const isPaused = loopState?.isPaused ?? false;

      // Derive project slug from path
      const slug = projectPath.split('/').pop() ?? projectPath;

      const sitrep: ProjectSitrep = {
        projectPath,
        projectSlug: slug,
        activeAgentCount: inProgress.length,
        inFlightFeatures: inProgress.map((f) => f.id),
        queueDepth: backlog.length,
        blockedCount: blocked.length,
        reviewCount: review.length,
        lastCompletionTime,
        isPaused,
        pauseReason: isPaused ? 'circuit-breaker' : null,
        timePausedMs: 0, // Not tracked at coordinator level currently
      };

      projects.push(sitrep);
      totalCapacityUsed += inProgress.length;

      if (features.length > 0) {
        bottlenecks.push(this.classifyBottleneck(features));
      }
    }

    // Detect bottleneck trend: same type persisting >2 ticks
    const currentBottleneck = this.detectBottleneckTrend(bottlenecks);

    return {
      projects,
      global: {
        totalCapacityUsed,
        totalCapacityAvailable: maxConcurrency,
        bottleneckTrend: currentBottleneck,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Track bottleneck history and detect persistent trends.
   * Returns the bottleneck type if the same type persists for >2 consecutive ticks.
   */
  private detectBottleneckTrend(currentBottlenecks: BottleneckType[]): BottleneckType | null {
    // Most common bottleneck this tick
    const counts = new Map<BottleneckType, number>();
    for (const b of currentBottlenecks) {
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }

    let dominant: BottleneckType | null = null;
    let maxCount = 0;
    for (const [type, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        dominant = type;
      }
    }

    if (dominant) {
      this.bottleneckHistory.push(dominant);
      // Keep only last 5 ticks
      if (this.bottleneckHistory.length > 5) {
        this.bottleneckHistory.shift();
      }

      // Check if same type persists >2 ticks
      if (this.bottleneckHistory.length >= 3) {
        const last3 = this.bottleneckHistory.slice(-3);
        if (last3.every((b) => b === dominant)) {
          return dominant;
        }
      }
    }

    return null;
  }
}
