/**
 * Event Router Service
 *
 * Unified entry point for all external signals. Wraps SignalIntakeService
 * classification with delivery tracking for observability. Each inbound signal
 * receives a unique deliveryId, emits lifecycle events, and is recorded for
 * later query via the Delivery API.
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SignalIntakeService } from './signal-intake-service.js';

const logger = createLogger('EventRouter');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DeliveryStatus = 'received' | 'completed' | 'failed';

export interface RouteResult {
  deliveryId: string;
  classification: {
    category: 'ops' | 'gtm';
    intent: string;
  };
  routedTo: string;
  featureId?: string;
}

export interface DeliveryRecord {
  deliveryId: string;
  source: string;
  eventType: string;
  status: DeliveryStatus;
  classification?: {
    category: 'ops' | 'gtm';
    intent: string;
  };
  routedTo?: string;
  featureId?: string;
  error?: string;
  durationMs?: number;
  createdAt: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of delivery records kept in memory */
const MAX_DELIVERY_RECORDS = 500;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class EventRouterService {
  private deliveries: DeliveryRecord[] = [];

  constructor(
    private signalIntakeService: SignalIntakeService,
    private events: EventEmitter
  ) {
    logger.info('EventRouterService initialized');
  }

  /**
   * Classify and route an external signal through the intake pipeline.
   *
   * Generates a delivery ID, emits tracking events, delegates to
   * SignalIntakeService for classification, and records the outcome.
   */
  async classifyAndRoute(signal: {
    source: string;
    eventType: string;
    payload: Record<string, unknown>;
    deduplicationKey?: string;
  }): Promise<RouteResult> {
    const deliveryId = uuidv4();
    const startTime = Date.now();
    const now = new Date().toISOString();

    // Record the delivery as received
    const record: DeliveryRecord = {
      deliveryId,
      source: signal.source,
      eventType: signal.eventType,
      status: 'received',
      createdAt: now,
    };
    this.pushDelivery(record);

    this.events.emit('webhook:delivery:received', {
      deliveryId,
      source: signal.source,
      eventType: signal.eventType,
      timestamp: now,
    });

    try {
      // Build a signal payload compatible with SignalIntakeService's public API.
      // The content field carries the stringified payload for classification.
      const content =
        typeof signal.payload['content'] === 'string'
          ? (signal.payload['content'] as string)
          : JSON.stringify(signal.payload);

      // Use the public classifySignalIntent for intent classification.
      // classifySignal (ops/gtm) is private on SignalIntakeService, so we derive
      // category from the source heuristic used by SignalIntakeService.
      const intentSignal = {
        source: signal.source,
        content,
        author: {
          id: (signal.payload['authorId'] as string) ?? 'external',
          name: (signal.payload['authorName'] as string) ?? 'External Signal',
        },
        channelContext: (signal.payload['channelContext'] as Record<string, unknown>) ?? {},
        timestamp: now,
      };

      const intent = this.signalIntakeService.classifySignalIntent(intentSignal);
      const category = this.deriveCategory(signal.source, intentSignal.channelContext);

      // Determine where to route based on intent and category
      const routedTo = this.resolveRoutingTarget(category, intent);

      // Submit the signal through the standard intake pipeline so all
      // downstream handlers (PM pipeline, GTM, HITL) execute normally.
      this.signalIntakeService.submitSignal({
        source: signal.source,
        content,
        projectPath: signal.payload['projectPath'] as string | undefined,
      });

      // Wait a tick to let the async intake pipeline process
      // before capturing the result for the delivery record.
      const durationMs = Date.now() - startTime;

      const result: RouteResult = {
        deliveryId,
        classification: { category, intent },
        routedTo,
        featureId: undefined, // Feature ID is created asynchronously by the intake pipeline
      };

      // Update the delivery record
      record.status = 'completed';
      record.classification = result.classification;
      record.routedTo = result.routedTo;
      record.featureId = result.featureId;
      record.durationMs = durationMs;
      record.completedAt = new Date().toISOString();

      this.events.emit('webhook:delivery:completed', {
        deliveryId,
        source: signal.source,
        eventType: signal.eventType,
        routedTo: result.routedTo,
        featureId: result.featureId,
        durationMs,
        timestamp: record.completedAt,
      });

      logger.info(
        `Delivery ${deliveryId}: ${signal.source}/${signal.eventType} -> ${routedTo} (${durationMs}ms)`
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      record.status = 'failed';
      record.error = errorMessage;
      record.durationMs = durationMs;
      record.completedAt = new Date().toISOString();

      this.events.emit('webhook:delivery:failed', {
        deliveryId,
        source: signal.source,
        eventType: signal.eventType,
        error: errorMessage,
        durationMs,
        timestamp: record.completedAt,
      });

      logger.error(`Delivery ${deliveryId} failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Return all delivery records, newest first.
   */
  getDeliveries(filters?: {
    limit?: number;
    source?: string;
    status?: DeliveryStatus;
  }): DeliveryRecord[] {
    let records = [...this.deliveries].reverse();

    if (filters?.source) {
      records = records.filter((r) => r.source === filters.source);
    }
    if (filters?.status) {
      records = records.filter((r) => r.status === filters.status);
    }
    if (filters?.limit && filters.limit > 0) {
      records = records.slice(0, filters.limit);
    }

    return records;
  }

  /**
   * Return a single delivery record by ID, or null if not found.
   */
  getDelivery(deliveryId: string): DeliveryRecord | null {
    return this.deliveries.find((d) => d.deliveryId === deliveryId) ?? null;
  }

  /**
   * Re-run a failed delivery by its ID.
   * Returns the new RouteResult on success, or throws if the original delivery is not found.
   */
  async retryDelivery(deliveryId: string): Promise<RouteResult> {
    const original = this.getDelivery(deliveryId);
    if (!original) {
      throw new Error(`Delivery ${deliveryId} not found`);
    }
    if (original.status !== 'failed') {
      throw new Error(
        `Delivery ${deliveryId} is not in failed state (current: ${original.status})`
      );
    }

    logger.info(`Retrying failed delivery ${deliveryId} (source: ${original.source})`);

    return this.classifyAndRoute({
      source: original.source,
      eventType: original.eventType,
      payload: {},
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Derive ops/gtm category from source string and channel context.
   *
   * This mirrors the heuristic in SignalIntakeService.classifySignal() without
   * accessing that private method. The canonical classification still happens
   * inside the intake pipeline -- this is for the RouteResult metadata only.
   */
  private deriveCategory(source: string, channelContext: Record<string, unknown>): 'ops' | 'gtm' {
    if (source === 'github') return 'ops';
    if (source === 'mcp:create_feature') return 'ops';
    if (source === 'mcp:process_idea') return 'ops';
    if (source === 'ui:content') return 'gtm';

    if (source === 'discord') {
      const channelName = ((channelContext['channelName'] as string) ?? '').toLowerCase();
      const gtmChannels = ['marketing', 'social', 'content', 'gtm', 'campaign'];
      if (gtmChannels.some((ch) => channelName.includes(ch))) return 'gtm';
    }

    return 'ops';
  }

  /**
   * Map a classification to its routing target label.
   */
  private resolveRoutingTarget(category: 'ops' | 'gtm', intent: string): string {
    if (intent === 'interrupt') return 'hitl-form';
    if (intent === 'conversational') return 'dismissed';
    if (category === 'gtm') return 'gtm-agent';
    return 'pm-pipeline';
  }

  /**
   * Push a delivery record into the ring buffer, evicting the oldest when full.
   */
  private pushDelivery(record: DeliveryRecord): void {
    this.deliveries.push(record);
    if (this.deliveries.length > MAX_DELIVERY_RECORDS) {
      this.deliveries.shift();
    }
  }
}
