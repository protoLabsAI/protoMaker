/**
 * Event emitter for streaming events to WebSocket clients
 *
 * Implements the EventBus interface for pluggable event transport.
 * Current implementation is in-memory (Set<Callback>). Future implementations
 * (NATS, Redis) can be swapped in for hivemind distribution.
 */

import type { EventType, EventCallback, EventBus, EventSubscription } from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('Events');

// Re-export event types from shared package
export type { EventType, EventCallback };

// EventEmitter extends EventBus, keeping backward compatibility.
// subscribe() returns a function (legacy cleanup pattern) that also has .unsubscribe()
export type UnsubscribeFn = (() => void) & EventSubscription;

export interface EventEmitter extends EventBus {
  emit: (type: EventType, payload: unknown) => void;
  subscribe: (callback: EventCallback) => UnsubscribeFn;
}

export function createEventEmitter(): EventEmitter {
  const subscribers = new Set<EventCallback>();

  const bus: EventEmitter = {
    emit(type: EventType, payload: unknown) {
      for (const callback of subscribers) {
        try {
          callback(type, payload);
        } catch (error) {
          logger.error('Error in event subscriber:', error);
        }
      }
    },

    subscribe(callback: EventCallback) {
      subscribers.add(callback);
      // Return cleanup function (legacy pattern, still works)
      const unsub = () => {
        subscribers.delete(callback);
      };
      // Attach EventSubscription interface for new consumers
      const unsubWithMethod = unsub as UnsubscribeFn;
      unsubWithMethod.unsubscribe = unsub;
      return unsubWithMethod;
    },

    broadcast(type: EventType, payload?: unknown) {
      // In single-instance mode, broadcast === emit.
      // In hivemind mode, this will also publish to the mesh.
      bus.emit(type, payload);
    },
  };

  return bus;
}
