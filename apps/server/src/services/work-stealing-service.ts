/**
 * WorkStealingService — cross-instance feature assignment via work stealing.
 *
 * When an instance's backlog empties, it broadcasts a WORK_REQUEST to all
 * connected peers. Busy peers respond with a WORK_OFFER containing stealable
 * features. The requesting instance accepts an offer by updating the feature's
 * assignedInstance field via the feature:updated CRDT event, making it
 * visible to all peers.
 *
 * Handshake lifecycle:
 *   idle instance → WORK_REQUEST (broadcast via CRDT)
 *   busy peers    → WORK_OFFER   (broadcast via CRDT, filtered by strategy)
 *   idle instance → WORK_ACCEPT  (broadcast via CRDT, clears offer)
 *   feature:updated propagates assignedInstance change to all instances
 *
 * Persistence: requests and offers are written to `.automaker/assignments.json`
 * with TTL timestamps. On reconnect, stale records are ignored and valid
 * pending offers are re-processed.
 */

import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@protolabsai/utils';
import { getAutomakerDir } from '@protolabsai/platform';
import { loadProtoConfig } from '@protolabsai/platform';
import type { Feature } from '@protolabsai/types';
import type { ProtoWorkStealing } from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';
import { FeatureLoader } from './feature-loader.js';

const logger = createLogger('WorkStealing');

// ---------------------------------------------------------------------------
// Internal record types for the assignments document
// ---------------------------------------------------------------------------

/** A pending work request from an idle instance. */
export interface WorkRequest {
  type: 'request';
  requestId: string;
  instanceId: string;
  timestamp: string;
  expiresAt: string;
  projectPath: string;
}

/** A work offer from a busy peer in response to a WORK_REQUEST. */
export interface WorkOffer {
  type: 'offer';
  offerId: string;
  requestId: string;
  offeringInstanceId: string;
  requestingInstanceId: string;
  timestamp: string;
  expiresAt: string;
  projectPath: string;
  featureIds: string[];
}

/** An acceptance of a specific WORK_OFFER by the requesting instance. */
export interface WorkAccept {
  type: 'accept';
  acceptId: string;
  offerId: string;
  instanceId: string;
  timestamp: string;
  projectPath: string;
  featureIds: string[];
}

/** Discriminated union for all assignment document record types. */
export type AssignmentRecord = WorkRequest | WorkOffer | WorkAccept;

/** Persisted assignments document — the local CRDT-like store. */
interface AssignmentsDocument {
  version: 1;
  records: AssignmentRecord[];
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Work-stealing event payloads (sent via EventBus → CRDT sync)
// ---------------------------------------------------------------------------

export interface WorkStealingRequestPayload {
  requestId: string;
  instanceId: string;
  timestamp: string;
  expiresAt: string;
  projectPath: string;
}

export interface WorkStealingOfferPayload {
  offerId: string;
  requestId: string;
  offeringInstanceId: string;
  requestingInstanceId: string;
  timestamp: string;
  expiresAt: string;
  projectPath: string;
  featureIds: string[];
}

export interface WorkStealingAcceptPayload {
  acceptId: string;
  offerId: string;
  instanceId: string;
  timestamp: string;
  projectPath: string;
  featureIds: string[];
}

// ---------------------------------------------------------------------------
// WorkStealingService
// ---------------------------------------------------------------------------

export class WorkStealingService {
  private instanceId: string;
  private events: EventEmitter;
  private featureLoader: FeatureLoader;
  private config: ProtoWorkStealing = { strategy: 'capacity', stealMax: 3, offerTtlMs: 60_000 };
  private initialized = false;

  // Suppress duplicate requests: track last request time per project
  private lastRequestTime = new Map<string, number>();
  // Minimum interval between consecutive WORK_REQUESTs for the same project
  private readonly REQUEST_COOLDOWN_MS = 10_000;

  constructor(events: EventEmitter, featureLoader?: FeatureLoader) {
    this.instanceId = os.hostname();
    this.events = events;
    this.featureLoader = featureLoader ?? new FeatureLoader();
  }

  /**
   * Load work-stealing config from proto.config.yaml for the given project.
   * Must be called before the service handles any events for that project.
   */
  async configure(projectPath: string): Promise<void> {
    try {
      // loadProtoConfig returns ProtoConfig with [key: string]: unknown
      const proto = (await loadProtoConfig(projectPath)) as Record<string, unknown> | null;
      const ws = proto?.workStealing as
        | { strategy?: string; stealMax?: number; offerTtlMs?: number }
        | undefined;
      if (ws) {
        this.config = {
          strategy: (ws.strategy as ProtoWorkStealing['strategy']) ?? 'capacity',
          stealMax: ws.stealMax ?? 3,
          offerTtlMs: ws.offerTtlMs ?? 60_000,
        };
      }
    } catch {
      // Use defaults if config cannot be loaded
    }
    this.initialized = true;
  }

  /**
   * Register EventBus listeners for incoming work-stealing messages from peers.
   * Peers broadcast these events via the CRDT sync channel (CRDT_SYNCED_EVENT_TYPES).
   * Must be called once, before the service starts.
   */
  registerHandlers(): void {
    this.events.on('work_stealing:request', (payload) => {
      void this._handleRequest(payload as unknown as WorkStealingRequestPayload);
    });

    this.events.on('work_stealing:offer', (payload) => {
      void this._handleOffer(payload as unknown as WorkStealingOfferPayload);
    });

    this.events.on('work_stealing:accept', (payload) => {
      void this._handleAccept(payload as unknown as WorkStealingAcceptPayload);
    });
  }

  /**
   * Broadcast a WORK_REQUEST when this instance's backlog for the given project
   * hits zero. No-op when strategy is 'manual' or within cooldown period.
   */
  async requestWork(projectPath: string): Promise<void> {
    if (!this.initialized) {
      await this.configure(projectPath);
    }

    if (this.config.strategy === 'manual') {
      logger.debug('[WorkStealing] Strategy is manual, skipping work request');
      return;
    }

    // Cooldown: don't spam requests
    const lastRequest = this.lastRequestTime.get(projectPath) ?? 0;
    if (Date.now() - lastRequest < this.REQUEST_COOLDOWN_MS) {
      logger.debug('[WorkStealing] Request cooldown active, skipping');
      return;
    }
    this.lastRequestTime.set(projectPath, Date.now());

    const now = new Date();
    const request: WorkRequest = {
      type: 'request',
      requestId: randomUUID(),
      instanceId: this.instanceId,
      timestamp: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.config.offerTtlMs).toISOString(),
      projectPath,
    };

    logger.info(
      `[WorkStealing] Broadcasting WORK_REQUEST ${request.requestId} for project ${projectPath}`
    );

    await this._persistRecord(projectPath, request);

    const payload: WorkStealingRequestPayload = {
      requestId: request.requestId,
      instanceId: request.instanceId,
      timestamp: request.timestamp,
      expiresAt: request.expiresAt,
      projectPath,
    };

    // broadcast() — goes through CRDT sync to all peers
    this.events.broadcast('work_stealing:request', payload);
  }

  // ---------------------------------------------------------------------------
  // Private: Incoming message handlers
  // ---------------------------------------------------------------------------

  private async _handleRequest(payload: WorkStealingRequestPayload): Promise<void> {
    // Ignore our own requests (CRDT may echo back)
    if (payload.instanceId === this.instanceId) return;

    // Ignore expired requests
    if (new Date(payload.expiresAt).getTime() < Date.now()) {
      logger.debug(`[WorkStealing] Ignoring expired WORK_REQUEST ${payload.requestId}`);
      return;
    }

    if (!this.initialized) {
      await this.configure(payload.projectPath);
    }

    if (this.config.strategy === 'manual') {
      logger.debug('[WorkStealing] Strategy is manual, not responding to work request');
      return;
    }

    logger.info(
      `[WorkStealing] Received WORK_REQUEST ${payload.requestId} from ${payload.instanceId}`
    );

    // Gather stealable features
    const features = await this._getStealableFeatures(
      payload.projectPath,
      payload.instanceId,
      this.config.stealMax
    );

    if (features.length === 0) {
      logger.debug('[WorkStealing] No stealable features available, not sending offer');
      return;
    }

    const now = new Date();
    const offer: WorkOffer = {
      type: 'offer',
      offerId: randomUUID(),
      requestId: payload.requestId,
      offeringInstanceId: this.instanceId,
      requestingInstanceId: payload.instanceId,
      timestamp: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.config.offerTtlMs).toISOString(),
      projectPath: payload.projectPath,
      featureIds: features.map((f) => f.id),
    };

    logger.info(
      `[WorkStealing] Sending WORK_OFFER ${offer.offerId} with ${features.length} feature(s) to ${payload.instanceId}`
    );

    await this._persistRecord(payload.projectPath, offer);

    const offerPayload: WorkStealingOfferPayload = {
      offerId: offer.offerId,
      requestId: offer.requestId,
      offeringInstanceId: offer.offeringInstanceId,
      requestingInstanceId: offer.requestingInstanceId,
      timestamp: offer.timestamp,
      expiresAt: offer.expiresAt,
      projectPath: offer.projectPath,
      featureIds: offer.featureIds,
    };

    this.events.broadcast('work_stealing:offer', offerPayload);
  }

  private async _handleOffer(payload: WorkStealingOfferPayload): Promise<void> {
    // Only accept offers intended for this instance
    if (payload.requestingInstanceId !== this.instanceId) return;

    // Ignore expired offers
    if (new Date(payload.expiresAt).getTime() < Date.now()) {
      logger.debug(`[WorkStealing] Ignoring expired WORK_OFFER ${payload.offerId}`);
      return;
    }

    logger.info(
      `[WorkStealing] Received WORK_OFFER ${payload.offerId} from ${payload.offeringInstanceId} with features: ${payload.featureIds.join(', ')}`
    );

    // Accept all offered features (up to stealMax)
    const toAccept = payload.featureIds.slice(0, this.config.stealMax);

    // Update each feature's assignedInstance via feature:updated CRDT event
    const accepted: string[] = [];
    for (const featureId of toAccept) {
      try {
        await this.featureLoader.update(payload.projectPath, featureId, {
          assignedInstance: this.instanceId,
          // Keep status as backlog so the local auto-mode loop picks it up
        });
        accepted.push(featureId);
        logger.info(
          `[WorkStealing] Accepted feature ${featureId} — assigned to ${this.instanceId}`
        );
      } catch (err) {
        logger.warn(`[WorkStealing] Failed to accept feature ${featureId}:`, err);
      }
    }

    if (accepted.length === 0) return;

    const now = new Date();
    const accept: WorkAccept = {
      type: 'accept',
      acceptId: randomUUID(),
      offerId: payload.offerId,
      instanceId: this.instanceId,
      timestamp: now.toISOString(),
      projectPath: payload.projectPath,
      featureIds: accepted,
    };

    await this._persistRecord(payload.projectPath, accept);

    const acceptPayload: WorkStealingAcceptPayload = {
      acceptId: accept.acceptId,
      offerId: accept.offerId,
      instanceId: accept.instanceId,
      timestamp: accept.timestamp,
      projectPath: accept.projectPath,
      featureIds: accept.featureIds,
    };

    this.events.broadcast('work_stealing:accept', acceptPayload);
  }

  private async _handleAccept(payload: WorkStealingAcceptPayload): Promise<void> {
    // Ignore our own accepts
    if (payload.instanceId === this.instanceId) return;

    logger.info(
      `[WorkStealing] Instance ${payload.instanceId} accepted ${payload.featureIds.length} feature(s) from offer ${payload.offerId}`
    );

    await this._persistRecord(payload.projectPath, {
      type: 'accept',
      acceptId: payload.acceptId,
      offerId: payload.offerId,
      instanceId: payload.instanceId,
      timestamp: payload.timestamp,
      projectPath: payload.projectPath,
      featureIds: payload.featureIds,
    } as WorkAccept);
  }

  // ---------------------------------------------------------------------------
  // Private: Feature selection for offers
  // ---------------------------------------------------------------------------

  /**
   * Return stealable features from this instance's backlog, applying the
   * configured strategy filter.
   *
   * - capacity: return up to stealMax backlog features (no domain filter)
   * - domain: only return features whose filesToModify or domain match
   *   the requesting instance's registered domains
   * - manual: never return any features (handled upstream)
   */
  private async _getStealableFeatures(
    projectPath: string,
    requestingInstanceId: string,
    max: number
  ): Promise<Feature[]> {
    let allFeatures: Feature[] = [];
    try {
      allFeatures = await this.featureLoader.getAll(projectPath);
    } catch (err) {
      logger.warn('[WorkStealing] Failed to load features for offer:', err);
      return [];
    }

    // Only offer backlog features that are:
    // - stealable !== false
    // - not already assigned to another instance
    // - not claimed by anyone
    const candidates = allFeatures.filter((f) => {
      const status = f.status ?? 'backlog';
      if (status !== 'backlog' && status !== 'pending' && status !== 'ready') return false;
      if (f.stealable === false) return false;
      if (f.assignedInstance && f.assignedInstance !== this.instanceId) return false;
      if (f.claimedBy) return false;
      if (f.assignee && f.assignee !== 'agent' && f.assignee !== null) return false;
      return true;
    });

    if (candidates.length === 0) return [];

    if (this.config.strategy === 'domain') {
      return this._filterByDomain(candidates, projectPath, requestingInstanceId, max);
    }

    // capacity strategy: return first N candidates (sorted by priority)
    return candidates.sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3)).slice(0, max);
  }

  /**
   * Domain strategy filter: only offer features whose filesToModify or domain
   * field matches a domain registered by the requesting instance in proto.config.
   */
  private _filterByDomain(
    candidates: Feature[],
    _projectPath: string,
    requestingInstanceId: string,
    max: number
  ): Feature[] {
    // Load instance domains from proto.config at filter time would be async —
    // for now, use a heuristic: check if feature.domain matches a domain pattern
    // that includes the requestingInstanceId prefix, or if filesToModify has a
    // domain prefix. This is a best-effort domain filter; full implementation
    // would require loading the requesting instance's HivemindConfig.
    //
    // The feature.domain field (e.g. "frontend", "server") is used directly.
    // Since we don't have the requesting instance's domain list at this point,
    // we filter to features that have no explicit domain set (domain-agnostic)
    // OR whose domain matches a segment of the requesting instance ID.
    const instanceSegments = requestingInstanceId.toLowerCase().split(/[-_.]/);

    const matched = candidates.filter((f) => {
      if (!f.domain) return true; // No domain constraint — safe to offer
      const featureDomain = f.domain.toLowerCase();
      return instanceSegments.some((seg) => seg.length > 2 && featureDomain.includes(seg));
    });

    return matched.sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3)).slice(0, max);
  }

  // ---------------------------------------------------------------------------
  // Private: Assignments document persistence
  // ---------------------------------------------------------------------------

  private _getAssignmentsPath(projectPath: string): string {
    return path.join(getAutomakerDir(projectPath), 'assignments.json');
  }

  private async _loadAssignments(projectPath: string): Promise<AssignmentsDocument> {
    const filePath = this._getAssignmentsPath(projectPath);
    const result = await readJsonWithRecovery<AssignmentsDocument>(filePath, null);
    const data = result.data;
    if (data && data.version === 1 && Array.isArray(data.records)) {
      return data;
    }
    return { version: 1, records: [], updatedAt: new Date().toISOString() };
  }

  private async _persistRecord(projectPath: string, record: AssignmentRecord): Promise<void> {
    try {
      const doc = await this._loadAssignments(projectPath);
      const now = Date.now();

      // Expire stale records
      doc.records = doc.records.filter((r) => {
        if (r.type === 'accept') return true; // Accepts are permanent audit trail
        const expiresAt = 'expiresAt' in r ? new Date(r.expiresAt).getTime() : Infinity;
        return expiresAt > now;
      });

      doc.records.push(record);
      doc.updatedAt = new Date().toISOString();

      await atomicWriteJson(this._getAssignmentsPath(projectPath), doc);
    } catch (err) {
      logger.warn('[WorkStealing] Failed to persist assignment record:', err);
    }
  }

  /**
   * Replay pending work requests from the assignments document.
   * Called after reconnect to re-offer any features for outstanding requests
   * that arrived while this instance was disconnected.
   */
  async replayPendingRequests(projectPath: string): Promise<void> {
    if (this.config.strategy === 'manual') return;

    const doc = await this._loadAssignments(projectPath);
    const now = Date.now();

    const pendingRequests = doc.records.filter(
      (r): r is WorkRequest =>
        r.type === 'request' &&
        r.instanceId !== this.instanceId &&
        new Date(r.expiresAt).getTime() > now
    );

    // Check which requests have already been accepted
    const acceptedOfferIds = new Set(
      doc.records.filter((r): r is WorkAccept => r.type === 'accept').map((r) => r.offerId)
    );

    const offeredRequestIds = new Set(
      doc.records
        .filter(
          (r): r is WorkOffer => r.type === 'offer' && r.offeringInstanceId === this.instanceId
        )
        .filter((r) => !acceptedOfferIds.has(r.offerId))
        .map((r) => r.requestId)
    );

    for (const request of pendingRequests) {
      if (offeredRequestIds.has(request.requestId)) continue;
      logger.info(
        `[WorkStealing] Replaying pending request ${request.requestId} from ${request.instanceId}`
      );
      await this._handleRequest({
        requestId: request.requestId,
        instanceId: request.instanceId,
        timestamp: request.timestamp,
        expiresAt: request.expiresAt,
        projectPath: request.projectPath,
      });
    }
  }
}
