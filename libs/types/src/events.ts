/**
 * Types for the EventBus-CRDT bridge.
 *
 * Defines the protocol for broadcasting EventBus events to remote peers
 * via the CRDT sync channel, and which event types are eligible for sync.
 */

import type { EventType } from './event.js';

/**
 * Event types that propagate across CRDT sync instances.
 *
 * Features are LOCAL to each instance (never cross the wire).
 * Only projects and shared coordination events are synced.
 */
export const CRDT_SYNCED_EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  'project:created',
  'project:updated',
  'project:deleted',
  'categories:updated',
]);

/**
 * CRDT wire message carrying a local EventBus event to remote instances.
 * Transported as JSON over the sync WebSocket channel.
 * Covers all wire message types (project events, settings events, etc.)
 */
export interface CrdtSyncWireMessage {
  type: 'feature_event';
  /** Originating instance ID — receivers skip re-emit if it matches self */
  instanceId: string;
  eventType: EventType;
  payload: unknown;
  timestamp: string;
  /** Project name from proto.config.yaml — receivers reject events for foreign projects */
  projectName?: string;
}
