/**
 * UI Notification Channel
 *
 * Routes escalation signals to the UI via WebSocket events for real-time dashboard updates.
 * Emits escalation events via the existing event system for real-time dashboard updates.
 *
 * Features:
 * - Emits escalation events for all severity levels
 * - Provides real-time updates to connected UI clients
 * - Lightweight implementation using existing event infrastructure
 */

import { createLogger } from '@automaker/utils';
import type { EscalationChannel, EscalationSignal } from '@automaker/types';
import type { EventEmitter } from '../../lib/events.js';

const logger = createLogger('UINotificationChannel');

/**
 * UI Notification Channel Implementation
 *
 * Routes escalation signals to UI clients via WebSocket events.
 * Handles all severity levels for comprehensive dashboard visibility.
 */
export class UINotificationChannel implements EscalationChannel {
  public readonly name = 'ui-notification';
  private events: EventEmitter;

  /**
   * Rate limit: max 100 notifications per 1 minute
   * More generous than other channels since UI updates are lightweight
   */
  public readonly rateLimit = {
    maxSignals: 100,
    windowMs: 60 * 1000,
  };

  constructor(events: EventEmitter) {
    this.events = events;
    logger.info('UINotificationChannel initialized');
  }

  /**
   * Determines if this channel can handle the signal
   * Handles all severity levels for comprehensive UI visibility
   */
  canHandle(_signal: EscalationSignal): boolean {
    // UI notifications handle all signals
    return true;
  }

  /**
   * Sends the escalation signal to UI clients via WebSocket
   */
  async send(signal: EscalationSignal): Promise<void> {
    logger.debug(`Emitting escalation to UI clients`, {
      type: signal.type,
      severity: signal.severity,
    });

    try {
      // Emit event that will be sent to WebSocket clients
      this.events.emit('escalation:ui-notification', {
        type: signal.type,
        severity: signal.severity,
        source: signal.source,
        context: signal.context,
        deduplicationKey: signal.deduplicationKey,
        timestamp: signal.timestamp || new Date().toISOString(),
      });

      logger.debug(`Successfully emitted escalation to UI clients`, {
        signalType: signal.type,
        severity: signal.severity,
      });
    } catch (error) {
      logger.error(`Failed to emit escalation to UI:`, error);
      throw error;
    }
  }
}
