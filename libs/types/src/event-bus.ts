/**
 * EventBus interface — pluggable event transport abstraction.
 *
 * Extracted from createEventEmitter() in lib/events.ts. The current
 * in-memory implementation uses a Set<Callback>. Future implementations
 * (NATS, Redis pub/sub) can be swapped in for hivemind distribution.
 */

import type { EventType, EventCallback, TypedEventCallback } from './event.js';

/** Handle returned by subscribe() for cleanup */
export interface EventSubscription {
  unsubscribe(): void;
}

export interface EventBus {
  /** Emit an event to local subscribers */
  emit(type: EventType, payload?: unknown): void;

  /**
   * Subscribe to all events. Returns an EventSubscription for cleanup.
   * The callback receives (type, payload) for every emitted event.
   */
  subscribe(callback: EventCallback): EventSubscription;

  /**
   * Subscribe to a single event type with a typed payload callback.
   * Returns an EventSubscription for cleanup.
   */
  on<T extends EventType>(type: T, callback: TypedEventCallback<T>): EventSubscription;

  /**
   * Broadcast an event to all subscribers, including remote peers.
   * In single-instance mode, this is identical to emit().
   * In hivemind mode, this also publishes to the mesh.
   */
  broadcast(type: EventType, payload?: unknown): void;
}
