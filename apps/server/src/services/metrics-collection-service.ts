/**
 * MetricsCollectionService — event-driven DORA metrics collector.
 *
 * Subscribes to the event bus and builds a time-series dataset of the four
 * DORA metrics:
 *
 *   1. Deployment Frequency — count of PRs merged to dev per day / week.
 *   2. Change Lead Time — time from feature creation to PR merge.
 *   3. Change Fail Rate — ratio of features that fail CI or require post-merge
 *      remediation to total merges.
 *   4. Recovery Time — time from failure detection to fix merge.
 *
 * Each observable event appends a snapshot entry to the time-series document
 * persisted at `.automaker/metrics/dora.json`.  All state is derived from
 * events — no polling.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '@protolabsai/utils';
import type { DoraTimeSeriesEntry, DoraTimeSeriesDocument } from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';

const logger = createLogger('MetricsCollectionService');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return YYYY-MM-DD for a given Date (or now). */
function dayBucket(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Ensure a directory exists, creating it recursively if needed. */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// In-memory counters
// ---------------------------------------------------------------------------

interface FailureRecord {
  featureId: string;
  detectedAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MetricsCollectionService {
  private readonly events: EventEmitter;
  private readonly featureLoader: FeatureLoader;
  /** Path to the project root — used to locate `.automaker/metrics/dora.json`. */
  private readonly projectPath: string;

  /** Per-day merge counters (keyed by YYYY-MM-DD). */
  private readonly dayCounters = new Map<string, number>();

  /** Rolling 7-day merge counter for the current week bucket. */
  private weekMergeCount = 0;
  private weekBucketStart: string = dayBucket();

  /** Pending failure records waiting for a fix merge (keyed by featureId). */
  private readonly pendingFailures = new Map<string, FailureRecord>();

  /** Cumulative totals for change fail rate computation. */
  private totalMerges = 0;
  private totalFailures = 0;

  /** Cleanup function returned by `events.subscribe`. */
  private unsubscribe?: () => void;

  constructor(events: EventEmitter, featureLoader: FeatureLoader, projectPath: string) {
    this.events = events;
    this.featureLoader = featureLoader;
    this.projectPath = projectPath;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Subscribe to events and start collecting.  Call once on server startup. */
  initialize(): void {
    this.unsubscribe = this.events.subscribe((type, payload) => {
      const p = payload as Record<string, unknown>;

      switch (type) {
        case 'feature:pr-merged':
          void this.onPrMerged(p).catch((err) => logger.error('onPrMerged failed:', err));
          break;

        case 'pr:ci-failure':
          this.onCiFailure(p);
          break;

        case 'pr:remediation-started':
          // Post-merge remediation also counts as a change failure.
          this.onRemediationStarted(p);
          break;

        default:
          break;
      }
    });

    logger.info('MetricsCollectionService initialized — subscribing to events');
  }

  /** Unsubscribe from events.  Call on server shutdown. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  private async onPrMerged(payload: Record<string, unknown>): Promise<void> {
    const featureId = payload['featureId'] as string | undefined;
    const projectPath = (payload['projectPath'] as string | undefined) ?? this.projectPath;
    const now = new Date();
    const today = dayBucket(now);

    // --- Deployment Frequency ---
    const prevDayCount = this.dayCounters.get(today) ?? 0;
    this.dayCounters.set(today, prevDayCount + 1);
    this.totalMerges += 1;

    // Refresh weekly bucket (rolling 7-day window)
    this.refreshWeekBucket(today);
    this.weekMergeCount += 1;

    const mergesPerDay = this.dayCounters.get(today) ?? 1;
    const mergesPerWeek = this.weekMergeCount;

    // --- Change Lead Time ---
    let changeLeadTime: DoraTimeSeriesEntry['changeLeadTime'] = null;
    if (featureId) {
      try {
        const feature = await this.featureLoader.get(projectPath, featureId);
        if (feature?.createdAt) {
          const createdMs = new Date(feature.createdAt).getTime();
          const mergedMs = now.getTime();
          changeLeadTime = {
            featureId,
            featureTitle: feature.title ?? undefined,
            featureCreatedAt: feature.createdAt,
            prMergedAt: now.toISOString(),
            leadTimeMs: mergedMs - createdMs,
          };
        }
      } catch (err) {
        logger.warn(`MetricsCollectionService: could not load feature ${featureId}:`, err);
      }
    }

    // --- Recovery Time ---
    let recoveryTime: DoraTimeSeriesEntry['recoveryTime'] = null;

    if (featureId && this.pendingFailures.has(featureId)) {
      const failure = this.pendingFailures.get(featureId)!;
      this.pendingFailures.delete(featureId);

      const failureMs = new Date(failure.detectedAt).getTime();
      const fixMs = now.getTime();
      recoveryTime = {
        featureId,
        failureDetectedAt: failure.detectedAt,
        fixMergedAt: now.toISOString(),
        recoveryTimeMs: fixMs - failureMs,
      };
    }

    // --- Change Fail Rate snapshot ---
    const changeFailRate: DoraTimeSeriesEntry['changeFailRate'] = {
      totalMerges: this.totalMerges,
      totalFailures: this.totalFailures,
      ratio: this.totalMerges > 0 ? this.totalFailures / this.totalMerges : 0,
    };

    // --- Persist entry ---
    const entry: DoraTimeSeriesEntry = {
      timestamp: now.toISOString(),
      deploymentFrequency: {
        mergesPerDay,
        mergesPerWeek,
        dayBucket: today,
      },
      changeLeadTime,
      changeFailRate,
      recoveryTime,
    };

    this.appendEntry(entry);

    logger.info(
      `[DORA] PR merged featureId=${featureId ?? 'unknown'} ` +
        `mergesPerDay=${mergesPerDay} ` +
        `leadTimeMs=${changeLeadTime?.leadTimeMs ?? 'N/A'} ` +
        `recoveryTime=${recoveryTime?.recoveryTimeMs ?? 'N/A'}`
    );
  }

  private onCiFailure(payload: Record<string, unknown>): void {
    const featureId = payload['featureId'] as string | undefined;
    if (!featureId) return;

    if (!this.pendingFailures.has(featureId)) {
      this.totalFailures += 1;
      this.pendingFailures.set(featureId, {
        featureId,
        detectedAt: new Date().toISOString(),
      });
      logger.info(`[DORA] CI failure recorded featureId=${featureId}`);
    }
  }

  private onRemediationStarted(payload: Record<string, unknown>): void {
    const featureId = payload['featureId'] as string | undefined;
    if (!featureId) return;

    if (!this.pendingFailures.has(featureId)) {
      this.totalFailures += 1;
      this.pendingFailures.set(featureId, {
        featureId,
        detectedAt: new Date().toISOString(),
      });
      logger.info(`[DORA] Remediation started (counted as failure) featureId=${featureId}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Disk persistence
  // ---------------------------------------------------------------------------

  private getDoraPath(): string {
    return path.join(this.projectPath, '.automaker', 'metrics', 'dora.json');
  }

  private readDocument(): DoraTimeSeriesDocument {
    const filePath = this.getDoraPath();
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as DoraTimeSeriesDocument;
    } catch {
      return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
    }
  }

  private appendEntry(entry: DoraTimeSeriesEntry): void {
    const filePath = this.getDoraPath();
    ensureDir(path.dirname(filePath));

    const doc = this.readDocument();
    doc.entries.push(entry);
    doc.updatedAt = new Date().toISOString();

    try {
      fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Failed to persist DORA metrics entry:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Rolling 7-day week bucket.  If the current day is more than 6 days from
   * the start of the current week bucket, reset the counter and start a new
   * bucket.
   */
  private refreshWeekBucket(today: string): void {
    const bucketStartMs = new Date(this.weekBucketStart).getTime();
    const todayMs = new Date(today).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    if (todayMs - bucketStartMs >= sevenDaysMs) {
      this.weekMergeCount = 0;
      this.weekBucketStart = today;
    }
  }
}
