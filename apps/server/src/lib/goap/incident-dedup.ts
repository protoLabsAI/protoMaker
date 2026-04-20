/**
 * Incident Deduplication — prevents duplicate incident filing in GOAP feedback loops.
 *
 * Before creating a new incident, checks for existing open incidents with matching
 * agent+skill composite key. Returns the existing incident ID if found, preventing
 * duplicate INC filing.
 */

import { createLogger } from '@protolabsai/utils';

const logger = createLogger('IncidentDedup');

export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed';

export interface TrackedIncident {
  id: string;
  agentId: string;
  skillId: string;
  status: IncidentStatus;
  createdAt: number;
  updatedAt: number;
  duplicateCount: number;
}

export interface DedupCheckResult {
  isDuplicate: boolean;
  existingIncident?: TrackedIncident;
}

export class IncidentDedup {
  /** Primary store: incident ID -> TrackedIncident */
  private incidents = new Map<string, TrackedIncident>();

  /** Dedup index: composite key (agentId:skillId) -> incident ID for open incidents */
  private openIndex = new Map<string, string>();

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
   */
  resolveIncident(id: string, status: 'resolved' | 'closed' = 'resolved'): boolean {
    const incident = this.incidents.get(id);
    if (!incident) return false;

    incident.status = status;
    incident.updatedAt = Date.now();

    const key = IncidentDedup.buildKey(incident.agentId, incident.skillId);
    if (this.openIndex.get(key) === id) {
      this.openIndex.delete(key);
    }

    logger.info(`Incident resolved: ${id} (status: ${status})`);
    return true;
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
  }
}
