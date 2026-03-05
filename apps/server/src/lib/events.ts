/**
 * Event emitter for streaming events to WebSocket clients
 *
 * Implements the EventBus interface for pluggable event transport.
 * Current implementation is in-memory (Set<Callback>). Future implementations
 * (NATS, Redis) can be swapped in for hivemind distribution.
 */

import type {
  EventType,
  EventCallback,
  EventBus,
  EventSubscription,
  EventPayload,
  TypedEventCallback,
} from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('Events');

// Re-export event types from shared package
export type { EventType, EventCallback };

// EventEmitter extends EventBus, keeping backward compatibility.
// subscribe() returns a function (legacy cleanup pattern) that also has .unsubscribe()
export type UnsubscribeFn = (() => void) & EventSubscription;

export interface EventEmitter extends EventBus {
  emit: (type: EventType, payload: unknown) => void;
  subscribe: (callback: EventCallback) => UnsubscribeFn;
  on: <T extends EventType>(type: T, callback: TypedEventCallback<T>) => UnsubscribeFn;
}

export function createEventEmitter(): EventEmitter {
  const subscribers = new Set<EventCallback>();
  const typedHandlers = new Map<EventType, Set<(payload: unknown) => void>>();

  function makeUnsub(fn: () => void): UnsubscribeFn {
    const unsub = fn as UnsubscribeFn;
    unsub.unsubscribe = fn;
    return unsub;
  }

  const bus: EventEmitter = {
    emit(type: EventType, payload: unknown) {
      for (const callback of subscribers) {
        try {
          callback(type, payload);
        } catch (error) {
          logger.error('Error in event subscriber:', error);
        }
      }
      const handlers = typedHandlers.get(type);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(payload);
          } catch (error) {
            logger.error('Error in typed event handler:', error);
          }
        }
      }
    },

    subscribe(callback: EventCallback) {
      subscribers.add(callback);
      return makeUnsub(() => {
        subscribers.delete(callback);
      });
    },

    on<T extends EventType>(type: T, handler: (payload: EventPayload<T>) => void): UnsubscribeFn {
      if (!typedHandlers.has(type)) {
        typedHandlers.set(type, new Set());
      }
      const typed = handler as (payload: unknown) => void;
      typedHandlers.get(type)!.add(typed);
      return makeUnsub(() => {
        typedHandlers.get(type)?.delete(typed);
      });
    },

    broadcast(type: EventType, payload?: unknown) {
      // In single-instance mode, broadcast === emit.
      // In hivemind mode, this will also publish to the mesh.
      bus.emit(type, payload);
    },
  };

  return bus;
}
