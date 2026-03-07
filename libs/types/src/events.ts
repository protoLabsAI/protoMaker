/**
 * Types for the EventBus-CRDT bridge.
 *
 * Defines the protocol for broadcasting EventBus events to remote peers
 * via the CRDT sync channel, and which event types are eligible for sync.
 */

import type { EventType } from './event.js';

/**
 * Feature-related event types that propagate across CRDT sync instances.
 * Only these events are published to remote peers via the sync channel.
 */
export const CRDT_SYNCED_EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  'feature:status-changed',
  'feature:updated',
  'feature:created',
  'feature:deleted',
  'project:created',
  'project:updated',
  'project:deleted',
]);

/**
 * CRDT wire message carrying a local EventBus event to remote instances.
 * Transported as JSON over the sync WebSocket channel.
 */
export interface CrdtFeatureEvent {
  type: 'feature_event';
  /** Originating instance ID — receivers skip re-emit if it matches self */
  instanceId: string;
  eventType: EventType;
  payload: unknown;
  timestamp: string;
}
