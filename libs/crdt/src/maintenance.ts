/**
 * CRDT Maintenance — compaction diagnostics, size tracking, and alerting.
 *
 * Tracks document size across compaction passes, maintains a rolling history,
 * and fires size-threshold alerts for operators monitoring document growth.
 *
 * Usage:
 *   const tracker = new MaintenanceTracker({ alertThresholdBytes: 5 * 1024 * 1024 });
 *
 *   // After each CRDTStore.compact() pass, record the sizes:
 *   tracker.recordCompaction({ 'features:abc': binarySize, 'projects:xyz': binarySize });
 *
 *   // Retrieve diagnostics (e.g. for a health endpoint):
 *   const diag = tracker.getDiagnostics();
 */

/** Snapshot of a single compaction run. */
export interface CompactionRecord {
  /** ISO timestamp of the compaction run */
  timestamp: string;
  /** Number of documents included in this pass */
  docCount: number;
  /** Sum of all document sizes in bytes */
  totalSizeBytes: number;
  /** Per-document sizes: key is "domain:id", value is size in bytes */
  docSizeMap: Record<string, number>;
}

/** Alert raised when a document exceeds the configured size threshold. */
export interface CompactionAlert {
  /** ISO timestamp when the alert was raised */
  timestamp: string;
  /** Document key ("domain:id") that exceeded the threshold */
  docKey: string;
  /** Actual document size in bytes */
  sizeBytes: number;
  /** Configured threshold that was exceeded */
  thresholdBytes: number;
}

/** Snapshot returned by MaintenanceTracker.getDiagnostics(). */
export interface CompactionDiagnostics {
  /** Most recent compaction record, or null if no compaction has run yet */
  lastCompaction: CompactionRecord | null;
  /** Rolling history of compaction records (newest last, capped at historyLimit) */
  history: CompactionRecord[];
  /** Total document size from the most recent compaction pass, in bytes */
  totalSizeBytes: number;
  /** Unacknowledged size-threshold alerts */
  alerts: CompactionAlert[];
}

/** Default alert threshold: 10 MB per document */
const DEFAULT_ALERT_THRESHOLD_BYTES = 10 * 1024 * 1024;

/** Number of compaction records to retain in rolling history */
const DEFAULT_HISTORY_LIMIT = 20;

/**
 * MaintenanceTracker — records compaction history and raises size alerts.
 *
 * Instantiate once per CRDTStore and call recordCompaction() after each
 * compaction pass. Retrieve diagnostics via getDiagnostics() for health
 * monitoring, dashboards, or alerting pipelines.
 */
export class MaintenanceTracker {
  private history: CompactionRecord[] = [];
  private alerts: CompactionAlert[] = [];
  private readonly alertThresholdBytes: number;
  private readonly historyLimit: number;

  constructor(options?: { alertThresholdBytes?: number; historyLimit?: number }) {
    this.alertThresholdBytes = options?.alertThresholdBytes ?? DEFAULT_ALERT_THRESHOLD_BYTES;
    this.historyLimit = options?.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  }

  /**
   * Record a compaction pass with per-document size data.
   * Appends to rolling history (capped at historyLimit) and raises alerts for
   * any document whose binary size exceeds alertThresholdBytes.
   *
   * @param docSizeMap - Map of "domain:id" -> byte count from Automerge.save()
   */
  recordCompaction(docSizeMap: Record<string, number>): void {
    const timestamp = new Date().toISOString();
    const totalSizeBytes = Object.values(docSizeMap).reduce((sum, v) => sum + v, 0);

    const record: CompactionRecord = {
      timestamp,
      docCount: Object.keys(docSizeMap).length,
      totalSizeBytes,
      docSizeMap,
    };

    this.history.push(record);
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }

    for (const [docKey, sizeBytes] of Object.entries(docSizeMap)) {
      if (sizeBytes > this.alertThresholdBytes) {
        this.alerts.push({
          timestamp,
          docKey,
          sizeBytes,
          thresholdBytes: this.alertThresholdBytes,
        });
      }
    }
  }

  /**
   * Returns a snapshot of current compaction diagnostics.
   */
  getDiagnostics(): CompactionDiagnostics {
    const lastCompaction = this.history[this.history.length - 1] ?? null;
    return {
      lastCompaction,
      history: [...this.history],
      totalSizeBytes: lastCompaction?.totalSizeBytes ?? 0,
      alerts: [...this.alerts],
    };
  }

  /**
   * Clear accumulated size-threshold alerts after operator acknowledgment.
   */
  clearAlerts(): void {
    this.alerts = [];
  }
}
