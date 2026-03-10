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
import type {
  DoraTimeSeriesEntry,
  DoraTimeSeriesDocument,
  AgenticMetricsEntry,
  AgenticMetricsDocument,
  AgenticAutonomyRate,
  AgenticRemediationRecord,
  AgenticWipSaturation,
} from '@protolabsai/types';
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

// ---------------------------------------------------------------------------
// AgenticMetricsService
// ---------------------------------------------------------------------------

/**
 * WIP limit configuration per pipeline stage.
 * Set to null to indicate no cap is configured for a stage.
 */
interface WipLimits {
  execution: number | null;
  review: number | null;
  approval: number | null;
}

/**
 * AgenticMetricsService — event-driven agentic metrics collector.
 *
 * Subscribes to the event bus and tracks four agentic health metrics:
 *
 *   1. Autonomy rate — % of features reaching done without human intervention
 *      beyond approval gates.
 *   2. Remediation loop count — PR review iterations per feature before merge.
 *   3. Cost per shipped feature — LLM cost from Langfuse per feature.
 *      TODO: integrate Langfuse cost API — currently recorded as null.
 *   4. WIP saturation index — current WIP / WIP limit per pipeline stage
 *      (execution, review, approval).
 *
 * Each observable event appends a snapshot entry to the time-series document
 * persisted at `.automaker/metrics/agentic.json`.  All state is derived from
 * events — no polling.
 *
 * Events consumed:
 *   - feature:status-changed  — WIP saturation + autonomy rate
 *   - agent:completed         — autonomy tracking (agent drove the transition)
 *   - pr:merged               — remediation loop finalisation + cost snapshot
 *   - pr:review-requested     — remediation loop count increment
 */
export class AgenticMetricsService {
  private readonly events: EventEmitter;
  /** Path to the project root — used to locate `.automaker/metrics/agentic.json`. */
  private readonly projectPath: string;
  /** Configurable WIP limits per stage (null = uncapped). */
  private readonly wipLimits: WipLimits;

  // ---- autonomy rate state ----
  private totalDone = 0;
  private autonomousDone = 0;
  /** featureIds where an agent:completed event was received before the feature reached done. */
  private readonly agentDrivenFeatures = new Set<string>();
  /** featureIds that received a human-triggered status change. */
  private readonly humanIntervenedFeatures = new Set<string>();

  // ---- WIP counters ----
  private readonly wipCounters: Record<'execution' | 'review' | 'approval', number> = {
    execution: 0,
    review: 0,
    approval: 0,
  };

  // ---- remediation loops ----
  private readonly remediationLoops = new Map<string, AgenticRemediationRecord>();

  /** Cleanup function returned by `events.subscribe`. */
  private unsubscribe?: () => void;

  constructor(
    events: EventEmitter,
    projectPath: string,
    wipLimits: WipLimits = { execution: null, review: null, approval: null }
  ) {
    this.events = events;
    this.projectPath = projectPath;
    this.wipLimits = wipLimits;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Subscribe to events and start collecting.  Call once on server startup. */
  initialize(): void {
    this.unsubscribe = this.events.subscribe((type, payload) => {
      const p = payload as Record<string, unknown>;

      switch (type) {
        case 'feature:status-changed':
          this.onFeatureStatusChanged(p);
          break;

        case 'agent:completed':
          this.onAgentCompleted(p);
          break;

        case 'pr:merged':
          this.onPrMerged(p);
          break;

        case 'pr:review-requested':
          this.onPrReviewRequested(p);
          break;

        default:
          break;
      }
    });

    logger.info('AgenticMetricsService initialized — subscribing to events');
  }

  /** Unsubscribe from events.  Call on server shutdown. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  /**
   * feature:status-changed — update WIP counters and autonomy rate.
   *
   * Canonical payload: { featureId, oldStatus?, newStatus?, projectPath? }
   * Also accepts legacy fromStatus/toStatus field names.
   * Also checks triggeredBy for human intervention detection.
   */
  private onFeatureStatusChanged(payload: Record<string, unknown>): void {
    const featureId = payload['featureId'] as string | undefined;
    const fromStatus =
      (payload['oldStatus'] as string | undefined) ??
      (payload['fromStatus'] as string | undefined) ??
      '';
    const toStatus =
      (payload['newStatus'] as string | undefined) ??
      (payload['toStatus'] as string | undefined) ??
      '';
    const triggeredBy = payload['triggeredBy'] as string | undefined;

    if (featureId && triggeredBy === 'human') {
      this.humanIntervenedFeatures.add(featureId);
    }

    const fromStage = this.statusToStage(fromStatus);
    const toStage = this.statusToStage(toStatus);

    if (fromStage && this.wipCounters[fromStage] > 0) {
      this.wipCounters[fromStage] -= 1;
    }
    if (toStage) {
      this.wipCounters[toStage] += 1;
    }

    if (featureId && this.isDoneStatus(toStatus)) {
      this.totalDone += 1;
      const wasAgentDriven = this.agentDrivenFeatures.has(featureId);
      const hadHumanIntervention = this.humanIntervenedFeatures.has(featureId);
      if (wasAgentDriven && !hadHumanIntervention) {
        this.autonomousDone += 1;
      }
      this.agentDrivenFeatures.delete(featureId);
      this.humanIntervenedFeatures.delete(featureId);
    }

    this.persistSnapshot();
  }

  /**
   * agent:completed — mark this feature as agent-driven for autonomy tracking.
   */
  private onAgentCompleted(payload: Record<string, unknown>): void {
    const featureId = payload['featureId'] as string | undefined;
    if (featureId) {
      this.agentDrivenFeatures.add(featureId);
    }
  }

  /**
   * pr:merged — finalise remediation loop for the feature and snapshot.
   */
  private onPrMerged(payload: Record<string, unknown>): void {
    const featureId = payload['featureId'] as string | undefined;
    if (!featureId) {
      this.persistSnapshot();
      return;
    }

    const existing = this.remediationLoops.get(featureId);
    if (existing) {
      existing.merged = true;
    } else {
      this.remediationLoops.set(featureId, { featureId, reviewIterations: 0, merged: true });
    }

    this.persistSnapshot();
    logger.info(
      `[Agentic] PR merged featureId=${featureId} reviewIterations=${existing?.reviewIterations ?? 0}`
    );
  }

  /**
   * pr:review-requested — increment the PR iteration counter for this feature.
   */
  private onPrReviewRequested(payload: Record<string, unknown>): void {
    const featureId = payload['featureId'] as string | undefined;
    if (!featureId) return;

    const existing = this.remediationLoops.get(featureId);
    if (existing) {
      existing.reviewIterations += 1;
    } else {
      this.remediationLoops.set(featureId, { featureId, reviewIterations: 1, merged: false });
    }

    logger.info(
      `[Agentic] Review requested featureId=${featureId} iterations=${this.remediationLoops.get(featureId)!.reviewIterations}`
    );
  }

  // ---------------------------------------------------------------------------
  // Snapshot helpers
  // ---------------------------------------------------------------------------

  private buildAutonomyRate(): AgenticAutonomyRate {
    return {
      totalDone: this.totalDone,
      autonomousDone: this.autonomousDone,
      rate: this.totalDone > 0 ? this.autonomousDone / this.totalDone : 0,
    };
  }

  private buildWipSaturation(): AgenticWipSaturation[] {
    const stages: Array<'execution' | 'review' | 'approval'> = ['execution', 'review', 'approval'];
    return stages.map((stage) => {
      const currentWip = this.wipCounters[stage];
      const wipLimit = this.wipLimits[stage];
      const saturation = wipLimit !== null && wipLimit > 0 ? currentWip / wipLimit : null;
      return { stage, currentWip, wipLimit, saturation };
    });
  }

  private persistSnapshot(): void {
    const entry: AgenticMetricsEntry = {
      timestamp: new Date().toISOString(),
      autonomyRate: this.buildAutonomyRate(),
      remediationLoops: Array.from(this.remediationLoops.values()),
      // TODO: integrate Langfuse cost API to derive actual cost per shipped feature
      costPerFeatureUsd: null,
      wipSaturation: this.buildWipSaturation(),
    };
    this.appendAgenticEntry(entry);
  }

  // ---------------------------------------------------------------------------
  // Disk persistence
  // ---------------------------------------------------------------------------

  private getAgenticPath(): string {
    return path.join(this.projectPath, '.automaker', 'metrics', 'agentic.json');
  }

  private readAgenticDocument(): AgenticMetricsDocument {
    const filePath = this.getAgenticPath();
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as AgenticMetricsDocument;
    } catch {
      return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
    }
  }

  private appendAgenticEntry(entry: AgenticMetricsEntry): void {
    const filePath = this.getAgenticPath();
    ensureDir(path.dirname(filePath));

    const doc = this.readAgenticDocument();
    doc.entries.push(entry);
    doc.updatedAt = new Date().toISOString();

    try {
      fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Failed to persist agentic metrics entry:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Map a feature status string to one of the three tracked pipeline stages. */
  private statusToStage(status: string): 'execution' | 'review' | 'approval' | null {
    const s = status.toLowerCase();
    if (s === 'in_progress' || s === 'in-progress' || s === 'executing') return 'execution';
    if (s === 'in_review' || s === 'in-review' || s === 'reviewing') return 'review';
    if (
      s === 'pending_approval' ||
      s === 'pending-approval' ||
      s === 'awaiting-approval' ||
      s === 'awaiting_approval'
    )
      return 'approval';
    return null;
  }

  /** Return true when a status string represents a terminal done state. */
  private isDoneStatus(status: string): boolean {
    const s = status.toLowerCase();
    return s === 'done' || s === 'completed' || s === 'verified' || s === 'merged';
  }
}
