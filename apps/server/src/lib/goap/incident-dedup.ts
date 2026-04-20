/**
 * Incident Deduplication — prevents duplicate incident filing in GOAP feedback loops.
 *
 * Before creating a new incident, checks for existing open incidents with matching
 * agent+skill composite key. Returns the existing incident ID if found, preventing
 * duplicate INC filing.
 *
 * Also tracks resolved incidents and enforces a post-resolution cooldown window per
 * (goalId, agentId) pair to prevent re-dispatch after a condition is fully resolved.
 */

import { createLogger } from '@protolabsai/utils';

const logger = createLogger('IncidentDedup');

export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed';

export interface TrackedIncident {
  id: string;
  agentId: string;
  skillId: string;
  /** GOAP goal name for resolved-cooldown tracking (e.g. "fleet.no_agent_stuck") */
  goalId?: string;
  status: IncidentStatus;
  createdAt: number;
  updatedAt: number;
  /** Timestamp when the incident was resolved/closed */
  resolvedAt?: number;
  duplicateCount: number;
}

export interface DedupCheckResult {
  isDuplicate: boolean;
  existingIncident?: TrackedIncident;
}

export interface ResolvedCooldownCheckResult {
  suppressed: boolean;
  reason?: string;
  remainingMs?: number;
  resolvedAt?: number;
}

export interface ResolvedCooldownEntry {
  key: string;
  resolvedAt: number;
}

export class IncidentDedup {
  /** Primary store: incident ID -> TrackedIncident */
  private incidents = new Map<string, TrackedIncident>();

  /** Dedup index: composite key (agentId:skillId) -> incident ID for open incidents */
  private openIndex = new Map<string, string>();

  /** Resolved-incident cooldown index: (goalId:agentId) -> resolvedAt timestamp */
  private resolvedIndex = new Map<string, number>();

  /**
   * Build composite dedup key from agent+skill identifiers.
   */
  static buildKey(agentId: string, skillId: string): string {
    return `${agentId}:${skillId}`;
  }

  /**
   * Check if an open incident already exists for this agent+skill combination.
   */
  checkForExisting(agentId: string, skillId: string): DedupCheckResult {
    const key = IncidentDedup.buildKey(agentId, skillId);
    const existingId = this.openIndex.get(key);

    if (existingId) {
      const incident = this.incidents.get(existingId);
      if (incident && (incident.status === 'open' || incident.status === 'investigating')) {
        incident.duplicateCount++;
        incident.updatedAt = Date.now();
        logger.warn(
          `Duplicate incident suppressed for ${key}: existing ${incident.id} ` +
            `(${incident.duplicateCount} duplicates suppressed)`
        );
        return { isDuplicate: true, existingIncident: incident };
      }
      // Stale index entry — clean up
      this.openIndex.delete(key);
    }

    return { isDuplicate: false };
  }

  /**
   * Register a new incident. Adds to both primary store and dedup index.
   * Include `goalId` to enable resolved-cooldown tracking for this incident.
   */
  registerIncident(
    incident: Omit<TrackedIncident, 'duplicateCount' | 'updatedAt'>
  ): TrackedIncident {
    const key = IncidentDedup.buildKey(incident.agentId, incident.skillId);

    // Check for existing open incident first
    const existing = this.checkForExisting(incident.agentId, incident.skillId);
    if (existing.isDuplicate && existing.existingIncident) {
      logger.info(
        `Returning existing incident ${existing.existingIncident.id} instead of creating duplicate`
      );
      return existing.existingIncident;
    }

    const tracked: TrackedIncident = {
      ...incident,
      duplicateCount: 0,
      updatedAt: incident.createdAt,
    };

    this.incidents.set(incident.id, tracked);
    if (tracked.status === 'open' || tracked.status === 'investigating') {
      this.openIndex.set(key, incident.id);
    }

    logger.debug(`Incident registered: ${incident.id} for ${key}`);
    return tracked;
  }

  /**
   * Resolve an incident. Removes from dedup index so future incidents can be filed.
   * If the incident has a `goalId`, records the resolution time in the resolved-cooldown
   * index to suppress re-dispatch for (goalId, agentId) within the cooldown window.
   */
  resolveIncident(id: string, status: 'resolved' | 'closed' = 'resolved'): boolean {
    const incident = this.incidents.get(id);
    if (!incident) return false;

    const now = Date.now();
    incident.status = status;
    incident.updatedAt = now;
    incident.resolvedAt = now;

    const key = IncidentDedup.buildKey(incident.agentId, incident.skillId);
    if (this.openIndex.get(key) === id) {
      this.openIndex.delete(key);
    }

    // Record in resolved-cooldown index if we have a goalId
    if (incident.goalId) {
      const resolvedKey = `${incident.goalId}:${incident.agentId}`;
      this.resolvedIndex.set(resolvedKey, now);
      logger.debug(`Resolved-cooldown recorded for "${resolvedKey}"`);
    }

    logger.info(`Incident resolved: ${id} (status: ${status})`);
    return true;
  }

  /**
   * Check if a (goalId, agentId) pair is within the post-resolution cooldown window.
   * Returns suppressed=true if a prior incident for this pair was resolved within cooldownMs.
   */
  checkResolvedCooldown(
    goalId: string,
    agentId: string,
    cooldownMs: number,
    now = Date.now()
  ): ResolvedCooldownCheckResult {
    const key = `${goalId}:${agentId}`;
    const resolvedAt = this.resolvedIndex.get(key);
    if (resolvedAt === undefined) {
      return { suppressed: false };
    }

    const elapsed = now - resolvedAt;
    if (elapsed < cooldownMs) {
      const remainingMs = cooldownMs - elapsed;
      logger.warn(
        `Resolved-incident cooldown active for "${key}": resolved ${Math.floor(elapsed / 1000)}s ago, ` +
          `${Math.ceil(remainingMs / 1000)}s remaining`
      );
      return {
        suppressed: true,
        reason:
          `Resolved-incident cooldown: "${key}" resolved ${Math.floor(elapsed / 1000)}s ago ` +
          `(${Math.ceil(remainingMs / 1000)}s remaining)`,
        remainingMs,
        resolvedAt,
      };
    }

    // Cooldown expired — prune stale entry
    this.resolvedIndex.delete(key);
    return { suppressed: false };
  }

  /**
   * Get all active resolved-cooldown entries.
   */
  getResolvedCooldownEntries(): ResolvedCooldownEntry[] {
    return Array.from(this.resolvedIndex.entries()).map(([key, resolvedAt]) => ({
      key,
      resolvedAt,
    }));
  }

  /**
   * Get all open incidents.
   */
  getOpenIncidents(): TrackedIncident[] {
    return Array.from(this.incidents.values()).filter(
      (i) => i.status === 'open' || i.status === 'investigating'
    );
  }

  /**
   * Get incident by ID.
   */
  getIncident(id: string): TrackedIncident | undefined {
    return this.incidents.get(id);
  }

  /**
   * Get total suppressed duplicate count across all incidents.
   */
  getTotalSuppressedCount(): number {
    let total = 0;
    for (const incident of this.incidents.values()) {
      total += incident.duplicateCount;
    }
    return total;
  }

  /**
   * Clear all tracking data (admin/testing).
   */
  clear(): void {
    this.incidents.clear();
    this.openIndex.clear();
    this.resolvedIndex.clear();
  }
}
