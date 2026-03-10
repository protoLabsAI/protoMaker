/**
 * ErrorBudgetService — rolling change fail rate tracker and auto-mode gate.
 *
 * Tracks:
 *   - Total PRs merged over a rolling window (default: 7 days)
 *   - PRs that failed CI post-merge over the same window
 *
 * When the fail rate exceeds the configured threshold (default: 0.2 = 20%),
 * auto-mode is restricted to picking up features tagged as bug-fix only.
 *
 * State is persisted to `.automaker/metrics/error-budget.json` so it
 * survives server restarts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('ErrorBudgetService');

// ---------------------------------------------------------------------------
// Disk document shape
// ---------------------------------------------------------------------------

interface MergeRecord {
  featureId: string;
  mergedAt: string; // ISO timestamp
  failedCi: boolean;
}

interface ErrorBudgetDocument {
  version: 1;
  updatedAt: string;
  records: MergeRecord[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure a directory exists, creating it recursively if needed. */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ErrorBudgetService {
  /** Path to the project root — used to resolve `.automaker/metrics/error-budget.json`. */
  private readonly projectPath: string;

  /** Rolling window in milliseconds (default: 7 days). */
  private readonly windowMs: number;

  /** Fail rate threshold above which the budget is exhausted (default: 0.2 = 20%). */
  private readonly threshold: number;

  constructor(
    projectPath: string,
    options: {
      /** Rolling window in days (default: 7) */
      windowDays?: number;
      /** Fail rate threshold 0-1 (default: 0.2) */
      threshold?: number;
    } = {}
  ) {
    this.projectPath = projectPath;
    this.windowMs = (options.windowDays ?? 7) * 24 * 60 * 60 * 1000;
    this.threshold = options.threshold ?? 0.2;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Record a PR merge.
   * @param featureId ID of the merged feature
   * @param failedCi Whether CI failed post-merge for this change
   */
  recordMerge(featureId: string, failedCi: boolean): void {
    const doc = this.readDocument();

    const record: MergeRecord = {
      featureId,
      mergedAt: new Date().toISOString(),
      failedCi,
    };

    doc.records.push(record);
    doc.updatedAt = new Date().toISOString();

    this.writeDocument(doc);

    logger.info(
      `[ErrorBudget] Recorded merge featureId=${featureId} failedCi=${failedCi} ` +
        `failRate=${this.getFailRate().toFixed(3)} exhausted=${this.isExhausted()}`
    );
  }

  /**
   * Mark an existing merge record as CI-failed (called when CI failure is detected
   * post-merge for a feature that was already recorded as a successful merge).
   */
  markCiFailure(featureId: string): void {
    const doc = this.readDocument();
    const cutoff = Date.now() - this.windowMs;

    const record = doc.records
      .filter((r) => new Date(r.mergedAt).getTime() >= cutoff)
      .reverse()
      .find((r) => r.featureId === featureId);

    if (record) {
      if (!record.failedCi) {
        record.failedCi = true;
        doc.updatedAt = new Date().toISOString();
        this.writeDocument(doc);
        logger.info(`[ErrorBudget] Marked CI failure for featureId=${featureId}`);
      }
    } else {
      // No prior merge record in the window — create one representing a CI failure
      this.recordMerge(featureId, true);
    }
  }

  /**
   * Return the change fail rate over the rolling window.
   * Returns 0 if no merges have been recorded in the window.
   */
  getFailRate(): number {
    const { total, failed } = this.getWindowCounts();
    if (total === 0) return 0;
    return failed / total;
  }

  /**
   * Return true when the fail rate equals or exceeds the configured threshold.
   */
  isExhausted(): boolean {
    return this.getFailRate() >= this.threshold;
  }

  /**
   * Return a snapshot of the current budget state.
   */
  getState(): {
    totalMerges: number;
    failedMerges: number;
    failRate: number;
    exhausted: boolean;
    windowDays: number;
    threshold: number;
  } {
    const { total, failed } = this.getWindowCounts();
    const failRate = total > 0 ? failed / total : 0;
    return {
      totalMerges: total,
      failedMerges: failed,
      failRate,
      exhausted: failRate >= this.threshold,
      windowDays: this.windowMs / (24 * 60 * 60 * 1000),
      threshold: this.threshold,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private getWindowCounts(): { total: number; failed: number } {
    const doc = this.readDocument();
    const cutoff = Date.now() - this.windowMs;

    const windowRecords = doc.records.filter((r) => new Date(r.mergedAt).getTime() >= cutoff);

    const total = windowRecords.length;
    const failed = windowRecords.filter((r) => r.failedCi).length;

    return { total, failed };
  }

  private getBudgetPath(): string {
    return path.join(this.projectPath, '.automaker', 'metrics', 'error-budget.json');
  }

  private readDocument(): ErrorBudgetDocument {
    const filePath = this.getBudgetPath();
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as ErrorBudgetDocument;
    } catch {
      return { version: 1, updatedAt: new Date().toISOString(), records: [] };
    }
  }

  private writeDocument(doc: ErrorBudgetDocument): void {
    const filePath = this.getBudgetPath();
    ensureDir(path.dirname(filePath));
    try {
      fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf-8');
    } catch (err) {
      logger.error('[ErrorBudget] Failed to persist error budget state:', err);
    }
  }
}
