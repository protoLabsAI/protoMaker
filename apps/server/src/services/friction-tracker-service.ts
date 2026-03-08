/**
 * FrictionTrackerService — self-improvement loop for recurring failure patterns.
 *
 * Maintains an in-memory map of pattern → occurrenceCount. Each time a feature
 * hits blocked status, the FailureClassifierService classification is logged here.
 * When a pattern reaches 3 occurrences, the service files a System Improvement
 * feature via FeatureLoader.create() and broadcasts a friction_report message to
 * #backchannel (AvaChannel) so peer instances can de-duplicate.
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

  /** Pattern → occurrence count */
  private readonly counters = new Map<string, number>();

  /** Pattern → timestamp of the most-recent filing (local or peer) */
  private readonly recentFilings = new Map<string, number>();

  constructor(deps: FrictionTrackerDependencies) {
    this.deps = deps;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Record a failure occurrence for the given pattern.
   *
   * If the counter reaches OCCURRENCE_THRESHOLD and no peer has filed the same
   * pattern within the last 24 hours, a System Improvement feature is created
   * and a friction_report is broadcast to the backchannel.
   */
  async recordFailure(pattern: string): Promise<void> {
    if (!pattern) return;

    const current = (this.counters.get(pattern) ?? 0) + 1;
    this.counters.set(pattern, current);

    logger.debug(`Friction counter updated: pattern="${pattern}" count=${current}`);

    if (current >= OCCURRENCE_THRESHOLD) {
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
   */
  getCount(pattern: string): number {
    return this.counters.get(pattern) ?? 0;
  }

  /**
   * Remove a resolved pattern from both the counter and dedup maps.
   * Called when a System Improvement feature for this pattern moves to done,
   * either locally or via a pattern_resolved broadcast from a peer.
   */
  resolvePattern(pattern: string): void {
    if (!pattern) return;
    this.counters.delete(pattern);
    this.recentFilings.delete(pattern);
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

    // Mark as locally filed immediately to prevent concurrent duplicate filings
    this.recentFilings.set(pattern, Date.now());

    try {
      const title = `System Improvement: recurring ${pattern} failures`;
      const description =
        `This feature was automatically filed by the self-improvement loop.\n\n` +
        `Pattern "${pattern}" has failed ${OCCURRENCE_THRESHOLD} or more times, ` +
        `indicating a systemic issue that warrants investigation and remediation.\n\n` +
        `**Action required:** Investigate the root cause of recurring ${pattern} failures ` +
        `and implement a durable fix to prevent future occurrences.`;

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
