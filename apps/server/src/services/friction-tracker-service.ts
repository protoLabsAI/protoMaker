/**
 * FrictionTrackerService — self-improvement loop for recurring failure patterns.
 *
 * Maintains an in-memory map of pattern → occurrenceCount. Each time a feature
 * hits blocked status, the FailureClassifierService classification is logged here.
 * When a pattern reaches 3 occurrences **within a rolling time window**, the
 * service files a System Improvement feature via FeatureLoader.create() and
 * broadcasts a friction_report message to #backchannel (AvaChannel) so peer
 * instances can de-duplicate.
 *
 * Sliding-window counters: failures older than COUNTER_WINDOW_MS reset the
 * counter for that pattern, preventing unrelated failures spread across weeks
 * from triggering spurious System Improvement tickets.
 *
 * Peer de-duplication: skips filing if a peer already filed the same pattern
 * in the last 24 hours.
 */

import type { FrictionReport } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import type { FeatureLoader } from './feature-loader.js';
import type { AvaChannelService } from './ava-channel-service.js';

const logger = createLogger('FrictionTrackerService');

/** Number of occurrences before a System Improvement feature is filed */
const OCCURRENCE_THRESHOLD = 3;

/** How long (ms) to consider a peer-filed report as "recent" for de-duplication */
const PEER_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Sliding window for failure counters (7 days).
 *
 * If the first occurrence of a pattern is older than this window, the counter
 * resets before counting the new failure. This prevents unrelated failures
 * spread across weeks/months from accumulating into a spurious self-improvement
 * ticket — only genuinely recurring failures within a short period trigger filing.
 */
const COUNTER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Tracks the occurrence count and when the current window started */
interface CounterEntry {
  count: number;
  /** Timestamp of the first failure in the current window */
  windowStart: number;
}

/** Diagnostic context for a single failure occurrence */
export interface FailureContext {
  /** ID of the feature that failed */
  featureId?: string;
  /** Files that had conflicts (for merge_conflict pattern) */
  conflictingFiles?: string[];
  /** Branch that had conflicts */
  branchName?: string;
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface FrictionTrackerDependencies {
  featureLoader: FeatureLoader;
  avaChannelService: AvaChannelService;
  /** Project path for filing System Improvement features */
  projectPath: string;
  /** This instance's ID (used in friction_report broadcasts) */
  instanceId?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FrictionTrackerService {
  private readonly deps: FrictionTrackerDependencies;

  /** Pattern → sliding-window counter entry */
  private readonly counters = new Map<string, CounterEntry>();

  /** Pattern → timestamp of the most-recent filing (local or peer) */
  private readonly recentFilings = new Map<string, number>();

  /** Pattern → accumulated diagnostic context from individual failures */
  private readonly failureContexts = new Map<string, FailureContext[]>();

  constructor(deps: FrictionTrackerDependencies) {
    this.deps = deps;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Record a failure occurrence with optional diagnostic context.
   *
   * The context is accumulated across occurrences and included in the filed
   * System Improvement feature description for actionability.
   */
  async recordFailureWithContext(pattern: string, context: FailureContext): Promise<void> {
    if (!pattern || pattern === 'unknown') return;

    const existing = this.failureContexts.get(pattern) ?? [];
    existing.push(context);
    // Keep last 10 contexts to avoid unbounded growth
    this.failureContexts.set(pattern, existing.slice(-10));

    await this.recordFailure(pattern);
  }

  /**
   * Record a failure occurrence for the given pattern.
   *
   * If the counter reaches OCCURRENCE_THRESHOLD **within the sliding window**
   * and no peer has filed the same pattern within the last 24 hours, a System
   * Improvement feature is created and a friction_report is broadcast to the
   * backchannel.
   *
   * Sliding-window semantics: if the first occurrence of this pattern is older
   * than COUNTER_WINDOW_MS, the counter resets to 1 (starting a fresh window).
   * This prevents failures spread across weeks from accumulating into a spurious
   * self-improvement ticket.
   */
  async recordFailure(pattern: string): Promise<void> {
    // 'unknown' is a catch-all fallback category, not a meaningful recurring pattern.
    // Skipping it prevents unrelated unclassified failures from accumulating into a
    // spurious System Improvement ticket. A warn-level log in FailureClassifierService
    // will surface the original reason for pattern expansion analysis.
    if (!pattern || pattern === 'unknown') {
      logger.debug(
        'Dropping unclassified failure from friction counters — pattern="unknown" is a catch-all; ' +
          'check FailureClassifierService warn logs to identify recurring unclassified reasons.'
      );
      return;
    }

    const now = Date.now();
    const existing = this.counters.get(pattern);

    let entry: CounterEntry;
    if (!existing || now - existing.windowStart > COUNTER_WINDOW_MS) {
      // No prior entry, or the window has expired — start a fresh window
      entry = { count: 1, windowStart: now };
    } else {
      entry = { count: existing.count + 1, windowStart: existing.windowStart };
    }

    this.counters.set(pattern, entry);

    logger.debug(
      `Friction counter updated: pattern="${pattern}" count=${entry.count} windowStart=${new Date(entry.windowStart).toISOString()}`
    );

    if (entry.count >= OCCURRENCE_THRESHOLD) {
      await this.maybeFileImprovement(pattern);
    }
  }

  /**
   * Handle an incoming friction_report from a peer instance.
   * Records the pattern as recently-filed so this instance skips duplicates.
   */
  handlePeerReport(report: FrictionReport): void {
    const filedAt = new Date(report.filedAt).getTime();
    if (isNaN(filedAt)) {
      logger.warn(`Received friction_report with invalid filedAt: ${report.filedAt}`);
      return;
    }

    const existing = this.recentFilings.get(report.pattern) ?? 0;
    // Keep the most recent filing timestamp
    if (filedAt > existing) {
      this.recentFilings.set(report.pattern, filedAt);
      logger.debug(
        `Peer de-dup: recorded filing for pattern="${report.pattern}" from instance=${report.instanceId}`
      );
    }
  }

  /**
   * Return the current occurrence count for a pattern (for testing / observability).
   * Returns 0 if the pattern has no entry or its window has expired.
   */
  getCount(pattern: string): number {
    const entry = this.counters.get(pattern);
    if (!entry) return 0;
    // If the window has expired, the counter would reset on the next recordFailure call
    if (Date.now() - entry.windowStart > COUNTER_WINDOW_MS) return 0;
    return entry.count;
  }

  /**
   * Return all active (non-expired) friction patterns with their occurrence counts
   * and the timestamp when the current window started (used as "last-seen" proxy).
   */
  getPatterns(): Array<{ pattern: string; count: number; lastSeenMs: number }> {
    const now = Date.now();
    const results: Array<{ pattern: string; count: number; lastSeenMs: number }> = [];
    for (const [pattern, entry] of this.counters) {
      if (now - entry.windowStart <= COUNTER_WINDOW_MS) {
        results.push({ pattern, count: entry.count, lastSeenMs: entry.windowStart });
      }
    }
    // Sort descending by count
    results.sort((a, b) => b.count - a.count);
    return results;
  }

  /**
   * Remove a resolved pattern from all maps.
   * Called when a System Improvement feature for this pattern moves to done,
   * either locally or via a pattern_resolved broadcast from a peer.
   */
  resolvePattern(pattern: string): void {
    if (!pattern) return;
    this.counters.delete(pattern);
    this.recentFilings.delete(pattern);
    this.failureContexts.delete(pattern);
    logger.info(`Pattern resolved and counters cleared: pattern="${pattern}"`);
  }

  /**
   * Check whether a peer recently filed for this pattern (within the dedup window).
   */
  isPeerRecentlyFiled(pattern: string): boolean {
    const lastFiled = this.recentFilings.get(pattern);
    if (!lastFiled) return false;
    return Date.now() - lastFiled < PEER_DEDUP_WINDOW_MS;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async maybeFileImprovement(pattern: string): Promise<void> {
    // Peer de-duplication guard
    if (this.isPeerRecentlyFiled(pattern)) {
      logger.info(
        `Skipping System Improvement filing for pattern="${pattern}" — peer already filed recently`
      );
      return;
    }

    // Durable dedup: check the feature store for an existing open System Improvement
    // feature with the same title. In-memory dedup resets on server restart (a known
    // P1 issue), which previously caused the same pattern to be re-filed after each
    // crash. Using the feature store as the source of truth makes dedup survive restarts.
    const title = `System Improvement: recurring ${pattern} failures`;
    try {
      const existing = await this.deps.featureLoader.findByTitle(this.deps.projectPath, title);
      if (existing && existing.status !== 'done' && existing.status !== 'interrupted') {
        // Re-populate local dedup guard so subsequent recordFailure calls also skip
        this.recentFilings.set(pattern, Date.now());
        logger.info(
          `Skipping System Improvement filing for pattern="${pattern}" — open feature ${existing.id} already exists (status=${existing.status})`
        );
        return;
      }
    } catch (err) {
      // If the feature store check fails, proceed with filing — better a duplicate
      // than a missed self-improvement ticket.
      logger.warn(
        `Failed to check for existing feature for pattern="${pattern}", proceeding with filing: ${err}`
      );
    }

    // Mark as locally filed immediately to prevent concurrent duplicate filings
    this.recentFilings.set(pattern, Date.now());

    try {
      const contexts = this.failureContexts.get(pattern) ?? [];
      const contextSection = this.buildContextSection(pattern, contexts);
      const description =
        `This feature was automatically filed by the self-improvement loop.\n\n` +
        `Pattern "${pattern}" has failed ${OCCURRENCE_THRESHOLD} or more times, ` +
        `indicating a systemic issue that warrants investigation and remediation.\n\n` +
        `**Action required:** Investigate the root cause of recurring ${pattern} failures ` +
        `and implement a durable fix to prevent future occurrences.` +
        contextSection;

      const feature = await this.deps.featureLoader.create(this.deps.projectPath, {
        title,
        description,
        complexity: 'medium',
        systemImprovement: true,
        status: 'backlog',
        tags: ['system-improvement', 'friction-tracker'],
      } as Parameters<FeatureLoader['create']>[1]);

      logger.info(`Filed System Improvement feature ${feature.id} for pattern="${pattern}"`);

      // Broadcast to backchannel so peers can de-duplicate
      await this.broadcastFrictionReport(pattern, feature.id);
    } catch (err) {
      // Roll back the dedup guard so a future attempt can retry
      this.recentFilings.delete(pattern);
      logger.error(`Failed to file System Improvement feature for pattern="${pattern}":`, err);
    }
  }

  private buildContextSection(pattern: string, contexts: FailureContext[]): string {
    if (contexts.length === 0) return '';

    const lines: string[] = ['\n\n**Diagnostic Context (accumulated failures):**'];

    if (pattern === 'merge_conflict') {
      const affectedFeatures = [...new Set(contexts.map((c) => c.featureId).filter(Boolean))];
      const allConflictingFiles = [
        ...new Set(contexts.flatMap((c) => c.conflictingFiles ?? []).filter(Boolean)),
      ];
      const affectedBranches = [...new Set(contexts.map((c) => c.branchName).filter(Boolean))];

      if (affectedFeatures.length > 0) {
        lines.push(`- Affected features: ${affectedFeatures.join(', ')}`);
      }
      if (allConflictingFiles.length > 0) {
        lines.push(`- Files with recurring conflicts: ${allConflictingFiles.join(', ')}`);
      }
      if (affectedBranches.length > 0) {
        lines.push(`- Affected branches: ${affectedBranches.join(', ')}`);
      }
    } else {
      const affectedFeatures = [...new Set(contexts.map((c) => c.featureId).filter(Boolean))];
      if (affectedFeatures.length > 0) {
        lines.push(`- Affected features: ${affectedFeatures.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  private async broadcastFrictionReport(pattern: string, featureId: string): Promise<void> {
    const report: FrictionReport = {
      pattern,
      filedAt: new Date().toISOString(),
      featureId,
      instanceId: this.deps.instanceId ?? 'unknown',
    };

    try {
      await this.deps.avaChannelService.postMessage(
        `[friction_report] ${JSON.stringify(report)}`,
        'system',
        {
          intent: 'inform',
          expectsResponse: false,
        }
      );
      logger.info(`Broadcast friction_report for pattern="${pattern}" featureId=${featureId}`);
    } catch (err) {
      logger.error(`Failed to broadcast friction_report for pattern="${pattern}":`, err);
    }
  }
}
