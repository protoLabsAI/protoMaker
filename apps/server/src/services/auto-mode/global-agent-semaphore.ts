/**
 * GlobalAgentSemaphore — process-wide cap on simultaneous agent executions.
 *
 * When multiple apps run auto-mode concurrently each project enforces its own
 * per-project `maxConcurrency`, but nothing prevents N projects × M concurrency
 * from spawning N×M agents and triggering OOM crashes.
 *
 * This singleton semaphore gates every `runAgent` call so the total number of
 * concurrently active agents never exceeds `systemMaxConcurrency` (read from
 * settings, with `MAX_SYSTEM_CONCURRENCY` as the hard ceiling).
 *
 * Callers that arrive when the cap is reached are *queued*, not dropped —
 * they resume automatically when a slot is freed.
 *
 * Usage:
 *   const release = await globalAgentSemaphore.acquire(settingsService);
 *   try {
 *     // ... run agent ...
 *   } finally {
 *     release();
 *   }
 */

import { MAX_SYSTEM_CONCURRENCY } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import type { SettingsService } from '../settings-service.js';

const logger = createLogger('GlobalAgentSemaphore');

/** Callback invoked when a queued waiter is granted a slot. */
type SlotResolver = () => void;

export class GlobalAgentSemaphore {
  private activeCount = 0;
  private readonly queue: SlotResolver[] = [];

  /**
   * Acquire a semaphore slot.
   *
   * Returns immediately when `activeCount < cap`.  Otherwise suspends the
   * caller in a FIFO queue until another holder calls its release function.
   *
   * The returned release function MUST be called exactly once when the agent
   * finishes (success, error, or abort).
   *
   * @param settingsService - Optional settings service used to read the
   *   effective system cap.  When null/undefined the env-var hard limit
   *   (`MAX_SYSTEM_CONCURRENCY`) is used as the cap.
   */
  async acquire(settingsService: SettingsService | null | undefined): Promise<() => void> {
    const cap = await this.readCap(settingsService);

    if (this.activeCount < cap) {
      this.activeCount++;
      logger.debug(
        `[GlobalAgentSemaphore] Slot acquired immediately (${this.activeCount}/${cap} active)`
      );
      return this.makeRelease(settingsService);
    }

    // Cap reached — enqueue the caller and wait for a slot.
    logger.info(
      `[GlobalAgentSemaphore] Cap reached (${this.activeCount}/${cap}), queuing agent launch ` +
        `(${this.queue.length + 1} waiting)`
    );

    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.activeCount++;
        resolve(this.makeRelease(settingsService));
      });
    });
  }

  private makeRelease(settingsService: SettingsService | null | undefined): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeCount--;
      logger.debug(
        `[GlobalAgentSemaphore] Slot released (${this.activeCount} active, ${this.queue.length} queued)`
      );
      void this.drain(settingsService);
    };
  }

  /**
   * Process queued waiters after a slot is freed.
   * Re-reads the cap on each drain so live config changes take effect.
   */
  private async drain(settingsService: SettingsService | null | undefined): Promise<void> {
    const cap = await this.readCap(settingsService);
    while (this.queue.length > 0 && this.activeCount < cap) {
      const next = this.queue.shift()!;
      next();
    }
  }

  private async readCap(settingsService: SettingsService | null | undefined): Promise<number> {
    if (settingsService) {
      try {
        const settings = await settingsService.getGlobalSettings();
        if (
          typeof settings.systemMaxConcurrency === 'number' &&
          settings.systemMaxConcurrency > 0
        ) {
          // Honour the admin-configured cap but never exceed the hard env-var ceiling.
          return Math.min(settings.systemMaxConcurrency, MAX_SYSTEM_CONCURRENCY);
        }
      } catch {
        // Settings unavailable — fall through to hard limit.
      }
    }
    return MAX_SYSTEM_CONCURRENCY;
  }

  // ── Observability ──────────────────────────────────────────────────────────

  /** Number of agents currently holding a slot. */
  getActiveCount(): number {
    return this.activeCount;
  }

  /** Number of agent launches waiting for a slot to free up. */
  getQueueLength(): number {
    return this.queue.length;
  }

  // ── Testing helpers ────────────────────────────────────────────────────────

  /**
   * Reset internal state.  Only intended for use in unit tests.
   */
  _reset(): void {
    this.activeCount = 0;
    this.queue.length = 0;
  }
}

/** Process-wide singleton — shared across all project execution contexts. */
export const globalAgentSemaphore = new GlobalAgentSemaphore();
