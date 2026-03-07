/**
 * EventLedgerService — Append-only JSONL event persistence layer.
 *
 * Writes discrete system events to `.automaker/ledger/events.jsonl`.
 * Each entry has a unique ID, timestamp, eventType, correlationIds, payload, and source.
 *
 * Writes are fire-and-forget: `append()` returns void and never blocks the caller.
 * Duplicate event IDs are silently skipped (idempotent).
 *
 * Provides query methods for reading entries back by featureId, projectSlug,
 * time range, or eventType.
 *
 * Call `subscribeToLifecycleEvents(events)` to wire up all 13 lifecycle event subscriptions.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { createLogger } from '@protolabsai/utils';
import type { EventLedgerEntry, EventLedgerCorrelationIds } from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';
import type { ProjectArtifactService } from './project-artifact-service.js';

const logger = createLogger('EventLedgerService');

/** Lifecycle event types that the ledger subscribes to */
const LIFECYCLE_EVENT_TYPES = [
  'feature:status-changed',
  'feature:started',
  'feature:completed',
  'feature:error',
  'feature:pr-merged',
  'lead-engineer:feature-processed',
  'pipeline:state-entered',
  'milestone:completed',
  'project:completed',
  'project:lifecycle:launched',
  'ceremony:fired',
  'escalation:signal-received',
  'auto-mode:event',
] as const;

/** Auto-mode sub-types that are considered feature lifecycle events */
const FEATURE_AUTO_MODE_TYPES = new Set([
  'feature_started',
  'feature_completed',
  'feature_error',
  'feature_queued',
  'feature_running',
  'feature_retrying',
]);

function getLedgerPath(dataDir: string): string {
  return path.join(dataDir, 'ledger', 'events.jsonl');
}

/**
 * Input for appending a new event. `id` and `timestamp` are auto-generated if omitted.
 */
export interface AppendEventInput {
  /** Optional — auto-generated UUID if not provided */
  id?: string;
  eventType: string;
  correlationIds: EventLedgerCorrelationIds;
  payload: object;
  source: string;
}

export class EventLedgerService {
  private readonly dataDir: string;
  /** In-memory set of known IDs for fast idempotency checks */
  private seenIds: Set<string> | null = null;
  private initPromise: Promise<void> | null = null;
  private projectArtifactService: ProjectArtifactService | null = null;

  constructor(dataDir: string, projectArtifactService?: ProjectArtifactService) {
    this.dataDir = dataDir;
    this.projectArtifactService = projectArtifactService ?? null;
  }

  /**
   * Initialize the service by loading existing event IDs from disk.
   * Called once on startup; subsequent calls are no-ops.
   */
  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._loadExistingIds();
    return this.initPromise;
  }

  private async _loadExistingIds(): Promise<void> {
    this.seenIds = new Set<string>();
    const ledgerPath = getLedgerPath(this.dataDir);

    if (!fs.existsSync(ledgerPath)) {
      logger.debug('EventLedger: no existing ledger file, starting fresh');
      return;
    }

    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(ledgerPath, 'utf-8'),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const entry = JSON.parse(trimmed) as EventLedgerEntry;
          if (entry.id) this.seenIds!.add(entry.id);
        } catch {
          // skip malformed lines
        }
      }

      logger.debug(`EventLedger: loaded ${this.seenIds!.size} existing IDs`);
    } catch (err) {
      logger.warn('EventLedger: failed to load existing IDs:', err);
      this.seenIds = new Set<string>();
    }
  }

  /**
   * Append a new event to the ledger — fire-and-forget.
   * Returns void immediately; the write happens asynchronously.
   * Duplicate IDs are silently skipped.
   */
  append(input: AppendEventInput): void {
    void this._append(input).catch((err) => {
      logger.error('EventLedger: unexpected error in append:', err);
    });
  }

  private async _append(input: AppendEventInput): Promise<void> {
    // Ensure IDs are loaded
    await this.initialize();

    const id = input.id ?? randomUUID();

    // Idempotency check
    if (this.seenIds!.has(id)) {
      logger.debug(`EventLedger: duplicate event ID ${id}, skipping`);
      return;
    }

    const entry: EventLedgerEntry = {
      id,
      timestamp: new Date().toISOString(),
      eventType: input.eventType,
      correlationIds: input.correlationIds,
      payload: input.payload,
      source: input.source,
    };

    const ledgerPath = getLedgerPath(this.dataDir);
    const dir = path.dirname(ledgerPath);

    try {
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.appendFile(ledgerPath, JSON.stringify(entry) + '\n', 'utf-8');
      this.seenIds!.add(id);
      logger.debug(`EventLedger: wrote event ${entry.eventType} (${id})`);
    } catch (err) {
      logger.error('EventLedger: failed to write entry:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Query helpers — each reads the JSONL file and filters in a single pass
  // ---------------------------------------------------------------------------

  private async _readAll(): Promise<EventLedgerEntry[]> {
    const ledgerPath = getLedgerPath(this.dataDir);

    if (!fs.existsSync(ledgerPath)) return [];

    const entries: EventLedgerEntry[] = [];

    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(ledgerPath, 'utf-8'),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed) as EventLedgerEntry);
        } catch {
          // skip malformed lines
        }
      }
    } catch (err) {
      logger.warn('EventLedger: failed to read entries:', err);
    }

    return entries;
  }

  /** Return all events correlated to a specific feature ID */
  async getByFeatureId(featureId: string): Promise<EventLedgerEntry[]> {
    const all = await this._readAll();
    return all.filter((e) => e.correlationIds.featureId === featureId);
  }

  /** Return all events correlated to a specific project slug */
  async getByProjectSlug(projectSlug: string): Promise<EventLedgerEntry[]> {
    const all = await this._readAll();
    return all.filter((e) => e.correlationIds.projectSlug === projectSlug);
  }

  /**
   * Return all events whose timestamp falls within [startDate, endDate].
   * Both bounds are ISO 8601 strings and are inclusive.
   */
  async getByTimeRange(startDate: string, endDate: string): Promise<EventLedgerEntry[]> {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const all = await this._readAll();
    return all.filter((e) => {
      const ts = new Date(e.timestamp).getTime();
      return ts >= start && ts <= end;
    });
  }

  /** Return all events of a specific eventType */
  async getByEventType(eventType: string): Promise<EventLedgerEntry[]> {
    const all = await this._readAll();
    return all.filter((e) => e.eventType === eventType);
  }

  /**
   * Return all events correlated to a specific project slug, sorted chronologically.
   * Supports optional filtering by `since` (ISO 8601) and `type` (eventType).
   */
  async queryByProject(
    projectSlug: string,
    opts?: { since?: string; type?: string }
  ): Promise<EventLedgerEntry[]> {
    const all = await this._readAll();
    const sinceMs = opts?.since ? new Date(opts.since).getTime() : undefined;

    const filtered = all.filter((e) => {
      if (e.correlationIds.projectSlug !== projectSlug) return false;
      if (sinceMs !== undefined && new Date(e.timestamp).getTime() <= sinceMs) return false;
      if (opts?.type && e.eventType !== opts.type) return false;
      return true;
    });

    // Sort chronologically (oldest first)
    filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return filtered;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle event subscription
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to all 13 lifecycle event types and write a ledger entry for each.
   * Returns an unsubscribe function.
   *
   * Correlation ID extraction per event type:
   * - feature:* events → featureId from payload
   * - lead-engineer:feature-processed → featureId
   * - pipeline:state-entered → featureId
   * - milestone:completed → projectSlug + milestoneSlug
   * - project:completed / project:lifecycle:launched → projectSlug
   * - ceremony:fired → projectSlug + milestoneSlug
   * - escalation:signal-received → featureId (if present)
   * - auto-mode:event (feature types only) → featureId (if present)
   */
  subscribeToLifecycleEvents(events: EventEmitter): () => void {
    const unsubscribes: Array<() => void> = [];

    // Single subscription that handles all lifecycle events
    const unsubscribe = events.subscribe((type, rawPayload) => {
      const payload = (rawPayload ?? {}) as Record<string, unknown>;

      switch (type) {
        case 'feature:status-changed': {
          const featureId = payload.featureId as string | undefined;
          this.append({
            eventType: type,
            correlationIds: { featureId },
            payload: {
              from: payload.previousStatus,
              to: payload.newStatus,
              reason: payload.statusChangeReason ?? payload.reason,
            },
            source: 'EventLedgerService',
          });
          break;
        }

        case 'feature:started': {
          const featureId = payload.featureId as string | undefined;
          this.append({
            eventType: type,
            correlationIds: { featureId },
            payload,
            source: 'EventLedgerService',
          });
          break;
        }

        case 'feature:completed': {
          const featureId = payload.featureId as string | undefined;
          this.append({
            eventType: type,
            correlationIds: { featureId },
            payload,
            source: 'EventLedgerService',
          });
          break;
        }

        case 'feature:error': {
          const featureId = payload.featureId as string | undefined;
          this.append({
            eventType: type,
            correlationIds: { featureId },
            payload,
            source: 'EventLedgerService',
          });
          break;
        }

        case 'feature:pr-merged': {
          const featureId = payload.featureId as string | undefined;
          this.append({
            eventType: type,
            correlationIds: { featureId },
            payload,
            source: 'EventLedgerService',
          });
          break;
        }

        case 'lead-engineer:feature-processed': {
          const featureId = payload.featureId as string | undefined;
          this.append({
            eventType: type,
            correlationIds: { featureId },
            payload,
            source: 'EventLedgerService',
          });
          break;
        }

        case 'pipeline:state-entered': {
          const featureId = payload.featureId as string | undefined;
          this.append({
            eventType: type,
            correlationIds: { featureId },
            payload: {
              fromState: payload.fromState,
              toState: payload.state,
            },
            source: 'EventLedgerService',
          });
          break;
        }

        case 'milestone:completed': {
          const projectSlug = payload.projectSlug as string | undefined;
          const milestoneSlug = payload.milestoneSlug as string | undefined;
          this.append({
            eventType: type,
            correlationIds: { projectSlug, milestoneSlug },
            payload,
            source: 'EventLedgerService',
          });
          break;
        }

        case 'project:completed': {
          const projectSlug = payload.projectSlug as string | undefined;
          this.append({
            eventType: type,
            correlationIds: { projectSlug },
            payload,
            source: 'EventLedgerService',
          });
          break;
        }

        case 'project:lifecycle:launched': {
          const projectSlug = payload.projectSlug as string | undefined;
          this.append({
            eventType: type,
            correlationIds: { projectSlug },
            payload,
            source: 'EventLedgerService',
          });
          break;
        }

        case 'ceremony:fired': {
          const projectSlug = payload.projectSlug as string | undefined;
          const milestoneSlug = payload.milestoneSlug as string | undefined;
          this.append({
            eventType: type,
            correlationIds: { projectSlug, milestoneSlug },
            payload: {
              ceremonyType: payload.type,
              projectSlug,
              ...payload,
            },
            source: 'EventLedgerService',
          });
          break;
        }

        case 'escalation:signal-received': {
          const featureId = payload.featureId as string | undefined;
          this.append({
            eventType: type,
            correlationIds: { featureId },
            payload,
            source: 'EventLedgerService',
          });

          // Persist escalation as a project artifact when project context is available
          const context = payload.context as
            | { projectPath?: string; projectSlug?: string; featureId?: string; reason?: string }
            | undefined;
          if (this.projectArtifactService && context?.projectPath && context?.projectSlug) {
            void this.projectArtifactService
              .saveArtifact(context.projectPath, context.projectSlug, 'escalation', {
                signal: payload.type as string | undefined,
                reason: context.reason,
                featureId: context.featureId ?? featureId,
                source: payload.source,
                severity: payload.severity,
                context,
                timestamp: payload.timestamp ?? new Date().toISOString(),
              })
              .catch((err) => {
                logger.error('EventLedger: failed to save escalation artifact:', err);
              });
          }
          break;
        }

        case 'auto-mode:event': {
          // Only persist feature lifecycle events, not progress or UI noise
          const subType = payload.type as string | undefined;
          if (!subType || !FEATURE_AUTO_MODE_TYPES.has(subType)) break;
          const featureId = payload.featureId as string | undefined;
          this.append({
            eventType: type,
            correlationIds: { featureId },
            payload,
            source: 'EventLedgerService',
          });
          break;
        }

        default:
          break;
      }
    });

    unsubscribes.push(unsubscribe);

    logger.info(`EventLedger: subscribed to ${LIFECYCLE_EVENT_TYPES.length} lifecycle event types`);

    return () => {
      for (const unsub of unsubscribes) unsub();
    };
  }
}
