/**
 * AvaChannelService — daily-sharded message channel for multi-instance Ava coordination.
 *
 * Messages are append-only (grow-only list). Daily sharding provides natural compaction —
 * older shards receive no writes and compact efficiently.
 *
 * When a CRDTStore is provided, messages are stored in CRDT documents and sync
 * across instances automatically. Without a store, messages are held in-memory
 * (single-instance mode) with optional disk archival.
 *
 * Document key format: doc:ava-channel/YYYY-MM-DD
 * Shards older than 30 days are archived to disk and unloaded from memory.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createLogger } from '@protolabsai/utils';
import type { CRDTStore, AvaChannelDocument } from '@protolabsai/crdt';
import type {
  AvaChatMessage,
  AvaChannelContext,
  GetMessagesOptions,
  PostMessageOptions,
} from '@protolabsai/types';

const logger = createLogger('AvaChannelService');

/** Number of days before a shard is eligible for archival */
const ARCHIVE_AFTER_DAYS = 30;

/** Interval for running the archival check */
const ARCHIVE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class AvaChannelService {
  private readonly store: CRDTStore | null;
  private readonly instanceId: string;
  private readonly instanceName: string;
  /** Directory where archived shards are written as JSON files */
  private readonly archiveDir: string;
  private archiveTimer: ReturnType<typeof setInterval> | null = null;
  /** In-memory storage when no CRDT store is available */
  private readonly memoryShards = new Map<string, AvaChatMessage[]>();

  constructor(
    archiveDir: string,
    options?: { store?: CRDTStore; instanceId?: string; instanceName?: string }
  ) {
    this.archiveDir = archiveDir;
    this.store = options?.store ?? null;
    this.instanceId = options?.instanceId ?? os.hostname();
    this.instanceName = options?.instanceName ?? os.hostname();
  }

  /**
   * Start the periodic archival timer.
   * Call this after the CRDT store is initialized and ready.
   */
  start(): void {
    if (this.archiveTimer) return;
    this.archiveTimer = setInterval(() => {
      this.runArchiveCycle().catch((err: unknown) => {
        logger.error('[AvaChannel] Archive cycle error:', err);
      });
    }, ARCHIVE_CHECK_INTERVAL_MS);
    if (this.archiveTimer.unref) this.archiveTimer.unref();
    logger.info('[AvaChannel] Service started');
  }

  /** Stop the periodic archival timer. */
  stop(): void {
    if (this.archiveTimer) {
      clearInterval(this.archiveTimer);
      this.archiveTimer = null;
    }
    logger.info('[AvaChannel] Service stopped');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Append a message to today's Ava Channel shard.
   * The id and timestamp are auto-assigned.
   *
   * @param content  Free-form natural language — this IS the protocol.
   * @param source   Message originator: 'ava' | 'operator' | 'system'
   * @param options  Optional instanceName override and structured context
   * @returns The appended message with auto-assigned id and timestamp
   */
  async postMessage(
    content: string,
    source: 'ava' | 'operator' | 'system',
    options?: PostMessageOptions
  ): Promise<AvaChatMessage> {
    const date = todayDateKey();
    const message: AvaChatMessage = {
      id: randomUUID(),
      instanceId: this.instanceId,
      instanceName: options?.instanceName ?? this.instanceName,
      content,
      source,
      timestamp: new Date().toISOString(),
      ...(options?.context ? { context: options.context } : {}),
    };

    if (this.store) {
      await this.store.change<AvaChannelDocument>('ava-channel', date, (doc) => {
        if (!doc.messages) {
          (doc as unknown as { messages: AvaChatMessage[] }).messages = [];
        }
        doc.messages.push(message);
      });
    } else {
      const shard = this.memoryShards.get(date) ?? [];
      shard.push(message);
      this.memoryShards.set(date, shard);
    }

    logger.debug(`[AvaChannel] Posted message ${message.id} to shard ${date}`);
    return message;
  }

  /**
   * Read messages from one or more daily shards.
   *
   * If no time range is provided, returns today's shard only.
   * If a time range is provided, transparently queries all shards within range.
   */
  async getMessages(options: GetMessagesOptions = {}): Promise<AvaChatMessage[]> {
    const { from, to, instanceId, source } = options;

    const shardDates = from || to ? buildDateRange(from, to) : [todayDateKey()];

    const results: AvaChatMessage[] = [];
    for (const date of shardDates) {
      const msgs = await this._readShard(date);
      results.push(...msgs);
    }

    // Apply filters
    let filtered = results;
    if (instanceId) {
      filtered = filtered.filter((m) => m.instanceId === instanceId);
    }
    if (source) {
      filtered = filtered.filter((m) => m.source === source);
    }
    if (from) {
      const fromMs = from.getTime();
      filtered = filtered.filter((m) => new Date(m.timestamp).getTime() >= fromMs);
    }
    if (to) {
      const toMs = to.getTime();
      filtered = filtered.filter((m) => new Date(m.timestamp).getTime() <= toMs);
    }

    // Sort ascending by timestamp
    filtered.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return filtered;
  }

  /**
   * Get recent messages from the last `hours` hours (default: 24).
   * Transparently spans shard boundaries when the window crosses midnight.
   *
   * @param hours     Number of hours to look back (default: 24)
   * @param instanceId  Optional filter to messages from a specific instance
   */
  async getRecentMessages(hours = 24, instanceId?: string): Promise<AvaChatMessage[]> {
    const to = new Date();
    const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
    return this.getMessages({ from, to, instanceId });
  }

  /**
   * Post a bug report from Discord as a system message.
   * Called automatically when a bug report arrives in #bug-reports.
   *
   * @param reportContent  The bug report text
   * @param context        Optional structured context (featureId, etc.)
   */
  async postBugReport(reportContent: string, context?: AvaChannelContext): Promise<AvaChatMessage> {
    const content = `[BugReport] ${reportContent}`;
    return this.postMessage(content, 'system', {
      instanceName: 'discord-bot',
      context,
    });
  }

  /**
   * Archive shards older than ARCHIVE_AFTER_DAYS days to disk as JSON files.
   * Archived shards are unloaded from active use (best-effort).
   */
  async archiveOldShards(): Promise<void> {
    return this.runArchiveCycle();
  }

  /**
   * Run a single archival pass: find shards older than ARCHIVE_AFTER_DAYS days,
   * write them to disk as JSON, and drop their handles from memory (best-effort).
   */
  async runArchiveCycle(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ARCHIVE_AFTER_DAYS);
    const cutoffKey = formatDateKey(cutoff);

    fs.mkdirSync(this.archiveDir, { recursive: true });

    // Check dates from 30 days before the cutoff up to yesterday
    const checkFrom = new Date(cutoff);
    checkFrom.setDate(checkFrom.getDate() - 30);
    const checkTo = new Date(cutoff);
    checkTo.setDate(checkTo.getDate() - 1);

    const datesToCheck = buildDateRange(checkFrom, checkTo);
    let archived = 0;

    for (const date of datesToCheck) {
      if (date >= cutoffKey) continue;

      const archivePath = path.join(this.archiveDir, `${date}.json`);
      if (fs.existsSync(archivePath)) continue; // Already archived

      if (this.store) {
        // CRDT mode: check if a shard exists in the store
        const url = this.store.getDocumentUrl('ava-channel', date);
        if (!url) continue;

        try {
          const handle = await this.store.getOrCreate<AvaChannelDocument>('ava-channel', date, {
            messages: [],
          });
          const doc = handle.docSync();
          const messages: AvaChatMessage[] = doc ? [...(doc.messages ?? [])] : [];
          fs.writeFileSync(archivePath, JSON.stringify(messages, null, 2), 'utf-8');
          archived++;
          logger.info(`[AvaChannel] Archived shard ${date} (${messages.length} messages)`);
        } catch (err) {
          logger.error(`[AvaChannel] Failed to archive shard ${date}:`, err);
        }
      } else {
        // In-memory mode: archive from memoryShards
        const shard = this.memoryShards.get(date);
        if (!shard || shard.length === 0) continue;

        try {
          fs.writeFileSync(archivePath, JSON.stringify(shard, null, 2), 'utf-8');
          this.memoryShards.delete(date);
          archived++;
          logger.info(`[AvaChannel] Archived shard ${date} (${shard.length} messages)`);
        } catch (err) {
          logger.error(`[AvaChannel] Failed to archive shard ${date}:`, err);
        }
      }
    }

    if (archived > 0) {
      logger.info(`[AvaChannel] runArchiveCycle: archived ${archived} shard(s)`);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Read all messages from a single daily shard.
   * Falls back to the disk archive if available, then the store or in-memory map.
   */
  private async _readShard(date: string): Promise<AvaChatMessage[]> {
    // Check disk archive first (older shards)
    const archivePath = path.join(this.archiveDir, `${date}.json`);
    if (fs.existsSync(archivePath)) {
      try {
        const raw = fs.readFileSync(archivePath, 'utf-8');
        return JSON.parse(raw) as AvaChatMessage[];
      } catch {
        // Fall through to store / in-memory
      }
    }

    if (this.store) {
      try {
        const handle = await this.store.getOrCreate<AvaChannelDocument>('ava-channel', date, {
          messages: [],
        });
        const doc = handle.docSync();
        if (!doc) return [];
        return [...(doc.messages ?? [])];
      } catch (err) {
        logger.warn(`[AvaChannel] Could not read shard ${date}:`, err);
        return [];
      }
    }

    // In-memory fallback
    return [...(this.memoryShards.get(date) ?? [])];
  }
}

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

/** Format a Date as YYYY-MM-DD in UTC. */
function formatDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Get today's UTC date as YYYY-MM-DD. */
function todayDateKey(): string {
  return formatDateKey(new Date());
}

/**
 * Generate an array of YYYY-MM-DD strings covering the range [from, to].
 * If from is undefined, starts 30 days ago. If to is undefined, ends today.
 */
function buildDateRange(from?: Date, to?: Date): string[] {
  const start = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = to ?? new Date();

  const dates: string[] = [];
  const current = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );
  const endKey = formatDateKey(end);

  while (formatDateKey(current) <= endKey) {
    dates.push(formatDateKey(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}
