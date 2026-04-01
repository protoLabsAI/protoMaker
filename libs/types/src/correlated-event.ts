/**
 * Correlated Event Types
 *
 * Enables full traceability of event chains through correlation IDs.
 * Every event in a causal chain shares a correlationId, while each event
 * has its own unique eventId. The causationId links to the direct parent.
 */

/**
 * A single event with correlation metadata for causal chain tracing.
 */
export interface CorrelatedEvent {
  /** Unique identifier for this event (UUID v4) */
  eventId: string;
  /** Shared across all events in the same causal chain (UUID v4) */
  correlationId: string;
  /** eventId of the direct parent event that caused this one */
  causationId?: string;
  /** Event type / topic (matches EventType from the event bus) */
  topic: string;
  /** Event data payload */
  payload: unknown;
  /** Timestamp when the event was created (Date.now()) */
  timestamp: number;
  /** Service name that emitted this event */
  source: string;
}

/**
 * Metadata for propagating correlation context between services.
 * Passed alongside events to maintain causal chain linkage.
 */
export interface EventMetadata {
  /** The correlation ID for the current causal chain */
  correlationId: string;
  /** The eventId of the parent event (for causation tracking) */
  causationId?: string;
  /** The service that originated or is propagating this event */
  source: string;
}

/**
 * A reconstructed causal chain of events sharing the same correlationId.
 */
export interface EventChain {
  /** The shared correlation ID for all events in this chain */
  correlationId: string;
  /** All events in the chain, ordered by timestamp */
  events: CorrelatedEvent[];
  /** Timestamp of the earliest event in the chain */
  startTime: number;
  /** Timestamp of the latest event in the chain */
  endTime: number;
  /** Duration from first to last event in milliseconds */
  duration: number;
}

/**
 * Query parameters for searching the event store.
 */
export interface EventQuery {
  /** Filter by correlation ID (exact match) */
  correlationId?: string;
  /** Filter by feature ID (searches event payloads) */
  featureId?: string;
  /** Filter by event topic (exact match) */
  topic?: string;
  /** Include only events after this timestamp */
  since?: number;
  /** Include only events before this timestamp */
  until?: number;
  /** Maximum number of events to return */
  limit?: number;
  /** Number of events to skip (for pagination) */
  offset?: number;
}
