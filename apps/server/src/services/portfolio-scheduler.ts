/**
 * PortfolioScheduler - Singleton service for cross-project capacity allocation
 *
 * Runs a 30s tick cycle that:
 * 1. Gets fleet snapshot via PortfolioSitrepService
 * 2. Recomputes WSJF scores with current time decay
 * 3. Computes priority-weighted capacity allocation
 * 4. Adjusts per-project maxConcurrency via AutoLoopCoordinator
 * 5. Wakes paused project loops with high-priority features
 * 6. Applies ToC tiebreaker when at global ceiling
 *
 * State persisted to .automaker/portfolio-scheduler-state.json
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  createLogger,
  atomicWriteJson,
  readJsonWithRecovery,
  logRecoveryWarning,
} from '@protolabsai/utils';
import { resolveDependencies } from '@protolabsai/dependency-resolver';
import type { FeatureLoader } from './feature-loader.js';
import type { MetricsService } from './metrics-service.js';
import type { AutoLoopCoordinator } from './auto-mode/auto-loop-coordinator.js';
import type { PortfolioSitrepService } from './portfolio-sitrep.js';
import type { PortfolioToolsService } from './portfolio-tools.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('PortfolioScheduler');

/** Default tick interval in milliseconds */
const DEFAULT_TICK_INTERVAL_MS = 30_000;

/** Graceful shutdown timeout in milliseconds */
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000;

// ── State persistence types ──────────────────────────────────────────────

export interface ProjectAllocationEntry {
  projectSlug: string;
  projectPath: string;
  allocatedSlots: number;
  wsjfWeight: number;
  timestamp: string;
}

export interface PortfolioSchedulerState {
  isRunning: boolean;
  lastTickAt: string | null;
  nextTickAt: string | null;
  tickCount: number;
  allocationHistory: ProjectAllocationEntry[];
  projectStates: Array<{
    projectSlug: string;
    projectPath: string;
    currentAllocation: number;
    isPaused: boolean;
    lastWsjfTotal: number;
  }>;
  tiebreakerLog: Array<{
    timestamp: string;
    winnerSlug: string;
    winnerDownstreamImpact: number;
    candidates: Array<{ slug: string; downstreamImpact: number }>;
  }>;
}

const EMPTY_STATE: PortfolioSchedulerState = {
  isRunning: false,
  lastTickAt: null,
  nextTickAt: null,
  tickCount: 0,
  allocationHistory: [],
  projectStates: [],
  tiebreakerLog: [],
};

// ── PortfolioScheduler ──────────────────────────────────────────────────

export class PortfolioScheduler {
  private featureLoader: FeatureLoader;
  private metricsService: MetricsService;
  private coordinator: AutoLoopCoordinator;
  private sitrepService: PortfolioSitrepService;
  private portfolioTools: PortfolioToolsService;
  private settingsService: SettingsService;

  private tickTimer: NodeJS.Timeout | null = null;
  private running = false;
  private shuttingDown = false;
  private state: PortfolioSchedulerState = { ...EMPTY_STATE };
  private projectPaths: string[] = [];
  private dataDir: string;

  constructor(
    featureLoader: FeatureLoader,
    metricsService: MetricsService,
    coordinator: AutoLoopCoordinator,
    sitrepService: PortfolioSitrepService,
    portfolioTools: PortfolioToolsService,
    settingsService: SettingsService,
    dataDir: string
  ) {
    this.featureLoader = featureLoader;
    this.metricsService = metricsService;
    this.coordinator = coordinator;
    this.sitrepService = sitrepService;
    this.portfolioTools = portfolioTools;
    this.settingsService = settingsService;
    this.dataDir = dataDir;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Start the portfolio scheduler tick cycle.
   * @param projectPaths - Paths of all projects to manage
   */
  async start(projectPaths: string[]): Promise<void> {
    if (this.running) {
      logger.warn('[PortfolioScheduler] Already running, ignoring start()');
      return;
    }

    this.projectPaths = projectPaths;
    this.running = true;
    this.shuttingDown = false;
    this.state = await this.loadState();
    this.state.isRunning = true;

    logger.info(
      `[PortfolioScheduler] Started with ${projectPaths.length} projects, ` +
        `tick interval: ${DEFAULT_TICK_INTERVAL_MS}ms`
    );

    // Run first tick immediately, then schedule recurring
    await this.tick();
    this.scheduleTick();
  }

  /**
   * Graceful stop: waits for in-flight agents to finish, then stops.
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    this.shuttingDown = true;
    logger.info('[PortfolioScheduler] Graceful shutdown initiated');

    // Clear the tick timer
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    // Wait for in-flight agents with timeout
    const startTime = Date.now();
    while (Date.now() - startTime < GRACEFUL_SHUTDOWN_TIMEOUT_MS) {
      const sitrep = await this.sitrepService.getPortfolioSitrep(this.projectPaths);
      if (sitrep.global.totalCapacityUsed === 0) break;

      logger.info(
        `[PortfolioScheduler] Waiting for ${sitrep.global.totalCapacityUsed} in-flight agents`
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (Date.now() - startTime >= GRACEFUL_SHUTDOWN_TIMEOUT_MS) {
      logger.warn('[PortfolioScheduler] Graceful shutdown timeout reached, force stopping');
    }

    this.running = false;
    this.state.isRunning = false;
    await this.persistState();

    logger.info('[PortfolioScheduler] Stopped');
  }

  /**
   * Force stop without waiting for in-flight agents.
   */
  forceStop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.running = false;
    this.shuttingDown = false;
    this.state.isRunning = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  getState(): PortfolioSchedulerState {
    return { ...this.state };
  }

  // ── Tick cycle ─────────────────────────────────────────────────────────

  private scheduleTick(): void {
    this.tickTimer = setInterval(async () => {
      if (this.shuttingDown) return;
      try {
        await this.tick();
      } catch (err) {
        logger.error('[PortfolioScheduler] Tick error:', err);
      }
    }, DEFAULT_TICK_INTERVAL_MS);
  }

  /**
   * Single tick cycle: sitrep → WSJF → allocate → adjust → wake → tiebreak
   */
  async tick(): Promise<void> {
    if (this.shuttingDown) return;

    const tickStart = Date.now();
    const now = new Date();

    // 1. Fleet snapshot
    const sitrep = await this.sitrepService.getPortfolioSitrep(this.projectPaths);

    // 2. Recompute WSJF scores with current time decay
    const projectWsjfTotals = new Map<string, number>();
    for (const projectPath of this.projectPaths) {
      const features = await this.featureLoader.getAll(projectPath);
      this.metricsService.propagateEpicBusinessValue(features);
      const durationByComplexity =
        await this.metricsService.getAvgDurationByComplexity(projectPath);

      let totalWsjf = 0;
      for (const f of features) {
        if (f.status === 'backlog' || f.status === 'in_progress') {
          f.wsjfScore = this.metricsService.computeWsjfScore(f, durationByComplexity, now);
          totalWsjf += f.wsjfScore;
        }
      }

      const slug = projectPath.split('/').pop() ?? projectPath;
      projectWsjfTotals.set(slug, totalWsjf);
    }

    // 3. Compute priority-weighted allocation
    const allocations = await this.portfolioTools.allocateCapacity(this.projectPaths);

    // 4. Apply allocation changes
    for (const alloc of allocations) {
      if (alloc.proposedMax !== alloc.currentMax) {
        const key = this.coordinator.makeKey(alloc.projectPath, null);
        this.coordinator.updateMaxConcurrency(key, alloc.proposedMax, alloc.rationale);

        this.state.allocationHistory.push({
          projectSlug: alloc.projectSlug,
          projectPath: alloc.projectPath,
          allocatedSlots: alloc.proposedMax,
          wsjfWeight: projectWsjfTotals.get(alloc.projectSlug) ?? 0,
          timestamp: now.toISOString(),
        });
      }
    }

    // Trim allocation history to last 100 entries
    if (this.state.allocationHistory.length > 100) {
      this.state.allocationHistory = this.state.allocationHistory.slice(-100);
    }

    // 5. Wake paused project loops with high-priority ready features
    for (const project of sitrep.projects) {
      if (!project.isPaused) continue;
      if (project.queueDepth > 0) {
        const key = this.coordinator.makeKey(project.projectPath, null);
        logger.info(
          `[PortfolioScheduler] Waking paused loop ${key}: ${project.queueDepth} features in queue`
        );
        this.coordinator.resetFailures(key);
      }
    }

    // 6. ToC tiebreaker when at global ceiling
    await this.applyTocTiebreaker(sitrep, allocations);

    // Update state
    this.state.lastTickAt = now.toISOString();
    this.state.nextTickAt = new Date(now.getTime() + DEFAULT_TICK_INTERVAL_MS).toISOString();
    this.state.tickCount++;

    // Update project states snapshot
    this.state.projectStates = allocations.map((a) => ({
      projectSlug: a.projectSlug,
      projectPath: a.projectPath,
      currentAllocation: a.proposedMax,
      isPaused: sitrep.projects.find((p) => p.projectPath === a.projectPath)?.isPaused ?? false,
      lastWsjfTotal: projectWsjfTotals.get(a.projectSlug) ?? 0,
    }));

    // Persist state
    await this.persistState();

    const tickDuration = Date.now() - tickStart;
    if (tickDuration > 5000) {
      logger.warn(`[PortfolioScheduler] Tick took ${tickDuration}ms (>5s threshold)`);
    }
  }

  // ── ToC tiebreaker ────────────────────────────────────────────────────

  /**
   * When at global ceiling, prefer the project whose top feature blocks
   * the most downstream features.
   */
  private async applyTocTiebreaker(
    sitrep: {
      projects: Array<{ projectPath: string; queueDepth: number }>;
      global: { totalCapacityUsed: number; totalCapacityAvailable: number };
    },
    allocations: Array<{ projectSlug: string; projectPath: string; proposedMax: number }>
  ): Promise<void> {
    const { totalCapacityUsed, totalCapacityAvailable } = sitrep.global;

    // Only apply tiebreaker when at ceiling
    if (totalCapacityUsed < totalCapacityAvailable) return;

    // Find projects competing for the last slot
    const candidates: Array<{
      slug: string;
      projectPath: string;
      topFeatureDownstream: number;
    }> = [];

    for (const alloc of allocations) {
      const project = sitrep.projects.find((p) => p.projectPath === alloc.projectPath);
      if (!project || project.queueDepth === 0) continue;

      const features = await this.featureLoader.getAll(alloc.projectPath);
      const backlog = features.filter((f) => f.status === 'backlog');

      if (backlog.length === 0) continue;

      // Compute downstream impact for top feature
      const { downstreamImpact } = resolveDependencies(features);
      const topFeature = backlog.sort((a, b) => (b.wsjfScore ?? 0) - (a.wsjfScore ?? 0))[0];

      candidates.push({
        slug: alloc.projectSlug,
        projectPath: alloc.projectPath,
        topFeatureDownstream: downstreamImpact.get(topFeature.id) ?? 0,
      });
    }

    if (candidates.length < 2) return;

    // Pick winner: highest downstream impact
    candidates.sort((a, b) => b.topFeatureDownstream - a.topFeatureDownstream);
    const winner = candidates[0];

    // Give the winner one extra slot
    const winnerKey = this.coordinator.makeKey(winner.projectPath, null);
    const currentState = this.coordinator.getState(winnerKey);
    if (currentState) {
      this.coordinator.updateMaxConcurrency(
        winnerKey,
        currentState.config.maxConcurrency + 1,
        `ToC tiebreaker: top feature blocks ${winner.topFeatureDownstream} downstream`
      );
    }

    // Log tiebreaker decision
    this.state.tiebreakerLog.push({
      timestamp: new Date().toISOString(),
      winnerSlug: winner.slug,
      winnerDownstreamImpact: winner.topFeatureDownstream,
      candidates: candidates.map((c) => ({
        slug: c.slug,
        downstreamImpact: c.topFeatureDownstream,
      })),
    });

    // Trim tiebreaker log to last 20 entries
    if (this.state.tiebreakerLog.length > 20) {
      this.state.tiebreakerLog = this.state.tiebreakerLog.slice(-20);
    }

    logger.info(
      `[PortfolioScheduler] ToC tiebreaker: ${winner.slug} wins ` +
        `(downstream impact: ${winner.topFeatureDownstream})`
    );
  }

  // ── State persistence ─────────────────────────────────────────────────

  private getStatePath(): string {
    return path.join(this.dataDir, 'portfolio-scheduler-state.json');
  }

  private async loadState(): Promise<PortfolioSchedulerState> {
    const statePath = this.getStatePath();
    try {
      const result = await readJsonWithRecovery<PortfolioSchedulerState>(statePath, null);
      if (result.recovered) {
        logRecoveryWarning(result, statePath, logger);
      }
      return result.data ?? { ...EMPTY_STATE };
    } catch {
      return { ...EMPTY_STATE };
    }
  }

  private async persistState(): Promise<void> {
    try {
      const statePath = this.getStatePath();
      const dir = path.dirname(statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      await atomicWriteJson(statePath, this.state, { createDirs: true });
    } catch (err) {
      logger.error('[PortfolioScheduler] Failed to persist state:', err);
    }
  }
}
