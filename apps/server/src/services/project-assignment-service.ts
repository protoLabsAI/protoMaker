/**
 * ProjectAssignmentService — manages project-to-instance assignment.
 *
 * Methods:
 *   assignProject               — write assignedTo/assignedAt/assignedBy to project
 *   unassignProject             — clear assignment fields
 *   getAssignments              — list all project assignments for a projectPath
 *   getMyAssignedProjects       — list projects assigned to this instance
 *   claimPreferredProjects      — boot-time: claim unassigned preferred projects from proto.config.yaml
 *   reassignOrphanedProjects    — detect stale heartbeats (>120s) and auto-claim orphans
 *   startPeriodicFailoverCheck  — start a 60s interval that auto-claims orphaned projects
 *   stopPeriodicFailoverCheck   — stop the periodic failover check
 */

import { createLogger } from '@protolabsai/utils';
import { loadProtoConfig } from '@protolabsai/platform';
import type { Project, UpdateProjectInput } from '@protolabsai/types';
import type { ProjectService } from './project-service.js';
import type { CrdtSyncService } from './crdt-sync-service.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('ProjectAssignmentService');

/** TTL threshold in milliseconds for considering a peer's heartbeat stale */
const ORPHAN_TTL_MS = 120_000;

/** Interval in milliseconds for the periodic failover check */
const FAILOVER_CHECK_INTERVAL_MS = 60_000;

export interface ProjectAssignment {
  projectSlug: string;
  assignedTo: string;
  assignedAt: string;
  assignedBy: string;
}

export class ProjectAssignmentService {
  private failoverCheckInterval: ReturnType<typeof setInterval> | null = null;
  private failoverProjectPath: string | null = null;

  constructor(
    private readonly projectService: ProjectService,
    private readonly crdtSyncService: CrdtSyncService,
    private readonly eventEmitter?: EventEmitter
  ) {}

  // ─── Core Assignment Operations ─────────────────────────────────────────

  /**
   * Assign a project to an instance.
   * Writes assignedTo, assignedAt, and assignedBy to the project via ProjectService.
   */
  async assignProject(
    projectPath: string,
    projectSlug: string,
    assignedTo: string,
    assignedBy: string
  ): Promise<Project | null> {
    const updates: UpdateProjectInput = {
      assignedTo,
      assignedAt: new Date().toISOString(),
      assignedBy,
    };
    const updated = await this.projectService.updateProject(projectPath, projectSlug, updates);

    if (updated) {
      logger.info(
        `[ASSIGN] Assigned project "${projectSlug}" to "${assignedTo}" (by "${assignedBy}")`
      );
    }
    return updated;
  }

  /**
   * Clear the assignment fields on a project.
   */
  async unassignProject(projectPath: string, projectSlug: string): Promise<Project | null> {
    const updates: UpdateProjectInput = {
      assignedTo: undefined,
      assignedAt: undefined,
      assignedBy: undefined,
    };
    const updated = await this.projectService.updateProject(projectPath, projectSlug, updates);

    if (updated) {
      logger.info(`[ASSIGN] Unassigned project "${projectSlug}"`);
    }
    return updated;
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  /**
   * Return the assignment record for every assigned project in a projectPath.
   */
  async getAssignments(projectPath: string): Promise<ProjectAssignment[]> {
    const slugs = await this.projectService.listProjects(projectPath);
    const assignments: ProjectAssignment[] = [];

    await Promise.all(
      slugs.map(async (slug) => {
        const project = await this.projectService.getProject(projectPath, slug);
        if (project?.assignedTo) {
          assignments.push({
            projectSlug: slug,
            assignedTo: project.assignedTo,
            assignedAt: project.assignedAt ?? new Date().toISOString(),
            assignedBy: project.assignedBy ?? 'unknown',
          });
        }
      })
    );

    return assignments;
  }

  /**
   * Return all projects assigned to this instance.
   */
  async getMyAssignedProjects(projectPath: string): Promise<Project[]> {
    const instanceId = this.crdtSyncService.getInstanceId();
    const slugs = await this.projectService.listProjects(projectPath);
    const mine: Project[] = [];

    await Promise.all(
      slugs.map(async (slug) => {
        const project = await this.projectService.getProject(projectPath, slug);
        if (project?.assignedTo === instanceId) {
          mine.push(project);
        }
      })
    );

    return mine;
  }

  // ─── Boot-time claiming ──────────────────────────────────────────────────

  /**
   * Read proto.config.yaml projectPreferences.preferredProjects and claim any
   * that are currently unassigned. Called once at server startup.
   */
  async claimPreferredProjects(projectPath: string): Promise<string[]> {
    const instanceId = this.crdtSyncService.getInstanceId();
    const protoConfig = await loadProtoConfig(projectPath);

    const projectPreferences = protoConfig?.['projectPreferences'] as
      | { preferredProjects?: string[] }
      | undefined;

    const preferredSlugs = projectPreferences?.preferredProjects ?? [];
    if (preferredSlugs.length === 0) {
      logger.debug('[ASSIGN] No preferred projects configured — skipping boot-time claim');
      return [];
    }

    const claimed: string[] = [];

    for (const slug of preferredSlugs) {
      try {
        const project = await this.projectService.getProject(projectPath, slug);
        if (!project) {
          logger.warn(`[ASSIGN] Preferred project "${slug}" not found — skipping`);
          continue;
        }
        if (project.assignedTo) {
          logger.debug(
            `[ASSIGN] Preferred project "${slug}" already assigned to "${project.assignedTo}" — skipping`
          );
          continue;
        }
        await this.assignProject(projectPath, slug, instanceId, instanceId);
        claimed.push(slug);
        logger.info(`[ASSIGN] Claimed preferred project "${slug}" at boot`);
      } catch (err) {
        logger.warn(`[ASSIGN] Failed to claim preferred project "${slug}":`, err);
      }
    }

    return claimed;
  }

  // ─── Orphan reassignment ─────────────────────────────────────────────────

  /**
   * Detect projects assigned to peers with stale heartbeats (>120s) and claim
   * them for this instance. Uses 'auto-failover' as the assignedBy value so
   * the source of the claim is distinguishable from manual assignments.
   *
   * NOTE: When the original instance recovers, it will NOT auto-reclaim its
   * old projects — a human operator or Ava must explicitly reassign.
   */
  async reassignOrphanedProjects(projectPath: string): Promise<string[]> {
    const instanceId = this.crdtSyncService.getInstanceId();
    const peers = this.crdtSyncService.getPeers();
    const now = Date.now();

    // Collect instance IDs with stale heartbeats, along with their staleness
    const stalePeers = new Map<string, number>(); // instanceId → stalenessMs
    for (const peer of peers) {
      const lastSeen = new Date(peer.lastSeen).getTime();
      const stalenessMs = now - lastSeen;
      if (stalenessMs > ORPHAN_TTL_MS) {
        stalePeers.set(peer.identity.instanceId, stalenessMs);
        logger.warn(
          `[ASSIGN] Peer "${peer.identity.instanceId}" heartbeat stale (${stalenessMs}ms ago) — marking as orphan candidate`
        );
      }
    }

    if (stalePeers.size === 0) {
      return [];
    }

    const slugs = await this.projectService.listProjects(projectPath);
    const reassigned: string[] = [];

    for (const slug of slugs) {
      try {
        const project = await this.projectService.getProject(projectPath, slug);
        if (!project?.assignedTo) continue;
        if (project.assignedTo === instanceId) continue;
        if (!stalePeers.has(project.assignedTo)) continue;

        const previousOwner = project.assignedTo;
        const stalenessMs = stalePeers.get(previousOwner)!;

        await this.assignProject(projectPath, slug, instanceId, 'auto-failover');
        reassigned.push(slug);

        logger.info(
          `[ASSIGN] Failover: claimed orphaned project "${slug}" from "${previousOwner}" (stale ${stalenessMs}ms) to "${instanceId}"`
        );

        // Emit observability event
        this.eventEmitter?.emit('project:failover', {
          projectSlug: slug,
          projectPath,
          previousOwner,
          newOwner: instanceId,
          stalenessMs,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        logger.warn(`[ASSIGN] Failed to reassign orphaned project "${slug}":`, err);
      }
    }

    return reassigned;
  }

  // ─── Periodic failover check ─────────────────────────────────────────────

  /**
   * Start a periodic check (every 60s) that detects and auto-claims orphaned
   * projects. Safe to call multiple times — clears any existing interval first.
   *
   * @param projectPath The project root path to scan for orphaned assignments.
   */
  startPeriodicFailoverCheck(projectPath: string): void {
    this.stopPeriodicFailoverCheck();

    this.failoverProjectPath = projectPath;
    this.failoverCheckInterval = setInterval(() => {
      this.reassignOrphanedProjects(projectPath).catch((err) => {
        logger.error('[ASSIGN] Periodic failover check failed:', err);
      });
    }, FAILOVER_CHECK_INTERVAL_MS);

    logger.info(
      `[ASSIGN] Periodic failover check started (interval=${FAILOVER_CHECK_INTERVAL_MS}ms, projectPath="${projectPath}")`
    );
  }

  /**
   * Stop the periodic failover check started by startPeriodicFailoverCheck().
   * Safe to call even if the check was never started.
   */
  stopPeriodicFailoverCheck(): void {
    if (this.failoverCheckInterval !== null) {
      clearInterval(this.failoverCheckInterval);
      this.failoverCheckInterval = null;
      logger.info('[ASSIGN] Periodic failover check stopped');
    }
    this.failoverProjectPath = null;
  }
}
