/**
 * Escalation Router Service
 *
 * Receives EscalationSignal events, deduplicates by key within time window,
 * rate-limits per channel, and routes to registered EscalationChannel implementations.
 *
 * Features:
 * - Signal deduplication (30min window by default)
 * - Per-channel rate limiting (configurable via channel.rateLimit)
 * - Plug-and-play channel registration via canHandle() pattern
 * - Audit log for signal history
 */

import type { EscalationSignal, EscalationChannel } from '@automaker/types';
import { EscalationSeverity } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('EscalationRouter');

/**
 * Audit log entry for signal history
 */
export interface EscalationLogEntry {
  signal: EscalationSignal;
  timestamp: string;
  routedTo: string[];
  deduplicated: boolean;
  rateLimited: string[];
}

/**
 * Channel rate limiting state
 */
interface ChannelRateState {
  timestamps: number[];
}

/**
 * Signal deduplication state
 */
interface DeduplicationEntry {
  key: string;
  timestamp: number;
}

/**
 * EscalationRouter manages signal routing and channel orchestration
 */
export class EscalationRouter {
  private channels: Map<string, EscalationChannel> = new Map();
  private signalLog: EscalationLogEntry[] = [];
  private rateLimitState: Map<string, ChannelRateState> = new Map();
  private recentSignals: Map<string, DeduplicationEntry> = new Map();
  private events: EventEmitter | null = null;
  private deduplicationWindowMs: number = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_LOG_ENTRIES = 1000;

  /**
   * Set event emitter for listening to escalation signals
   */
  setEventEmitter(events: EventEmitter): void {
    this.events = events;

    events.subscribe((type, payload) => {
      if (type === 'escalation:signal-received') {
        void this.routeSignal(payload as EscalationSignal);
      }
    });

    logger.info('EscalationRouter listening for escalation:signal-received events');
  }

  /**
   * Register an escalation channel
   */
  registerChannel(channel: EscalationChannel): void {
    if (this.channels.has(channel.name)) {
      logger.warn(`Channel ${channel.name} already registered, replacing`);
    }

    this.channels.set(channel.name, channel);
    this.rateLimitState.set(channel.name, { timestamps: [] });

    const rateInfo = channel.rateLimit
      ? `${channel.rateLimit.maxSignals}/${channel.rateLimit.windowMs}ms`
      : 'unlimited';
    logger.info(`Registered channel: ${channel.name} (rateLimit: ${rateInfo})`);
  }

  /**
   * Unregister a channel
   */
  unregisterChannel(channelName: string): void {
    this.channels.delete(channelName);
    this.rateLimitState.delete(channelName);
    logger.info(`Unregistered channel: ${channelName}`);
  }

  /**
   * Get all registered channels
   */
  getChannels(): EscalationChannel[] {
    return Array.from(this.channels.values());
  }

  /**
   * Route a signal to appropriate channels
   */
  async routeSignal(signal: EscalationSignal): Promise<void> {
    if (!signal.timestamp) {
      signal.timestamp = new Date().toISOString();
    }

    // Deduplication check
    if (this.isDuplicate(signal)) {
      logger.debug(`Signal deduplicated: ${signal.deduplicationKey}`);
      this.addToLog({
        signal,
        timestamp: signal.timestamp,
        routedTo: [],
        deduplicated: true,
        rateLimited: [],
      });

      if (this.events) {
        this.events.emit('escalation:signal-deduplicated', { signal });
      }
      return;
    }

    this.recordSignal(signal);

    // Low severity = log only
    if (signal.severity === EscalationSeverity.low) {
      logger.info(`Low severity signal logged: ${signal.type}`);
      this.addToLog({
        signal,
        timestamp: signal.timestamp,
        routedTo: [],
        deduplicated: false,
        rateLimited: [],
      });
      return;
    }

    // Route to channels that can handle this signal
    const routedTo: string[] = [];
    const rateLimited: string[] = [];

    for (const [name, channel] of this.channels.entries()) {
      // Ask channel if it can handle this signal
      if (!channel.canHandle(signal)) {
        continue;
      }

      // Check rate limit
      if (!this.checkRateLimit(name, channel.rateLimit)) {
        rateLimited.push(name);
        logger.debug(`Rate limit exceeded for channel: ${name}`);
        continue;
      }

      try {
        await channel.send(signal);
        routedTo.push(name);
        this.recordSend(name);
        logger.info(`Routed ${signal.severity} signal to ${name}: ${signal.type}`);

        if (this.events) {
          this.events.emit('escalation:signal-sent', {
            signal,
            channel: name,
          });
        }
      } catch (error) {
        logger.error(`Failed to send to channel ${name}:`, error);
        if (this.events) {
          this.events.emit('escalation:signal-failed', {
            signal,
            channel: name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    this.addToLog({
      signal,
      timestamp: signal.timestamp,
      routedTo,
      deduplicated: false,
      rateLimited,
    });

    if (this.events) {
      this.events.emit('escalation:signal-routed', {
        signal,
        routedTo,
        rateLimited,
      });
    }
  }

  /**
   * Check if signal is a duplicate within deduplication window
   */
  private isDuplicate(signal: EscalationSignal): boolean {
    const existing = this.recentSignals.get(signal.deduplicationKey);
    if (!existing) return false;

    const age = Date.now() - existing.timestamp;
    if (age > this.deduplicationWindowMs) {
      this.recentSignals.delete(signal.deduplicationKey);
      return false;
    }

    return true;
  }

  /**
   * Record signal for deduplication tracking
   */
  private recordSignal(signal: EscalationSignal): void {
    this.recentSignals.set(signal.deduplicationKey, {
      key: signal.deduplicationKey,
      timestamp: Date.now(),
    });
    this.cleanupOldSignals();
  }

  /**
   * Clean up expired signal entries
   */
  private cleanupOldSignals(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.recentSignals.entries()) {
      if (now - entry.timestamp > this.deduplicationWindowMs) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.recentSignals.delete(key);
    }
  }

  /**
   * Check if channel is within rate limit
   */
  private checkRateLimit(channelName: string, rateLimit?: EscalationChannel['rateLimit']): boolean {
    if (!rateLimit) return true;

    const state = this.rateLimitState.get(channelName);
    if (!state) return true;

    const windowStart = Date.now() - rateLimit.windowMs;
    state.timestamps = state.timestamps.filter((t) => t > windowStart);

    return state.timestamps.length < rateLimit.maxSignals;
  }

  /**
   * Record a send for rate limiting
   */
  private recordSend(channelName: string): void {
    const state = this.rateLimitState.get(channelName);
    if (state) {
      state.timestamps.push(Date.now());
    }
  }

  /**
   * Add entry to audit log
   */
  private addToLog(entry: EscalationLogEntry): void {
    this.signalLog.push(entry);
    if (this.signalLog.length > this.MAX_LOG_ENTRIES) {
      this.signalLog = this.signalLog.slice(-this.MAX_LOG_ENTRIES);
    }
  }

  /**
   * Get signal log (most recent first)
   */
  getLog(limit?: number): EscalationLogEntry[] {
    const log = [...this.signalLog].reverse();
    return limit ? log.slice(0, limit) : log;
  }

  /**
   * Get router status
   */
  getStatus(): {
    channelCount: number;
    channels: Array<{
      name: string;
      rateLimit?: { maxSignals: number; windowMs: number };
      recentSends: number;
    }>;
    recentSignalCount: number;
    logEntryCount: number;
  } {
    const channels = Array.from(this.channels.values()).map((channel) => {
      const state = this.rateLimitState.get(channel.name);
      const windowMs = channel.rateLimit?.windowMs ?? 3600000;
      const windowStart = Date.now() - windowMs;
      const recentSends = state ? state.timestamps.filter((t) => t > windowStart).length : 0;

      return {
        name: channel.name,
        rateLimit: channel.rateLimit,
        recentSends,
      };
    });

    return {
      channelCount: this.channels.size,
      channels,
      recentSignalCount: this.recentSignals.size,
      logEntryCount: this.signalLog.length,
    };
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.signalLog = [];
    this.recentSignals.clear();
    for (const state of this.rateLimitState.values()) {
      state.timestamps = [];
    }
  }
}

// Singleton instance
let routerInstance: EscalationRouter | null = null;

/**
 * Get or create the singleton escalation router instance
 */
export function getEscalationRouter(): EscalationRouter {
  if (!routerInstance) {
    routerInstance = new EscalationRouter();
    logger.info('EscalationRouter instance created');
  }
  return routerInstance;
}
