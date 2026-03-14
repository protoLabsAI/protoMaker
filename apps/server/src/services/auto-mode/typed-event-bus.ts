/**
 * TypedEventBus — type-safe auto-mode event emitter
 *
 * Wraps the shared EventEmitter with a dedicated `emitAutoModeEvent()` method
 * that ensures all auto-mode events are emitted in the correct wire format
 * (`'auto-mode:event'` envelope) and with consistent payload shapes.
 *
 * Responsibilities:
 * - Translates logical event types + data into the `auto-mode:event` envelope
 * - Rate-limits `auto_mode_progress` events to prevent WebSocket overload
 */

import type { EventEmitter, EventType } from '../../lib/events.js';

/** Default minimum interval (ms) between progress events for the same feature. */
const DEFAULT_PROGRESS_INTERVAL_MS = 100;

export class TypedEventBus {
  private readonly events: EventEmitter;
  private readonly lastProgressEventTime = new Map<string, number>();
  private readonly progressIntervalMs: number;

  constructor(events: EventEmitter, progressIntervalMs = DEFAULT_PROGRESS_INTERVAL_MS) {
    this.events = events;
    this.progressIntervalMs = progressIntervalMs;
  }

  /**
   * Remove rate-limit tracking for a feature (call when a feature completes).
   * Prevents unbounded growth of the lastProgressEventTime map.
   */
  clearFeature(featureId: string): void {
    this.lastProgressEventTime.delete(featureId);
  }

  /**
   * Emit an auto-mode event wrapped in the `auto-mode:event` envelope.
   *
   * All auto-mode events must go through this method so the client receives
   * a consistent `{ type, ...data }` shape on the `auto-mode:event` bus topic.
   *
   * `auto_mode_progress` events are rate-limited to at most one per
   * `progressIntervalMs` milliseconds per feature to prevent WebSocket overload.
   */
  emitAutoModeEvent(eventType: string, data: Record<string, unknown>): void {
    // Rate-limit progress events per feature
    if (eventType === 'auto_mode_progress') {
      const featureId = (data.featureId as string) || '';
      const now = Date.now();
      const lastTime = this.lastProgressEventTime.get(featureId) ?? 0;

      if (now - lastTime < this.progressIntervalMs) {
        return; // Drop — too soon since the last progress event for this feature
      }

      this.lastProgressEventTime.set(featureId, now);
    }

    // Emit on the shared bus using the auto-mode:event envelope
    this.events.emit('auto-mode:event', {
      type: eventType,
      ...data,
    });

    // Also emit the direct event type so subscribers (e.g. lead-engineer rules)
    // can listen on e.g. 'auto-mode:stopped' instead of filtering 'auto-mode:event'.
    // Normalize: auto_mode_stopped → auto-mode:stopped, auto_mode_idle → auto-mode:idle
    if (eventType.startsWith('auto_mode_')) {
      const directType =
        `auto-mode:${eventType.slice('auto_mode_'.length).replace(/_/g, '-')}` as EventType;
      this.events.emit(directType, data);
    }
  }
}
