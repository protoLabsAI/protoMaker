/**
 * Ava Gateway Service - Polls briefing API and routes events by severity
 *
 * Monitors project events by polling /api/briefing/digest every 10 minutes.
 * Routes events based on severity:
 * - critical → immediate alert
 * - high → work queue
 * - medium/low → log only
 *
 * Updates briefing cursor after processing to track progress.
 */

import type { EventEmitter } from '../lib/events.js';
import type { EventHistoryService } from './event-history-service.js';
import type { BriefingCursorService } from './briefing-cursor-service.js';
import type { StoredEvent } from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('AvaGatewayService');

/**
 * Briefing digest response structure
 */
interface BriefingDigest {
  success: boolean;
  signals: {
    critical: StoredEvent[];
    high: StoredEvent[];
    medium: StoredEvent[];
    low: StoredEvent[];
  };
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  since: string;
  hasMore: boolean;
  projectPath: string;
}

/**
 * Configuration for Ava Gateway polling
 */
export interface AvaGatewayConfig {
  projectPath: string;
  pollInterval?: number; // milliseconds, default 10 minutes
  enabled?: boolean; // default true
}

/**
 * AvaGatewayService - Autonomous briefing monitor for Ava
 *
 * Polls briefing API at regular intervals and routes events based on severity.
 * Acts as the "core gateway" for Ava to stay informed about project events.
 */
export class AvaGatewayService {
  /** Polling interval timer */
  private pollTimer: NodeJS.Timeout | null = null;

  /** Service enabled state */
  private enabled = false;

  /** Configuration */
  private config: Required<AvaGatewayConfig>;

  constructor(
    private events: EventEmitter,
    private eventHistoryService: EventHistoryService,
    private briefingCursorService: BriefingCursorService,
    config: AvaGatewayConfig
  ) {
    // Default to 10 minutes (600000ms)
    this.config = {
      projectPath: config.projectPath,
      pollInterval: config.pollInterval ?? 600000,
      enabled: config.enabled ?? true,
    };
  }

  /**
   * Start polling for briefing updates
   */
  start(): void {
    if (this.pollTimer) {
      logger.warn('Ava Gateway already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Ava Gateway disabled via config');
      return;
    }

    this.enabled = true;

    // Start polling loop
    this.pollTimer = setInterval(() => {
      this.pollBriefing().catch((error) => {
        logger.error('Error during briefing poll:', error);
      });
    }, this.config.pollInterval);

    // Do initial poll immediately
    this.pollBriefing().catch((error) => {
      logger.error('Error during initial briefing poll:', error);
    });

    logger.info(
      `Ava Gateway started for project ${this.config.projectPath} (polling every ${this.config.pollInterval / 1000}s)`
    );
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.enabled = false;
      logger.info('Ava Gateway stopped');
    }
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.enabled && this.pollTimer !== null;
  }

  /**
   * Poll briefing digest and route events
   */
  private async pollBriefing(): Promise<void> {
    try {
      // Fetch briefing digest from event history
      // Note: We simulate the HTTP API call by directly calling the event history service
      const digest = await this.fetchBriefingDigest();

      if (!digest.success) {
        logger.error('Briefing digest fetch failed');
        return;
      }

      // Log summary
      logger.info(
        `Briefing summary: ${digest.summary.critical} critical, ${digest.summary.high} high, ${digest.summary.medium} medium, ${digest.summary.low} low (total: ${digest.summary.total})`
      );

      // Route events by severity
      await this.routeBySeverity(digest);

      // Update cursor to mark these events as processed
      const now = new Date().toISOString();
      await this.briefingCursorService.setCursor(this.config.projectPath, now);

      logger.debug(`Updated briefing cursor to ${now}`);
    } catch (error) {
      logger.error('Failed to poll briefing:', error);
      throw error;
    }
  }

  /**
   * Fetch briefing digest from event history service
   *
   * Simulates the HTTP API call to /api/briefing/digest
   */
  private async fetchBriefingDigest(): Promise<BriefingDigest> {
    // Get cursor to determine "since" timestamp
    const cursor = await this.briefingCursorService.getCursor(this.config.projectPath);

    // Calculate since timestamp (use cursor or default to 24h)
    const since =
      cursor ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get events from event history
    const eventSummaries = await this.eventHistoryService.getEvents(this.config.projectPath, {
      since,
    });

    // Load full event details
    const fullEvents = await Promise.all(
      eventSummaries.map((summary) =>
        this.eventHistoryService.getEvent(this.config.projectPath, summary.id)
      )
    );

    // Filter out nulls
    const validEvents = fullEvents.filter((e): e is StoredEvent => e !== null);

    // Group by severity
    const signals = this.groupEventsBySeverity(validEvents);

    // Calculate summary
    const summary = {
      critical: signals.critical.length,
      high: signals.high.length,
      medium: signals.medium.length,
      low: signals.low.length,
      total: validEvents.length,
    };

    return {
      success: true,
      signals,
      summary,
      since,
      hasMore: false,
      projectPath: this.config.projectPath,
    };
  }

  /**
   * Group events by severity based on trigger type
   */
  private groupEventsBySeverity(events: StoredEvent[]): {
    critical: StoredEvent[];
    high: StoredEvent[];
    medium: StoredEvent[];
    low: StoredEvent[];
  } {
    const grouped = {
      critical: [] as StoredEvent[],
      high: [] as StoredEvent[],
      medium: [] as StoredEvent[],
      low: [] as StoredEvent[],
    };

    for (const event of events) {
      // Group based on the event's severity property
      // which is already set by the event history service
      const severity = event.severity || 'low';
      grouped[severity].push(event);
    }

    return grouped;
  }

  /**
   * Route events based on severity level
   */
  private async routeBySeverity(digest: BriefingDigest): Promise<void> {
    // Critical events → immediate alert
    if (digest.signals.critical.length > 0) {
      logger.error(
        `⚠️ CRITICAL ALERT: ${digest.signals.critical.length} critical events detected`
      );
      for (const event of digest.signals.critical) {
        const message =
          event.error || event.featureName || (event.metadata?.description as string) || 'No details';
        logger.error(`  - ${event.trigger}: ${message}`);

        // Emit alert event for other systems to consume
        this.events.emit('ava:gateway:critical-event', {
          event,
          projectPath: this.config.projectPath,
        });
      }
    }

    // High priority events → work queue
    if (digest.signals.high.length > 0) {
      logger.warn(`🔔 High priority: ${digest.signals.high.length} events require attention`);
      for (const event of digest.signals.high) {
        const message =
          event.error || event.featureName || (event.metadata?.description as string) || 'No details';
        logger.warn(`  - ${event.trigger}: ${message}`);

        // Emit work queue event
        this.events.emit('ava:gateway:high-event', {
          event,
          projectPath: this.config.projectPath,
        });
      }
    }

    // Medium priority events → log
    if (digest.signals.medium.length > 0) {
      logger.info(`📋 Medium priority: ${digest.signals.medium.length} events logged`);
      for (const event of digest.signals.medium) {
        const message =
          event.error || event.featureName || (event.metadata?.description as string) || 'No details';
        logger.debug(`  - ${event.trigger}: ${message}`);
      }
    }

    // Low priority events → log at debug level
    if (digest.signals.low.length > 0) {
      logger.debug(`📝 Low priority: ${digest.signals.low.length} events logged`);
      for (const event of digest.signals.low) {
        const message =
          event.error || event.featureName || (event.metadata?.description as string) || 'No details';
        logger.debug(`  - ${event.trigger}: ${message}`);
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<AvaGatewayConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart to take effect)
   */
  updateConfig(config: Partial<AvaGatewayConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
}

/**
 * Singleton instance
 */
let avaGatewayServiceInstance: AvaGatewayService | null = null;

/**
 * Get the singleton Ava Gateway service instance
 *
 * @param events - Event emitter (required on first call)
 * @param eventHistoryService - Event history service (required on first call)
 * @param briefingCursorService - Briefing cursor service (required on first call)
 * @param config - Gateway configuration (required on first call)
 * @returns Singleton instance
 */
export function getAvaGatewayService(
  events?: EventEmitter,
  eventHistoryService?: EventHistoryService,
  briefingCursorService?: BriefingCursorService,
  config?: AvaGatewayConfig
): AvaGatewayService {
  if (!avaGatewayServiceInstance) {
    if (!events || !eventHistoryService || !briefingCursorService || !config) {
      throw new Error(
        'events, eventHistoryService, briefingCursorService, and config are required on first call to getAvaGatewayService'
      );
    }
    avaGatewayServiceInstance = new AvaGatewayService(
      events,
      eventHistoryService,
      briefingCursorService,
      config
    );
  }
  return avaGatewayServiceInstance;
}
