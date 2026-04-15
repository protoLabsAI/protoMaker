/**
 * Webhook Delivery Service - Tracks inbound webhook processing with retry and deduplication
 *
 * Wraps webhook handling with delivery tracking, exponential backoff retry,
 * and rolling-window duplicate detection. All state is in-memory (Map with
 * max 500 entries, oldest evicted first). This is transient operational data
 * that does not survive server restarts.
 *
 * Usage:
 *   const deliveryId = service.trackDelivery('github', 'pull_request', payload);
 *   try {
 *     await processWebhook(payload);
 *     service.markCompleted(deliveryId);
 *   } catch (err) {
 *     service.markFailed(deliveryId, err.message);
 *   }
 */

import { randomUUID } from 'crypto';
import { createLogger } from '@protolabsai/utils';
import type {
  WebhookDelivery,
  WebhookDeliverySource,
  WebhookDeliveryStatus,
} from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('WebhookDeliveryService');

/** Maximum number of delivery records kept in memory */
const MAX_DELIVERIES = 500;

/** Default maximum retry attempts per delivery */
const DEFAULT_MAX_ATTEMPTS = 3;

/** Exponential backoff delays in milliseconds: 1s, 5s, 30s */
const RETRY_DELAYS_MS = [1_000, 5_000, 30_000] as const;

/** Window (ms) for deduplication lookups — check deliveries from the last 24 hours.
 *  GitHub can retry a failed delivery for up to 72h; 24h covers all practical retry scenarios
 *  while keeping memory usage bounded (at most 500 entries regardless of window size). */
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Callback invoked when a delivery is retried. The caller provides the actual
 * reprocessing logic so the service remains decoupled from webhook routing.
 */
export type RetryHandler = (delivery: WebhookDelivery) => Promise<void>;

export class WebhookDeliveryService {
  private deliveries = new Map<string, WebhookDelivery>();
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private events: EventEmitter | null = null;
  private retryHandler: RetryHandler | null = null;

  /**
   * Wire the event emitter for broadcasting delivery lifecycle events.
   */
  setEventEmitter(events: EventEmitter): void {
    this.events = events;
  }

  /**
   * Register the callback invoked on retry. Without this, retries are
   * tracked but no reprocessing occurs.
   */
  setRetryHandler(handler: RetryHandler): void {
    this.retryHandler = handler;
  }

  /**
   * Begin tracking a new webhook delivery.
   *
   * @returns The delivery ID for subsequent status updates.
   */
  trackDelivery(
    source: WebhookDeliverySource,
    eventType: string,
    payload?: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): string {
    this.evictOldestIfFull();

    const id = randomUUID();
    const now = new Date().toISOString();

    const delivery: WebhookDelivery = {
      id,
      source,
      eventType,
      receivedAt: now,
      status: 'pending',
      attempts: 1,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      payload,
      metadata,
    };

    this.deliveries.set(id, delivery);

    this.emit('webhook:delivery:received', {
      deliveryId: id,
      source,
      eventType,
      timestamp: now,
    });

    logger.debug(`Tracking delivery ${id} (${source}/${eventType})`);
    return id;
  }

  /**
   * Mark a delivery as successfully completed.
   */
  markCompleted(deliveryId: string): void {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) {
      logger.warn(`markCompleted: unknown delivery ${deliveryId}`);
      return;
    }

    const now = new Date().toISOString();
    delivery.status = 'completed';
    delivery.completedAt = now;

    const durationMs = new Date(now).getTime() - new Date(delivery.receivedAt).getTime();

    this.clearRetryTimer(deliveryId);

    this.emit('webhook:delivery:completed', {
      deliveryId,
      source: delivery.source,
      eventType: delivery.eventType,
      durationMs,
      timestamp: now,
    });

    logger.debug(
      `Delivery ${deliveryId} completed in ${durationMs}ms (${delivery.source}/${delivery.eventType})`
    );
  }

  /**
   * Mark a delivery as failed. If attempts remain, schedule an exponential
   * backoff retry. Otherwise mark as permanently failed.
   */
  markFailed(deliveryId: string, error: string): void {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) {
      logger.warn(`markFailed: unknown delivery ${deliveryId}`);
      return;
    }

    delivery.lastError = error;
    const now = new Date().toISOString();

    const willRetry = delivery.attempts < delivery.maxAttempts;

    if (willRetry) {
      this.scheduleRetry(delivery);
    } else {
      delivery.status = 'failed';
    }

    this.emit('webhook:delivery:failed', {
      deliveryId,
      source: delivery.source,
      eventType: delivery.eventType,
      error,
      attempts: delivery.attempts,
      willRetry,
      timestamp: now,
    });

    if (!willRetry) {
      logger.warn(
        `Delivery ${deliveryId} permanently failed after ${delivery.attempts} attempts: ${error}`
      );
    }
  }

  /**
   * Retrieve a single delivery record by ID.
   */
  getDelivery(deliveryId: string): WebhookDelivery | undefined {
    return this.deliveries.get(deliveryId);
  }

  /**
   * Return the most recent deliveries, newest first.
   */
  getRecentDeliveries(limit = 100): WebhookDelivery[] {
    const all = Array.from(this.deliveries.values());
    // Sort descending by receivedAt
    all.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
    return all.slice(0, limit);
  }

  /**
   * Check whether a recent delivery with the same source, event type, and
   * deduplication key already exists. This prevents double-processing when
   * GitHub sends the same webhook twice within a short window.
   *
   * @param deduplicationKey - A caller-chosen string that uniquely identifies
   *   the logical event (e.g. `${prNumber}:${action}:${sha}`).
   */
  isDuplicate(source: WebhookDeliverySource, eventType: string, deduplicationKey: string): boolean {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;

    for (const delivery of this.deliveries.values()) {
      if (
        delivery.source === source &&
        delivery.eventType === eventType &&
        delivery.metadata?.deduplicationKey === deduplicationKey &&
        new Date(delivery.receivedAt).getTime() >= cutoff
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Cancel all pending retry timers. Call on server shutdown.
   */
  shutdown(): void {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    logger.debug('Shutdown: cleared all retry timers');
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private scheduleRetry(delivery: WebhookDelivery): void {
    const attemptIndex = Math.min(delivery.attempts - 1, RETRY_DELAYS_MS.length - 1);
    const delayMs = RETRY_DELAYS_MS[attemptIndex];
    const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

    delivery.status = 'retrying';
    delivery.nextRetryAt = nextRetryAt;

    this.emit('webhook:delivery:retrying', {
      deliveryId: delivery.id,
      source: delivery.source,
      eventType: delivery.eventType,
      attempt: delivery.attempts + 1,
      nextRetryAt,
      timestamp: new Date().toISOString(),
    });

    logger.info(
      `Scheduling retry #${delivery.attempts + 1} for delivery ${delivery.id} in ${delayMs}ms`
    );

    const timer = setTimeout(() => {
      this.retryTimers.delete(delivery.id);
      this.executeRetry(delivery);
    }, delayMs);

    // Ensure the timer does not keep the process alive during shutdown
    timer.unref();

    this.clearRetryTimer(delivery.id);
    this.retryTimers.set(delivery.id, timer);
  }

  private async executeRetry(delivery: WebhookDelivery): Promise<void> {
    delivery.attempts += 1;
    delivery.status = 'processing';
    delivery.nextRetryAt = undefined;

    if (!this.retryHandler) {
      logger.warn(`No retry handler registered — marking delivery ${delivery.id} as failed`);
      delivery.status = 'failed';
      return;
    }

    try {
      await this.retryHandler(delivery);
      this.markCompleted(delivery.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.markFailed(delivery.id, message);
    }
  }

  private clearRetryTimer(deliveryId: string): void {
    const existing = this.retryTimers.get(deliveryId);
    if (existing) {
      clearTimeout(existing);
      this.retryTimers.delete(deliveryId);
    }
  }

  /**
   * Evict the oldest delivery when the map reaches capacity.
   * Oldest is determined by receivedAt timestamp.
   */
  private evictOldestIfFull(): void {
    if (this.deliveries.size < MAX_DELIVERIES) return;

    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, delivery] of this.deliveries) {
      const time = new Date(delivery.receivedAt).getTime();
      if (time < oldestTime) {
        oldestTime = time;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.clearRetryTimer(oldestId);
      this.deliveries.delete(oldestId);
    }
  }

  private emit(type: string, payload: Record<string, unknown>): void {
    if (!this.events) return;
    try {
      this.events.emit(type as Parameters<EventEmitter['emit']>[0], payload);
    } catch (err) {
      logger.error(`Failed to emit ${type}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton access
// ---------------------------------------------------------------------------

let instance: WebhookDeliveryService | null = null;

/**
 * Get or create the singleton WebhookDeliveryService instance.
 */
export function getWebhookDeliveryService(): WebhookDeliveryService {
  if (!instance) {
    instance = new WebhookDeliveryService();
  }
  return instance;
}
