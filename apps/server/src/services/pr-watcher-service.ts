/**
 * PR Watcher Service - Background CI monitor for Ava chat
 *
 * Watches a set of PRs for CI state changes and emits `pr:watch-resolved`
 * events through the server event bus when checks pass or fail.
 *
 * Ava calls `watch_pr` instead of polling `check_pr_status` in a loop.
 * The server pushes a WebSocket notification to the active session when
 * the PR's check state resolves.
 */

import { createLogger } from '@protolabsai/utils';
import { githubMergeService } from './github-merge-service.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('PRWatcherService');

/** Default polling interval: 30 seconds */
const DEFAULT_POLL_INTERVAL_MS = 30_000;

/** Auto-expire watches after 30 minutes */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

interface WatchEntry {
  /** The chat session ID that initiated the watch (used to route the notification) */
  sessionId?: string;
  /** Project path for gh CLI calls */
  projectPath: string;
  /** Epoch ms when the watch was registered */
  watchedSince: number;
  /** Last observed CI status string (null = never checked) */
  lastStatus: string | null;
}

export class PRWatcherService {
  private readonly registry: Map<number, WatchEntry> = new Map();
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly events: EventEmitter,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ) {
    this.pollIntervalMs = pollIntervalMs;
    this.timeoutMs = timeoutMs;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Register a PR to watch.  Starts the polling loop if not already running.
   */
  addWatch(prNumber: number, projectPath: string, sessionId?: string): void {
    if (this.registry.has(prNumber)) {
      logger.debug(`PR #${prNumber} already being watched — updating entry`);
    } else {
      logger.info(`Watching PR #${prNumber} (session: ${sessionId ?? 'broadcast'})`);
    }

    this.registry.set(prNumber, {
      sessionId,
      projectPath,
      watchedSince: Date.now(),
      lastStatus: null,
    });

    this.events.emit('pr:watch-added', {
      prNumber,
      projectPath,
      sessionId,
    });

    this.ensurePolling();
  }

  /**
   * Remove a PR from the watch registry (stops polling if registry becomes empty).
   */
  removeWatch(prNumber: number): void {
    this.registry.delete(prNumber);
    if (this.registry.size === 0) {
      this.stopPolling();
    }
  }

  /** Returns true if the PR is currently being watched. */
  isWatching(prNumber: number): boolean {
    return this.registry.has(prNumber);
  }

  /**
   * Immediately check a specific PR (called from the GitHub webhook handler
   * when a `check_run` completed event arrives — faster than waiting for poll).
   */
  async triggerCheck(prNumber: number): Promise<void> {
    const entry = this.registry.get(prNumber);
    if (!entry) return;
    await this.checkPR(prNumber, entry);
  }

  /** Stop the background polling loop (e.g. for graceful shutdown). */
  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      logger.debug('Polling loop stopped');
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private ensurePolling(): void {
    if (this.pollingTimer) return;
    logger.debug(`Starting polling loop (interval: ${this.pollIntervalMs}ms)`);
    this.pollingTimer = setInterval(() => {
      void this.pollAll();
    }, this.pollIntervalMs);
  }

  private async pollAll(): Promise<void> {
    const now = Date.now();
    for (const [prNumber, entry] of this.registry) {
      // Auto-expire watches that have exceeded the timeout
      if (now - entry.watchedSince > this.timeoutMs) {
        logger.info(
          `PR #${prNumber} watch timed out after ${this.timeoutMs / 60_000}min — removing`
        );
        this.removeWatch(prNumber);
        continue;
      }
      await this.checkPR(prNumber, entry);
    }
  }

  private async checkPR(prNumber: number, entry: WatchEntry): Promise<void> {
    try {
      const status = await githubMergeService.checkPRStatus(entry.projectPath, prNumber);

      const resolved = status.allChecksPassed || status.failedCount > 0;
      if (!resolved) {
        // Still pending — keep watching
        logger.debug(
          `PR #${prNumber}: ${status.passedCount} passed, ${status.failedCount} failed, ${status.pendingCount} pending`
        );
        return;
      }

      const outcome: 'passed' | 'failed' = status.allChecksPassed ? 'passed' : 'failed';
      const checks = status.failedChecks.map((name) => ({ name, conclusion: 'failure' }));

      logger.info(`PR #${prNumber} CI resolved: ${outcome}`);

      // Emit resolution event (forwarded to all WebSocket clients)
      this.events.emit('pr:watch-resolved', {
        prNumber,
        projectPath: entry.projectPath,
        sessionId: entry.sessionId,
        status: outcome,
        checks,
        timestamp: new Date().toISOString(),
      });

      // Auto-remove after resolution
      this.removeWatch(prNumber);
    } catch (err) {
      logger.warn(`Error checking PR #${prNumber}: ${err}`);
    }
  }
}

// ── Module-level singleton ─────────────────────────────────────────────────
// Lazily initialised on first call that provides an EventEmitter.
// Subsequent calls (e.g. from the webhook handler) retrieve the existing instance.

let _instance: PRWatcherService | null = null;

/**
 * Get (or create) the shared PRWatcherService singleton.
 *
 * @param events - Required on first call; ignored on subsequent calls.
 */
export function getPRWatcherService(events?: EventEmitter): PRWatcherService | null {
  if (_instance) return _instance;
  if (!events) return null;
  _instance = new PRWatcherService(events);
  return _instance;
}
