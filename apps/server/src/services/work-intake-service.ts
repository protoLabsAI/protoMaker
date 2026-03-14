/**
 * WorkIntakeService — pull-based phase claiming from shared projects.
 *
 * Runs on a configurable tick when auto-mode is active. Each tick:
 *   1. Reads shared project docs (synced via peer mesh)
 *   2. Finds claimable phases using pure functions from @protolabsai/utils
 *   3. Claims phases by writing to the shared project doc
 *   4. Creates LOCAL features from claimed phases
 *   5. On completion, updates phase executionStatus in the shared doc
 *
 * Features never cross the wire. Phases are the coordination unit.
 */

import { createLogger } from '@protolabsai/utils';
import {
  getClaimablePhases,
  holdsClaim,
  isReclaimable,
  materializeFeature,
  phasePriority,
} from '@protolabsai/utils';
import type { Project, Phase, Milestone, InstanceRole } from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';

import { WORK_INTAKE_TICK_INTERVAL_MS, WORK_INTAKE_CLAIM_TIMEOUT_MS } from '../config/timeouts.js';

const logger = createLogger('WorkIntakeService');

/** Default tick interval for checking claimable phases */
const DEFAULT_TICK_INTERVAL_MS = WORK_INTAKE_TICK_INTERVAL_MS;
/** Default timeout before a stale claim becomes reclaimable */
const DEFAULT_CLAIM_TIMEOUT_MS = WORK_INTAKE_CLAIM_TIMEOUT_MS;
/** Delay after claiming to verify the claim survived sync merge */
const CLAIM_VERIFY_DELAY_MS = 200;

export interface WorkIntakeConfig {
  enabled: boolean;
  tickIntervalMs: number;
  claimTimeoutMs: number;
}

export interface WorkIntakeDependencies {
  events: EventEmitter;
  instanceId: string;
  role: InstanceRole;
  tags?: string[];
  /** Read all projects from the local project service */
  getProjects: (projectPath: string) => Promise<Project[]>;
  /** Update a phase's claim state in the shared project doc */
  updatePhaseClaim: (
    projectPath: string,
    projectSlug: string,
    milestoneSlug: string,
    phaseName: string,
    update: Partial<Phase>
  ) => Promise<void>;
  /** Read the latest phase state (after sync merge) */
  getPhase: (
    projectPath: string,
    projectSlug: string,
    milestoneSlug: string,
    phaseName: string
  ) => Promise<Phase | null>;
  /** Create a local feature from a materialized phase */
  createFeature: (projectPath: string, feature: Record<string, unknown>) => Promise<{ id: string }>;
  /** Get current number of running agents */
  getRunningAgentCount: () => number;
  /** Get max concurrency */
  getMaxConcurrency: () => number;
  /** Get peer status for stale claim recovery */
  getPeerStatus: () => Map<string, import('@protolabsai/types').InstanceIdentity>;
}

export class WorkIntakeService {
  private config: WorkIntakeConfig = {
    enabled: true,
    tickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
    claimTimeoutMs: DEFAULT_CLAIM_TIMEOUT_MS,
  };
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private projectPath: string | null = null;
  private deps: WorkIntakeDependencies | null = null;

  configure(config: Partial<WorkIntakeConfig>): void {
    if (config.enabled !== undefined) this.config.enabled = config.enabled;
    if (config.tickIntervalMs !== undefined) this.config.tickIntervalMs = config.tickIntervalMs;
    if (config.claimTimeoutMs !== undefined) this.config.claimTimeoutMs = config.claimTimeoutMs;
  }

  setDependencies(deps: WorkIntakeDependencies): void {
    this.deps = deps;
  }

  /**
   * Start the intake tick loop.
   * Call this when auto-mode starts.
   */
  start(projectPath: string): void {
    if (this.running) return;
    if (!this.config.enabled) {
      logger.info('Work intake disabled by config');
      return;
    }
    if (!this.deps) {
      logger.warn('Work intake not started — dependencies not set');
      return;
    }

    this.projectPath = projectPath;
    this.running = true;

    logger.info(
      `Work intake started (tick=${this.config.tickIntervalMs}ms, ` +
        `claimTimeout=${this.config.claimTimeoutMs}ms, ` +
        `role=${this.deps.role})`
    );

    // Run immediately, then on interval
    void this.tick();
    this.tickTimer = setInterval(() => void this.tick(), this.config.tickIntervalMs);
  }

  /**
   * Stop the intake tick loop.
   * Call this when auto-mode stops.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    logger.info('Work intake stopped');
  }

  /**
   * Report phase completion back to the shared project doc.
   * Called by the Lead Engineer or auto-mode when a feature finishes.
   */
  async reportCompletion(
    projectPath: string,
    projectSlug: string,
    milestoneSlug: string,
    phaseName: string,
    prUrl?: string
  ): Promise<void> {
    if (!this.deps) return;
    await this.deps.updatePhaseClaim(projectPath, projectSlug, milestoneSlug, phaseName, {
      executionStatus: 'done',
      prUrl,
    });
    logger.info(`Phase ${projectSlug}/${milestoneSlug}/${phaseName} marked done`);
  }

  /**
   * Report phase failure back to the shared project doc.
   */
  async reportFailure(
    projectPath: string,
    projectSlug: string,
    milestoneSlug: string,
    phaseName: string,
    error: string
  ): Promise<void> {
    if (!this.deps) return;
    await this.deps.updatePhaseClaim(projectPath, projectSlug, milestoneSlug, phaseName, {
      executionStatus: 'failed',
      lastError: error,
    });
    logger.warn(`Phase ${projectSlug}/${milestoneSlug}/${phaseName} marked failed: ${error}`);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async tick(): Promise<void> {
    if (!this.running || !this.deps || !this.projectPath) return;

    try {
      // How many slots are available?
      const running = this.deps.getRunningAgentCount();
      const max = this.deps.getMaxConcurrency();
      const available = max - running;
      if (available <= 0) return;

      // Check for reclaimable stale claims first
      await this.reclaimStalePhases();

      // Get all projects
      const projects = await this.deps.getProjects(this.projectPath);
      if (projects.length === 0) return;

      // Collect claimable phases across all projects
      const allClaimable: Array<{ project: Project; milestone: Milestone; phase: Phase }> = [];
      for (const project of projects) {
        if (project.status !== 'active' && project.status !== 'scaffolded') continue;
        const claimable = getClaimablePhases(
          project,
          this.deps.instanceId,
          this.deps.role,
          this.deps.tags
        );
        for (const { milestone, phase } of claimable) {
          allClaimable.push({ project, milestone, phase });
        }
      }

      if (allClaimable.length === 0) return;

      // Sort by priority (lower score = higher priority)
      allClaimable.sort(
        (a, b) =>
          phasePriority(a.project, a.milestone, a.phase) -
          phasePriority(b.project, b.milestone, b.phase)
      );

      // Claim up to `available` phases
      const toClaim = allClaimable.slice(0, available);
      for (const { project, milestone, phase } of toClaim) {
        await this.claimAndMaterialize(project, milestone, phase);
      }
    } catch (err) {
      logger.error('Work intake tick failed:', err);
    }
  }

  private async claimAndMaterialize(
    project: Project,
    milestone: Milestone,
    phase: Phase
  ): Promise<void> {
    if (!this.deps || !this.projectPath) return;
    const instanceId = this.deps.instanceId;

    // Write claim to shared project doc
    await this.deps.updatePhaseClaim(this.projectPath, project.slug, milestone.slug, phase.name, {
      claimedBy: instanceId,
      claimedAt: new Date().toISOString(),
      executionStatus: 'claimed',
    });

    // Wait for peer mesh sync to settle
    await new Promise((resolve) => setTimeout(resolve, CLAIM_VERIFY_DELAY_MS));

    // Verify claim survived merge
    const latest = await this.deps.getPhase(
      this.projectPath,
      project.slug,
      milestone.slug,
      phase.name
    );
    if (!latest || !holdsClaim(latest, instanceId)) {
      logger.info(
        `Claim lost for ${project.slug}/${milestone.slug}/${phase.name} — ` +
          `another instance won (claimedBy=${latest?.claimedBy})`
      );
      return;
    }

    // Mark as in_progress
    await this.deps.updatePhaseClaim(this.projectPath, project.slug, milestone.slug, phase.name, {
      executionStatus: 'in_progress',
    });

    // Materialize as a local feature
    const featureData = materializeFeature(project, milestone, phase, instanceId);
    const created = await this.deps.createFeature(
      this.projectPath,
      featureData as unknown as Record<string, unknown>
    );

    logger.info(
      `Claimed and materialized phase ${project.slug}/${milestone.slug}/${phase.name} → ` +
        `feature ${created.id}`
    );
  }

  private async reclaimStalePhases(): Promise<void> {
    if (!this.deps || !this.projectPath) return;

    const peerStatus = this.deps.getPeerStatus();
    const projects = await this.deps.getProjects(this.projectPath);

    for (const project of projects) {
      if (project.status !== 'active' && project.status !== 'scaffolded') continue;
      for (const milestone of project.milestones) {
        for (const phase of milestone.phases) {
          if (isReclaimable(phase, peerStatus, this.config.claimTimeoutMs)) {
            logger.info(
              `Reclaiming stale phase ${project.slug}/${milestone.slug}/${phase.name} ` +
                `(was claimed by ${phase.claimedBy})`
            );
            await this.deps.updatePhaseClaim(
              this.projectPath,
              project.slug,
              milestone.slug,
              phase.name,
              {
                claimedBy: undefined,
                claimedAt: undefined,
                executionStatus: 'unclaimed',
                lastError: `Reclaimed from offline instance ${phase.claimedBy}`,
              }
            );
          }
        }
      }
    }
  }
}
