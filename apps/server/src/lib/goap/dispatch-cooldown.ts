/**
 * Dispatch Cooldown — prevents tick-rate storms from GOAP incident response actions.
 *
 * Tracks `lastFiredAt` per composite key (action + agentId + skillId) and enforces
 * a configurable cooldown window. Actions within the cooldown are suppressed with
 * a logged reason.
 */

import { createLogger } from '@protolabsai/utils';
import { DEFAULT_GOAP_CONFIG, type GoapFeedbackLoopConfig } from './goap-config.js';

const logger = createLogger('DispatchCooldown');

export interface CooldownEntry {
  key: string;
  lastFiredAt: number;
  suppressedCount: number;
}

export interface CooldownCheckResult {
  suppressed: boolean;
  reason?: string;
  remainingMs?: number;
  existingEntry?: CooldownEntry;
}

export class DispatchCooldown {
  private entries = new Map<string, CooldownEntry>();
  private readonly cooldownMs: number;

  constructor(config?: Partial<GoapFeedbackLoopConfig>) {
    this.cooldownMs = config?.cooldownWindowMs ?? DEFAULT_GOAP_CONFIG.cooldownWindowMs;
  }

  /**
   * Build composite key from action identifiers.
   * Uses agent+skill when available; falls back to action name alone.
   */
  static buildKey(action: string, agentId?: string, skillId?: string): string {
    const parts = [action];
    if (agentId) parts.push(agentId);
    if (skillId) parts.push(skillId);
    return parts.join(':');
  }

  /**
   * Check if a dispatch should be suppressed due to cooldown.
   */
  check(key: string, now = Date.now()): CooldownCheckResult {
    const entry = this.entries.get(key);
    if (!entry) {
      return { suppressed: false };
    }

    const elapsed = now - entry.lastFiredAt;
    if (elapsed < this.cooldownMs) {
      const remainingMs = this.cooldownMs - elapsed;
      return {
        suppressed: true,
        reason: `Cooldown active for "${key}": ${Math.ceil(remainingMs / 1000)}s remaining (fired ${Math.floor(elapsed / 1000)}s ago)`,
        remainingMs,
        existingEntry: entry,
      };
    }

    return { suppressed: false };
  }

  /**
   * Record that an action was fired. Resets the cooldown window.
   */
  recordFiring(key: string, now = Date.now()): void {
    const existing = this.entries.get(key);
    this.entries.set(key, {
      key,
      lastFiredAt: now,
      suppressedCount: existing?.suppressedCount ?? 0,
    });
    logger.debug(`Cooldown recorded for "${key}"`);
  }

  /**
   * Check cooldown and record suppression if within window.
   * Returns the check result. If not suppressed, also records the firing.
   */
  checkAndRecord(key: string, now = Date.now()): CooldownCheckResult {
    const result = this.check(key, now);
    if (result.suppressed) {
      const entry = this.entries.get(key)!;
      entry.suppressedCount++;
      logger.warn(
        `Dispatch suppressed: ${result.reason} (total suppressed: ${entry.suppressedCount})`
      );
      return result;
    }

    this.recordFiring(key, now);
    return result;
  }

  /**
   * Get all active cooldown entries.
   */
  getEntries(): CooldownEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Clear all cooldown entries (used for testing/admin reset).
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Remove expired entries to prevent unbounded memory growth.
   */
  prune(now = Date.now()): number {
    let pruned = 0;
    for (const [key, entry] of this.entries) {
      if (now - entry.lastFiredAt >= this.cooldownMs) {
        this.entries.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}
