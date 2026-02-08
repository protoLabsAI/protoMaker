/**
 * World State Monitor - GOAP-Inspired Reactive System
 *
 * Periodically checks the actual state of the system against desired state
 * and triggers corrective actions when drift is detected.
 *
 * Philosophy:
 * - Event-driven systems are reactive but brittle
 * - State-driven systems are proactive and self-healing
 *
 * This monitor checks:
 * 1. Automaker internal state (features, agents, worktrees)
 * 2. GitHub state (PRs, reviews, CI status)
 * 3. Git state (branches, merges)
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
// import type { ReconciliationService, Drift } from './reconciliation-service.js'; // TODO: Re-enable when implemented
// import type { GitHubStateChecker } from './github-state-checker.js'; // TODO: Re-enable when implemented
import path from 'node:path';

// Temporary stub types until reconciliation-service is implemented
type ReconciliationService = any;
type GitHubStateChecker = any;
type Drift = any;

const logger = createLogger('WorldStateMonitor');

interface WorldStateMonitorConfig {
  enabled: boolean;
  tickIntervalMs: number;
  checks: {
    automaker: boolean;
    github: boolean;
    git: boolean;
  };
}

interface WorldStateMetrics {
  tickCount: number;
  driftsDetected: number;
  driftsReconciled: number;
  driftsByType: Record<string, number>;
  averageTickDuration: number;
  lastTickTimestamp: number;
}

export class WorldStateMonitor {
  private tickInterval: NodeJS.Timeout | null = null;
  private currentTick: Promise<void> | null = null;
  private config: WorldStateMonitorConfig;
  private metrics: WorldStateMetrics;
  private isRunning = false;
  private aborted = false;
  private projectPath: string;

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader,
    private reconciliationService: ReconciliationService,
    private githubChecker: GitHubStateChecker,
    config?: Partial<WorldStateMonitorConfig>,
    projectPath?: string
  ) {
    this.config = {
      enabled: config?.enabled ?? true,
      tickIntervalMs: config?.tickIntervalMs ?? 30000, // 30s default
      checks: {
        automaker: config?.checks?.automaker ?? true,
        github: config?.checks?.github ?? true,
        git: config?.checks?.git ?? true,
      },
    };

    this.metrics = {
      tickCount: 0,
      driftsDetected: 0,
      driftsReconciled: 0,
      driftsByType: {},
      averageTickDuration: 0,
      lastTickTimestamp: 0,
    };
    this.projectPath = projectPath ?? process.env.REPO_ROOT ?? path.resolve(process.cwd(), '../..');
  }

  /**
   * Start the world state monitor tick loop
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('WorldStateMonitor is disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('WorldStateMonitor already running');
      return;
    }

    this.isRunning = true;
    this.aborted = false;
    logger.info(`Starting WorldStateMonitor with ${this.config.tickIntervalMs}ms interval`);

    this.tickInterval = setInterval(() => {
      this.currentTick = this.tick();
    }, this.config.tickIntervalMs);

    // Run first tick immediately
    this.currentTick = this.tick();
  }

  /**
   * Stop the world state monitor
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.aborted = true;

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    logger.info('WorldStateMonitor stopped', this.metrics);
  }

  /**
   * Get current in-flight tick promise for graceful shutdown
   */
  getCurrentTick(): Promise<void> | null {
    return this.currentTick;
  }

  /**
   * Get current metrics
   */
  getMetrics(): WorldStateMetrics {
    return { ...this.metrics };
  }

  /**
   * Main tick function - runs periodically to check world state
   */
  private async tick(): Promise<void> {
    if (this.aborted) {
      logger.debug('WorldStateMonitor tick aborted');
      return;
    }

    const startTime = Date.now();

    try {
      logger.debug('WorldStateMonitor tick starting...');

      // Check abort before heavy operations
      if (this.aborted) {
        return;
      }

      // Detect all drifts across all state sources
      const drifts = await this.detectDrifts();

      if (drifts.length === 0) {
        logger.debug('No drifts detected');
      } else {
        logger.info(`Detected ${drifts.length} drift(s)`, {
          types: drifts.map((d) => d.type),
        });

        // Check abort before reconciliation
        if (this.aborted) {
          return;
        }

        // Reconcile each drift
        for (const drift of drifts) {
          // Check abort between each reconciliation
          if (this.aborted) {
            return;
          }

          try {
            await this.reconciliationService.reconcile(drift);
            this.metrics.driftsReconciled++;
          } catch (error) {
            logger.error(`Failed to reconcile drift ${drift.type}:`, error);
          }
        }

        this.metrics.driftsDetected += drifts.length;
      }

      // Update metrics
      const duration = Date.now() - startTime;
      this.metrics.tickCount++;
      this.metrics.lastTickTimestamp = Date.now();
      this.metrics.averageTickDuration =
        (this.metrics.averageTickDuration * (this.metrics.tickCount - 1) + duration) /
        this.metrics.tickCount;

      logger.debug(`Tick complete in ${duration}ms`);
    } catch (error) {
      logger.error('WorldStateMonitor tick failed:', error);
    }
  }

  /**
   * Detect all drifts across state sources
   */
  private async detectDrifts(): Promise<Drift[]> {
    const drifts: Drift[] = [];

    // Check Automaker internal state
    if (this.config.checks.automaker) {
      const automakerDrifts = await this.checkAutomakerState();
      drifts.push(...automakerDrifts);
    }

    // Check GitHub state
    if (this.config.checks.github) {
      const githubDrifts = await this.checkGitHubState();
      drifts.push(...githubDrifts);
    }

    // Check Git state
    if (this.config.checks.git) {
      const gitDrifts = await this.checkGitState();
      drifts.push(...gitDrifts);
    }

    // Update type counts
    for (const drift of drifts) {
      this.metrics.driftsByType[drift.type] = (this.metrics.driftsByType[drift.type] || 0) + 1;
    }

    return drifts;
  }

  /**
   * Check Automaker internal state for drifts
   */
  private async checkAutomakerState(): Promise<Drift[]> {
    const drifts: Drift[] = [];

    try {
      // For now, check the main project only
      // TODO: Make this configurable per-project
      const projectPath = this.projectPath;
      // Get all features
      const features = await this.featureLoader.getAll(projectPath);

      // Check 1: Epic with workItemState='approved' but never decomposed
      for (const feature of features) {
        if (
          feature.isEpic &&
          feature.workItemState === 'approved' &&
          feature.status === 'backlog'
        ) {
          // Check if this epic has been processed (would have Project or child features)
          const childFeatures = features.filter((f) => f.epicId === feature.id);

          if (childFeatures.length === 0) {
            logger.info(`Drift detected: Epic ${feature.id} not decomposed`);
            drifts.push({
              type: 'epic-not-decomposed',
              severity: 'high',
              projectPath,
              featureId: feature.id,
              details: {
                title: feature.title,
                complexity: feature.complexity,
                projectSlug: feature.projectSlug,
              },
            });
          }
        }
      }

      // Check 2: Feature in-progress but no running agent
      // TODO: Need access to AutoModeService.runningFeatures to implement this
      // For now, skip this check

      // Check 3: Feature stuck (in-progress > 2 hours)
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      for (const feature of features) {
        if (feature.status === 'in_progress' && feature.updatedAt) {
          const updatedAtMs = new Date(feature.updatedAt as string).getTime();
          if (updatedAtMs < twoHoursAgo) {
            logger.warn(`Drift detected: Feature ${feature.id} stuck > 2 hours`);
            drifts.push({
              type: 'feature-stuck',
              severity: 'medium',
              projectPath,
              featureId: feature.id,
              details: {
                title: feature.title,
                hoursInProgress: Math.floor((Date.now() - updatedAtMs) / (60 * 60 * 1000)),
              },
            });
          }
        }
      }

      logger.debug(`Automaker state check complete: ${drifts.length} drifts found`);
    } catch (error) {
      logger.error('Failed to check Automaker state:', error);
    }

    return drifts;
  }

  /**
   * Check GitHub state for drifts
   */
  private async checkGitHubState(): Promise<Drift[]> {
    const drifts: Drift[] = [];

    try {
      // Use GitHubStateChecker to detect PR-related drifts
      const prDrifts = await this.githubChecker.checkAllProjects();
      drifts.push(...prDrifts);
    } catch (error) {
      logger.error('Failed to check GitHub state:', error);
    }

    return drifts;
  }

  /**
   * Check Git state for drifts
   */
  private async checkGitState(): Promise<Drift[]> {
    const drifts: Drift[] = [];

    // TODO: Implement checks:
    // - Branch merged to main but feature not 'done'
    // - Feature has branchName but branch doesn't exist
    // - Worktree exists but branch deleted

    logger.debug('Checking Git state...');

    return drifts;
  }
}
