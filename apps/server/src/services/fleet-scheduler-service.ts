/**
 * FleetSchedulerService — fleet-level feature distribution scheduler.
 *
 * The primary instance (role=primary in proto.config.yaml) broadcasts a
 * schedule_assignment every 5 minutes, distributing backlog features across
 * worker instances based on capacity and dependency order.
 *
 * Failover: if the primary is absent >10 minutes, the longest-running worker
 * instance takes over scheduling (last-writer-wins on scheduler_heartbeat).
 *
 * Conflict detection: if two instances both claim the same feature, the one
 * with the lower instanceId (lexicographic) wins; the other releases the claim.
 */

import { createLogger } from '@protolabsai/utils';
import type { AvaChannelService } from './ava-channel-service.js';

// ---------------------------------------------------------------------------
// Fleet scheduler message types (mirrors libs/types/src/ava-channel.ts)
// Exported with Msg suffix so reactor-service can re-type them without
// re-importing from @protolabsai/types (which may be npm-hoisted stale).
// ---------------------------------------------------------------------------

/** Broadcast by each instance so the primary scheduler can see their backlog. */
export interface WorkInventoryMsg {
  instanceId: string;
  timestamp: string;
  backlogFeatureIds: string[];
  activeFeatureIds: string[];
  maxConcurrency: number;
  activeCount: number;
}

/** Broadcast by the primary scheduler every 5 minutes. */
export interface ScheduleAssignmentMsg {
  schedulerInstanceId: string;
  timestamp: string;
  assignments: Record<string, string[]>;
}

/** Broadcast by the active scheduler every minute for failover detection. */
export interface SchedulerHeartbeatMsg {
  schedulerInstanceId: string;
  timestamp: string;
  uptimeMs: number;
  isPrimary: boolean;
}

/** Broadcast when an instance detects a double-claim conflict. */
export interface ScheduleConflictMsg {
  featureId: string;
  detectingInstanceId: string;
  competingInstanceId: string;
  timestamp: string;
}

// Internal aliases (used by this file)
type WorkInventory = WorkInventoryMsg;
type ScheduleAssignment = ScheduleAssignmentMsg;
type SchedulerHeartbeat = SchedulerHeartbeatMsg;
type ScheduleConflict = ScheduleConflictMsg;

const logger = createLogger('FleetScheduler');

/** How often the active scheduler broadcasts a schedule_assignment (ms) */
const SCHEDULE_INTERVAL_MS = 5 * 60 * 1000;

/** How often the active scheduler broadcasts a scheduler_heartbeat (ms) */
const HEARTBEAT_INTERVAL_MS = 60_000;

/** Duration without a primary heartbeat after which a worker takes over (ms) */
const PRIMARY_ABSENT_THRESHOLD_MS = 10 * 60 * 1000;

/** How long to retain a peer's inventory snapshot before treating it as stale (ms) */
const PEER_INVENTORY_TTL_MS = 6 * 60 * 1000;

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface FleetSchedulerDependencies {
  avaChannelService: AvaChannelService;
  instanceId: string;
  /** Whether this instance has role=primary in proto.config.yaml */
  isPrimary: boolean;
  autoModeService?: {
    getCapacityMetrics(): {
      runningAgents: number;
      maxAgents: number;
      backlogCount: number;
    };
    // Returns Promise<number> in the real service; we ignore the return value
    startAutoLoopForProject?(
      projectPath: string,
      branchName: string | null,
      maxConcurrency?: number
    ): Promise<unknown>;
  };
  featureLoader?: {
    // Feature.status is `string | undefined` in the real type; guard in implementation
    getAll(
      projectPath: string
    ): Promise<
      Array<{ id?: string; status?: string; dependencies?: string[]; [key: string]: unknown }>
    >;
    update(projectPath: string, featureId: string, data: Record<string, unknown>): Promise<unknown>;
  };
  projectPath?: string;
  /** Process start time for uptime computation (default: Date.now() at construction) */
  startTimeMs?: number;
}

// ---------------------------------------------------------------------------
// Internal peer tracking
// ---------------------------------------------------------------------------

interface PeerInventoryEntry {
  inventory: WorkInventory;
  receivedAt: number;
}

interface PeerHeartbeatEntry {
  heartbeat: SchedulerHeartbeat;
  receivedAt: number;
}

// ---------------------------------------------------------------------------
// FleetSchedulerService
// ---------------------------------------------------------------------------

export class FleetSchedulerService {
  private readonly deps: FleetSchedulerDependencies;
  private readonly startTimeMs: number;

  /** Peer inventories keyed by instanceId */
  private readonly peerInventories = new Map<string, PeerInventoryEntry>();

  /** Latest heartbeat from each peer instanceId (including self) */
  private readonly peerHeartbeats = new Map<string, PeerHeartbeatEntry>();

  /** Feature IDs this instance has claimed (moved to in_progress) */
  private readonly claimedFeatureIds = new Set<string>();

  /** Whether this instance is currently acting as the active scheduler */
  private isActiveScheduler = false;

  private scheduleTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Error count for status reporting */
  private errorCount = 0;

  constructor(deps: FleetSchedulerDependencies) {
    this.deps = deps;
    this.startTimeMs = deps.startTimeMs ?? Date.now();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start(): void {
    // Primary always starts as active scheduler; workers wait for failover
    this.isActiveScheduler = this.deps.isPrimary;

    this.startHeartbeatTimer();

    if (this.isActiveScheduler) {
      this.startScheduleTimer();
    }

    logger.info(
      `FleetScheduler started: instanceId=${this.deps.instanceId} isPrimary=${this.deps.isPrimary} isActiveScheduler=${this.isActiveScheduler}`
    );
  }

  stop(): void {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.peerInventories.clear();
    this.peerHeartbeats.clear();
    this.claimedFeatureIds.clear();
    this.isActiveScheduler = false;
    logger.info('FleetScheduler stopped');
  }

  // ---------------------------------------------------------------------------
  // Public: Incoming message handlers (called by AvaChannelReactorService)
  // ---------------------------------------------------------------------------

  /**
   * Called when a work_inventory message is received from a peer.
   */
  onWorkInventory(inventory: WorkInventory): void {
    if (inventory.instanceId === this.deps.instanceId) return;

    this.peerInventories.set(inventory.instanceId, {
      inventory,
      receivedAt: Date.now(),
    });

    logger.debug(
      `Received work_inventory from ${inventory.instanceId}: backlog=${inventory.backlogFeatureIds.length} active=${inventory.activeFeatureIds.length}`
    );
  }

  /**
   * Called when a schedule_assignment message is received.
   * If the assignment targets this instance, apply it.
   */
  async onScheduleAssignment(assignment: ScheduleAssignment): Promise<void> {
    // Ignore our own broadcasts
    if (assignment.schedulerInstanceId === this.deps.instanceId) return;

    const myAssignments = assignment.assignments[this.deps.instanceId];
    if (!myAssignments || myAssignments.length === 0) return;

    logger.info(
      `Received schedule_assignment with ${myAssignments.length} feature(s) for this instance: [${myAssignments.join(', ')}]`
    );

    await this.applyAssignment(myAssignments);
  }

  /**
   * Called when a scheduler_heartbeat is received.
   * Used for failover detection.
   */
  onSchedulerHeartbeat(heartbeat: SchedulerHeartbeat): void {
    // Ignore our own
    if (heartbeat.schedulerInstanceId === this.deps.instanceId) return;

    this.peerHeartbeats.set(heartbeat.schedulerInstanceId, {
      heartbeat,
      receivedAt: Date.now(),
    });

    logger.debug(
      `Received scheduler_heartbeat from ${heartbeat.schedulerInstanceId} (isPrimary=${heartbeat.isPrimary} uptime=${heartbeat.uptimeMs}ms)`
    );

    // If a primary is active, workers should not be acting as scheduler
    if (heartbeat.isPrimary && this.isActiveScheduler && !this.deps.isPrimary) {
      logger.info(
        `Primary scheduler ${heartbeat.schedulerInstanceId} is active — stepping down as worker scheduler`
      );
      this.stepDownAsScheduler();
    }
  }

  /**
   * Called when a schedule_conflict message is received.
   * If this instance is named as the losing side, release the claimed feature.
   */
  async onScheduleConflict(conflict: ScheduleConflict): Promise<void> {
    // Determine if we should release: higher instanceId loses
    const shouldRelease =
      conflict.competingInstanceId === this.deps.instanceId &&
      conflict.detectingInstanceId < this.deps.instanceId;

    if (!shouldRelease) return;

    logger.warn(
      `Conflict for feature ${conflict.featureId}: releasing claim (our id=${this.deps.instanceId} > ${conflict.detectingInstanceId})`
    );

    this.claimedFeatureIds.delete(conflict.featureId);

    // Move the feature back to backlog if we can
    if (this.deps.featureLoader && this.deps.projectPath) {
      try {
        await this.deps.featureLoader.update(this.deps.projectPath, conflict.featureId, {
          status: 'backlog',
          scheduledBy: null,
          scheduledAt: null,
        });
      } catch (err) {
        this.errorCount++;
        logger.error(`Failed to release conflicted feature ${conflict.featureId}:`, err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Public: Broadcast work_inventory (called periodically by the reactor)
  // ---------------------------------------------------------------------------

  async broadcastWorkInventory(): Promise<void> {
    if (!this.deps.featureLoader || !this.deps.projectPath) return;

    try {
      const allFeatures = await this.deps.featureLoader.getAll(this.deps.projectPath);
      const backlogFeatures = allFeatures.filter((f) => f.status === 'backlog');
      const activeFeatures = allFeatures.filter((f) => f.status === 'in_progress');

      // Sort backlog by dependency order (features with no unmet deps first)
      const orderedBacklog = this.sortByDependencyOrder(backlogFeatures, allFeatures);

      const metrics = this.deps.autoModeService?.getCapacityMetrics();
      const inventory: WorkInventory = {
        instanceId: this.deps.instanceId,
        timestamp: new Date().toISOString(),
        backlogFeatureIds: orderedBacklog.map((f) => f.id as string),
        activeFeatureIds: activeFeatures.map((f) => f.id as string),
        maxConcurrency: metrics?.maxAgents ?? 5,
        activeCount: metrics?.runningAgents ?? activeFeatures.length,
      };

      await this.deps.avaChannelService.postMessage(
        `[work_inventory] ${JSON.stringify(inventory)}`,
        'system',
        { intent: 'inform', expectsResponse: false }
      );

      logger.debug(
        `Broadcast work_inventory: backlog=${inventory.backlogFeatureIds.length} active=${inventory.activeFeatureIds.length}`
      );
    } catch (err) {
      this.errorCount++;
      logger.error('Failed to broadcast work_inventory:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Public: Check for failover (called periodically)
  // ---------------------------------------------------------------------------

  /**
   * Check if the primary is absent and this worker should take over scheduling.
   * Uses last-writer-wins: the longest-running instance becomes the new scheduler.
   */
  checkFailover(): void {
    if (this.deps.isPrimary) return; // Primary never fails over to a worker
    if (this.isActiveScheduler) {
      // Already the active scheduler — just keep going
      return;
    }

    const now = Date.now();
    const primaryAbsent = this.isPrimaryAbsent(now);
    if (!primaryAbsent) return;

    // Check if we should be the active scheduler (longest uptime among workers)
    if (this.shouldTakeOverScheduling(now)) {
      logger.info(
        `Primary absent >10min — taking over scheduling (uptime=${this.getUptimeMs()}ms)`
      );
      this.becomeActiveScheduler();
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: Scheduling
  // ---------------------------------------------------------------------------

  private startScheduleTimer(): void {
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);

    this.scheduleTimer = setInterval(() => {
      this.runScheduleCycle().catch((err) => {
        this.errorCount++;
        logger.error('Fleet schedule cycle failed:', err);
      });
    }, SCHEDULE_INTERVAL_MS);

    if (this.scheduleTimer.unref) this.scheduleTimer.unref();

    // Run an initial cycle shortly after start
    setTimeout(() => {
      this.runScheduleCycle().catch((err) => {
        this.errorCount++;
        logger.error('Initial fleet schedule cycle failed:', err);
      });
    }, 5_000);
  }

  private startHeartbeatTimer(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      if (this.isActiveScheduler) {
        this.broadcastSchedulerHeartbeat().catch((err) => {
          this.errorCount++;
          logger.error('Failed to broadcast scheduler_heartbeat:', err);
        });
      }
      this.checkFailover();
    }, HEARTBEAT_INTERVAL_MS);

    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
  }

  private async runScheduleCycle(): Promise<void> {
    if (!this.isActiveScheduler) return;

    logger.info('Running fleet schedule cycle');

    // Collect all live inventories
    const now = Date.now();
    const liveInventories: WorkInventory[] = [];

    for (const [instanceId, entry] of this.peerInventories) {
      if (now - entry.receivedAt > PEER_INVENTORY_TTL_MS) {
        this.peerInventories.delete(instanceId);
        continue;
      }
      liveInventories.push(entry.inventory);
    }

    // Include our own inventory
    const myInventory = await this.getLocalInventory();
    if (myInventory) liveInventories.push(myInventory);

    if (liveInventories.length === 0) {
      logger.debug('No inventories available — skipping schedule cycle');
      return;
    }

    // Compute optimal assignment
    const assignments = this.computeAssignment(liveInventories);

    if (Object.keys(assignments).length === 0) {
      logger.debug('No assignments to make in this cycle');
      return;
    }

    // Broadcast schedule_assignment
    const scheduleMsg: ScheduleAssignment = {
      schedulerInstanceId: this.deps.instanceId,
      timestamp: new Date().toISOString(),
      assignments,
    };

    await this.deps.avaChannelService.postMessage(
      `[schedule_assignment] ${JSON.stringify(scheduleMsg)}`,
      'system',
      { intent: 'coordination', expectsResponse: false }
    );

    logger.info(
      `Broadcast schedule_assignment: ${Object.entries(assignments)
        .map(([id, fids]) => `${id}←[${fids.join(',')}]`)
        .join(' ')}`
    );

    // Apply our own assignments immediately
    const myAssignments = assignments[this.deps.instanceId];
    if (myAssignments && myAssignments.length > 0) {
      await this.applyAssignment(myAssignments);
    }
  }

  /**
   * Compute an optimal assignment of backlog features to instances.
   *
   * Algorithm:
   * 1. Collect all unassigned backlog features (not already in any instance's activeFeatureIds)
   * 2. For each instance with spare capacity (maxConcurrency - activeCount > 0), assign features
   *    respecting dependency order and per-instance maxConcurrency.
   * 3. No feature is assigned to more than one instance.
   */
  private computeAssignment(inventories: WorkInventory[]): Record<string, string[]> {
    // Build the set of all features currently in progress across all instances
    const globallyActive = new Set<string>();
    for (const inv of inventories) {
      for (const fid of inv.activeFeatureIds) {
        globallyActive.add(fid);
      }
    }

    // All unique backlog feature IDs (preserve dependency order from the first inventory that has them)
    const backlogPool: string[] = [];
    const seen = new Set<string>();
    for (const inv of inventories) {
      for (const fid of inv.backlogFeatureIds) {
        if (!seen.has(fid) && !globallyActive.has(fid)) {
          backlogPool.push(fid);
          seen.add(fid);
        }
      }
    }

    if (backlogPool.length === 0) return {};

    const assignments: Record<string, string[]> = {};
    const assignedFeatures = new Set<string>();

    // Assign features to instances with spare capacity
    for (const inv of inventories) {
      const spare = inv.maxConcurrency - inv.activeCount;
      if (spare <= 0) continue;

      const instanceAssignments: string[] = [];
      for (const fid of backlogPool) {
        if (assignedFeatures.has(fid)) continue;
        if (instanceAssignments.length >= spare) break;

        instanceAssignments.push(fid);
        assignedFeatures.add(fid);
      }

      if (instanceAssignments.length > 0) {
        assignments[inv.instanceId] = instanceAssignments;
      }
    }

    return assignments;
  }

  /**
   * Apply assigned feature IDs: move them to in_progress and start agents.
   */
  private async applyAssignment(featureIds: string[]): Promise<void> {
    if (!this.deps.featureLoader || !this.deps.projectPath) return;

    for (const featureId of featureIds) {
      // Conflict detection: check if we already claimed this feature
      if (this.claimedFeatureIds.has(featureId)) {
        logger.debug(`Feature ${featureId} already claimed by this instance — skipping`);
        continue;
      }

      this.claimedFeatureIds.add(featureId);

      try {
        // Check if another instance has already claimed this feature (race detection)
        const allFeatures = await this.deps.featureLoader.getAll(this.deps.projectPath);
        const feature = allFeatures.find((f) => f.id === featureId);
        if (!feature) {
          logger.warn(`Assigned feature ${featureId} not found locally — skipping`);
          this.claimedFeatureIds.delete(featureId);
          continue;
        }

        const alreadyClaimedBy = feature.scheduledBy as string | undefined;
        if (alreadyClaimedBy && alreadyClaimedBy !== this.deps.instanceId) {
          // Conflict: two instances claimed the same feature
          await this.broadcastScheduleConflict(featureId, alreadyClaimedBy);

          // Lower instanceId wins — release if we should
          if (this.deps.instanceId > alreadyClaimedBy) {
            logger.warn(
              `Conflict on feature ${featureId}: releasing claim (we lose: ${this.deps.instanceId} > ${alreadyClaimedBy})`
            );
            this.claimedFeatureIds.delete(featureId);
            continue;
          }
        }

        await this.deps.featureLoader.update(this.deps.projectPath, featureId, {
          status: 'in_progress',
          scheduledBy: this.deps.instanceId,
          scheduledAt: new Date().toISOString(),
        });

        logger.info(`Moved feature ${featureId} to in_progress (scheduled by this instance)`);

        // Start an agent loop for this feature if autoModeService supports it
        if (this.deps.autoModeService?.startAutoLoopForProject) {
          const metrics = this.deps.autoModeService.getCapacityMetrics();
          await this.deps.autoModeService
            .startAutoLoopForProject(this.deps.projectPath, null, metrics.maxAgents)
            .catch((err: unknown) => {
              // May already be running — not fatal
              logger.debug(`startAutoLoopForProject: ${(err as Error).message}`);
            });
        }
      } catch (err) {
        this.errorCount++;
        logger.error(`Failed to apply assignment for feature ${featureId}:`, err);
        this.claimedFeatureIds.delete(featureId);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: Failover helpers
  // ---------------------------------------------------------------------------

  private isPrimaryAbsent(now: number): boolean {
    for (const [, entry] of this.peerHeartbeats) {
      if (entry.heartbeat.isPrimary) {
        return now - entry.receivedAt > PRIMARY_ABSENT_THRESHOLD_MS;
      }
    }
    // No primary heartbeat ever seen — treat as absent if we've been up a while
    return now - this.startTimeMs > PRIMARY_ABSENT_THRESHOLD_MS;
  }

  private shouldTakeOverScheduling(now: number): boolean {
    const myUptime = this.getUptimeMs();

    // Check if any peer worker has higher uptime (they should take over instead)
    for (const [instanceId, entry] of this.peerHeartbeats) {
      if (entry.heartbeat.isPrimary) continue;
      if (now - entry.receivedAt > PRIMARY_ABSENT_THRESHOLD_MS) continue; // Peer also gone

      if (entry.heartbeat.uptimeMs > myUptime) {
        logger.debug(
          `Peer ${instanceId} has higher uptime (${entry.heartbeat.uptimeMs}ms > ${myUptime}ms) — deferring scheduler takeover`
        );
        return false;
      }

      // Tiebreak: lower instanceId wins
      if (entry.heartbeat.uptimeMs === myUptime && instanceId < this.deps.instanceId) {
        return false;
      }
    }

    return true;
  }

  private becomeActiveScheduler(): void {
    if (this.isActiveScheduler) return;
    this.isActiveScheduler = true;
    this.startScheduleTimer();
    logger.info(`This instance (${this.deps.instanceId}) is now the active scheduler (failover)`);
  }

  private stepDownAsScheduler(): void {
    if (!this.isActiveScheduler) return;
    this.isActiveScheduler = false;
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    logger.info('Stepped down as active scheduler');
  }

  // ---------------------------------------------------------------------------
  // Internal: Heartbeat
  // ---------------------------------------------------------------------------

  private async broadcastSchedulerHeartbeat(): Promise<void> {
    const heartbeat: SchedulerHeartbeat = {
      schedulerInstanceId: this.deps.instanceId,
      timestamp: new Date().toISOString(),
      uptimeMs: this.getUptimeMs(),
      isPrimary: this.deps.isPrimary,
    };

    await this.deps.avaChannelService.postMessage(
      `[scheduler_heartbeat] ${JSON.stringify(heartbeat)}`,
      'system',
      { intent: 'inform', expectsResponse: false }
    );

    logger.debug(
      `Broadcast scheduler_heartbeat (uptime=${heartbeat.uptimeMs}ms isPrimary=${heartbeat.isPrimary})`
    );
  }

  private async broadcastScheduleConflict(
    featureId: string,
    competingInstanceId: string
  ): Promise<void> {
    const conflict: ScheduleConflict = {
      featureId,
      detectingInstanceId: this.deps.instanceId,
      competingInstanceId,
      timestamp: new Date().toISOString(),
    };

    await this.deps.avaChannelService.postMessage(
      `[schedule_conflict] ${JSON.stringify(conflict)}`,
      'system',
      { intent: 'coordination', expectsResponse: false }
    );

    logger.warn(
      `Broadcast schedule_conflict: featureId=${featureId} competing=${competingInstanceId}`
    );
  }

  // ---------------------------------------------------------------------------
  // Internal: Utilities
  // ---------------------------------------------------------------------------

  private getUptimeMs(): number {
    return Date.now() - this.startTimeMs;
  }

  private async getLocalInventory(): Promise<WorkInventory | null> {
    if (!this.deps.featureLoader || !this.deps.projectPath) return null;

    try {
      const allFeatures = await this.deps.featureLoader.getAll(this.deps.projectPath);
      const backlogFeatures = allFeatures.filter((f) => f.status === 'backlog');
      const activeFeatures = allFeatures.filter((f) => f.status === 'in_progress');
      const orderedBacklog = this.sortByDependencyOrder(backlogFeatures, allFeatures);
      const metrics = this.deps.autoModeService?.getCapacityMetrics();

      return {
        instanceId: this.deps.instanceId,
        timestamp: new Date().toISOString(),
        backlogFeatureIds: orderedBacklog.map((f) => f.id as string),
        activeFeatureIds: activeFeatures.map((f) => f.id as string),
        maxConcurrency: metrics?.maxAgents ?? 5,
        activeCount: metrics?.runningAgents ?? activeFeatures.length,
      };
    } catch (err) {
      logger.warn('Failed to compute local inventory:', err);
      return null;
    }
  }

  /**
   * Sort backlog features by dependency order: features with no unmet dependencies come first.
   * Uses a simple topological sort (Kahn's algorithm subset — only the ready set).
   */
  private sortByDependencyOrder(
    backlogFeatures: Array<{ id?: string; dependencies?: string[]; [key: string]: unknown }>,
    allFeatures: Array<{ id?: string; status?: string; [key: string]: unknown }>
  ): Array<{ id?: string; dependencies?: string[]; [key: string]: unknown }> {
    const doneStatuses = new Set(['done', 'review']);
    const doneIds = new Set(
      allFeatures
        .filter((f) => typeof f.status === 'string' && doneStatuses.has(f.status))
        .map((f) => f.id)
        .filter((id): id is string => typeof id === 'string')
    );
    const inProgressIds = new Set(
      allFeatures
        .filter((f) => f.status === 'in_progress')
        .map((f) => f.id)
        .filter((id): id is string => typeof id === 'string')
    );

    // Features whose dependencies are all done or in_progress (unblocked)
    const ready: typeof backlogFeatures = [];
    const blocked: typeof backlogFeatures = [];

    for (const f of backlogFeatures) {
      const deps = f.dependencies ?? [];
      const allSatisfied = deps.every((depId) => doneIds.has(depId) || inProgressIds.has(depId));
      if (allSatisfied) {
        ready.push(f);
      } else {
        blocked.push(f);
      }
    }

    return [...ready, ...blocked];
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  getStatus(): {
    isActiveScheduler: boolean;
    isPrimary: boolean;
    peerInventoryCount: number;
    claimedFeatureCount: number;
    errorCount: number;
  } {
    return {
      isActiveScheduler: this.isActiveScheduler,
      isPrimary: this.deps.isPrimary,
      peerInventoryCount: this.peerInventories.size,
      claimedFeatureCount: this.claimedFeatureIds.size,
      errorCount: this.errorCount,
    };
  }
}
