/**
 * EventStore - In-memory ring buffer for correlated events.
 *
 * Stores up to 10,000 events in a FIFO ring buffer.
 * Provides query methods for retrieving events by correlationId, featureId, topic,
 * and for reconstructing full causal chains.
 *
 * This is a transient store — events are lost on server restart.
 * For persistent event storage, see EventLedgerService (JSONL-based).
 */

import { randomUUID } from 'crypto';
import { createLogger } from '@protolabsai/utils';
import type { CorrelatedEvent, EventChain, EventQuery, EventMetadata } from '@protolabsai/types';

const logger = createLogger('EventStore');

const DEFAULT_CAPACITY = 10_000;
const DEFAULT_QUERY_LIMIT = 100;

export class EventStore {
  private readonly buffer: Array<CorrelatedEvent | undefined>;
  private readonly capacity: number;
  private writeIndex = 0;
  private count = 0;
  private evictionWarningLogged = false;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Store a correlated event in the ring buffer.
   * Evicts the oldest event when capacity is reached (FIFO).
   */
  store(event: CorrelatedEvent): void {
    if (this.count >= this.capacity && !this.evictionWarningLogged) {
      logger.warn(
        `EventStore ring buffer at capacity (${this.capacity}). Oldest events will be evicted.`
      );
      this.evictionWarningLogged = true;
    }

    this.buffer[this.writeIndex] = event;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Generate a new event ID (UUID v4).
   */
  generateEventId(): string {
    return randomUUID();
  }

  /**
   * Generate a new correlation ID (UUID v4).
   */
  generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Create a CorrelatedEvent with auto-generated eventId and timestamp.
   */
  createEvent(
    topic: string,
    payload: unknown,
    source: string,
    metadata?: Partial<EventMetadata>
  ): CorrelatedEvent {
    return {
      eventId: this.generateEventId(),
      correlationId: metadata?.correlationId ?? this.generateCorrelationId(),
      causationId: metadata?.causationId,
      topic,
      payload,
      timestamp: Date.now(),
      source: metadata?.source ?? source,
    };
  }

  /**
   * Retrieve all events matching a correlation ID, ordered by timestamp.
   */
  queryByCorrelationId(correlationId: string): CorrelatedEvent[] {
    return this.getAllEvents().filter((e) => e.correlationId === correlationId);
  }

  /**
   * Retrieve events whose payload contains the given featureId.
   * Searches payload objects for a `featureId` property.
   */
  queryByFeatureId(featureId: string, since?: number): CorrelatedEvent[] {
    return this.getAllEvents().filter((e) => {
      if (since !== undefined && e.timestamp < since) return false;
      return this.payloadContainsFeatureId(e.payload, featureId);
    });
  }

  /**
   * Retrieve all events matching a topic, ordered by timestamp.
   */
  queryByTopic(topic: string): CorrelatedEvent[] {
    return this.getAllEvents().filter((e) => e.topic === topic);
  }

  /**
   * Reconstruct a full causal chain from a correlation ID.
   * Returns events sorted by timestamp with computed duration.
   */
  getChain(correlationId: string): EventChain {
    const events = this.queryByCorrelationId(correlationId);

    if (events.length === 0) {
      return {
        correlationId,
        events: [],
        startTime: 0,
        endTime: 0,
        duration: 0,
      };
    }

    const startTime = events[0].timestamp;
    const endTime = events[events.length - 1].timestamp;

    return {
      correlationId,
      events,
      startTime,
      endTime,
      duration: endTime - startTime,
    };
  }

  /**
   * General-purpose query with filtering and pagination.
   */
  query(options: EventQuery): { events: CorrelatedEvent[]; total: number } {
    let results = this.getAllEvents();

    if (options.correlationId) {
      results = results.filter((e) => e.correlationId === options.correlationId);
    }
    if (options.featureId) {
      results = results.filter((e) => this.payloadContainsFeatureId(e.payload, options.featureId!));
    }
    if (options.topic) {
      results = results.filter((e) => e.topic === options.topic);
    }
    if (options.since !== undefined) {
      results = results.filter((e) => e.timestamp >= options.since!);
    }
    if (options.until !== undefined) {
      results = results.filter((e) => e.timestamp <= options.until!);
    }

    const total = results.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? DEFAULT_QUERY_LIMIT;

    return {
      events: results.slice(offset, offset + limit),
      total,
    };
  }

  /**
   * Return the number of events currently stored.
   */
  size(): number {
    return this.count;
  }

  /**
   * Clear all stored events. Primarily for testing.
   */
  clear(): void {
    this.buffer.fill(undefined);
    this.writeIndex = 0;
    this.count = 0;
    this.evictionWarningLogged = false;
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Return all stored events sorted by timestamp (oldest first).
   */
  private getAllEvents(): CorrelatedEvent[] {
    const events: CorrelatedEvent[] = [];

    if (this.count < this.capacity) {
      // Buffer not yet full — events are at indices 0..count-1
      for (let i = 0; i < this.count; i++) {
        const event = this.buffer[i];
        if (event) events.push(event);
      }
    } else {
      // Buffer is full — read from writeIndex (oldest) around to writeIndex-1 (newest)
      for (let i = 0; i < this.capacity; i++) {
        const index = (this.writeIndex + i) % this.capacity;
        const event = this.buffer[index];
        if (event) events.push(event);
      }
    }

    return events.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Check whether an event payload contains a featureId property matching the target.
   */
  private payloadContainsFeatureId(payload: unknown, featureId: string): boolean {
    if (payload === null || payload === undefined || typeof payload !== 'object') {
      return false;
    }

    const obj = payload as Record<string, unknown>;

    if (obj.featureId === featureId) return true;

    // Check nested payload (some events wrap data in a nested payload property)
    if (typeof obj.payload === 'object' && obj.payload !== null) {
      const nested = obj.payload as Record<string, unknown>;
      if (nested.featureId === featureId) return true;
    }

    // Check context object
    if (typeof obj.context === 'object' && obj.context !== null) {
      const ctx = obj.context as Record<string, unknown>;
      if (ctx.featureId === featureId) return true;
    }

    return false;
  }
}
