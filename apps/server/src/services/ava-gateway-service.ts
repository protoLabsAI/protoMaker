/**
 * Ava Gateway Service - Core coordination service for AI operations
 *
 * The AvaGateway serves as the central coordination point for AI-driven
 * operations, managing lifecycle, event flow, and orchestration across
 * multiple autonomous agents and services.
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { EventType } from '@automaker/types';

const logger = createLogger('AvaGateway');

/**
 * Configuration options for the Ava Gateway
 */
export interface AvaGatewayConfig {
  /** Whether the gateway is enabled */
  enabled?: boolean;
  /** Custom coordination rules */
  coordinationRules?: Record<string, unknown>;
}

/**
 * Gateway status
 */
export type GatewayStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

/**
 * AvaGatewayService - Central coordination service for AI operations
 *
 * Provides lifecycle management (start/stop/restart), event emitter integration,
 * and basic coordination logic for autonomous agent operations.
 */
export class AvaGatewayService {
  private events: EventEmitter | null = null;
  private config: Required<AvaGatewayConfig>;
  private status: GatewayStatus = 'stopped';
  private startTime: Date | null = null;

  constructor(events?: EventEmitter, config?: AvaGatewayConfig) {
    this.config = {
      enabled: config?.enabled ?? true,
      coordinationRules: config?.coordinationRules ?? {},
    };

    if (events) {
      this.events = events;
    }

    logger.info('AvaGateway service instantiated');
  }

  /**
   * Set the event emitter for broadcasting gateway events
   */
  setEventEmitter(events: EventEmitter): void {
    this.events = events;
    logger.debug('Event emitter configured');
  }

  /**
   * Start the gateway service
   */
  async start(): Promise<void> {
    if (this.status === 'running') {
      logger.warn('Gateway is already running');
      return;
    }

    if (this.status === 'starting') {
      logger.warn('Gateway is already starting');
      return;
    }

    try {
      this.status = 'starting';
      logger.info('Starting AvaGateway service...');

      // Emit lifecycle event
      this.emitEvent('gateway:starting', {});

      // Initialize gateway components
      await this.initialize();

      this.status = 'running';
      this.startTime = new Date();

      logger.info('✓ AvaGateway service started successfully');

      // Emit lifecycle event
      this.emitEvent('gateway:started', {
        startTime: this.startTime.toISOString(),
      });
    } catch (error) {
      this.status = 'error';
      logger.error('Failed to start AvaGateway service:', error);

      // Emit error event
      this.emitEvent('gateway:error', {
        error: error instanceof Error ? error.message : String(error),
        phase: 'start',
      });

      throw error;
    }
  }

  /**
   * Stop the gateway service
   */
  async stop(): Promise<void> {
    if (this.status === 'stopped') {
      logger.warn('Gateway is already stopped');
      return;
    }

    if (this.status === 'stopping') {
      logger.warn('Gateway is already stopping');
      return;
    }

    try {
      this.status = 'stopping';
      logger.info('Stopping AvaGateway service...');

      // Emit lifecycle event
      this.emitEvent('gateway:stopping', {});

      // Cleanup gateway components
      await this.cleanup();

      this.status = 'stopped';
      this.startTime = null;

      logger.info('✓ AvaGateway service stopped successfully');

      // Emit lifecycle event
      this.emitEvent('gateway:stopped', {});
    } catch (error) {
      this.status = 'error';
      logger.error('Failed to stop AvaGateway service:', error);

      // Emit error event
      this.emitEvent('gateway:error', {
        error: error instanceof Error ? error.message : String(error),
        phase: 'stop',
      });

      throw error;
    }
  }

  /**
   * Restart the gateway service
   */
  async restart(): Promise<void> {
    logger.info('Restarting AvaGateway service...');

    // Emit lifecycle event
    this.emitEvent('gateway:restarting', {});

    await this.stop();
    await this.start();

    logger.info('✓ AvaGateway service restarted successfully');

    // Emit lifecycle event
    this.emitEvent('gateway:restarted', {});
  }

  /**
   * Get the current status of the gateway
   */
  getStatus(): GatewayStatus {
    return this.status;
  }

  /**
   * Get gateway uptime in seconds
   */
  getUptime(): number {
    if (!this.startTime || this.status !== 'running') {
      return 0;
    }
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  /**
   * Check if the gateway is running
   */
  isRunning(): boolean {
    return this.status === 'running';
  }

  /**
   * Get gateway configuration
   */
  getConfig(): Readonly<Required<AvaGatewayConfig>> {
    return { ...this.config };
  }

  /**
   * Update gateway configuration (requires restart to take effect)
   */
  updateConfig(config: Partial<AvaGatewayConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    logger.info('Gateway configuration updated (restart required to take effect)');

    // Emit config change event
    this.emitEvent('gateway:config-updated', {
      config: this.config,
    });
  }

  /**
   * Initialize gateway components
   */
  private async initialize(): Promise<void> {
    logger.debug('Initializing gateway components...');

    // TODO: Initialize coordination logic, agent registrations, etc.
    // This is where we'll add integration with:
    // - AutoModeService coordination
    // - GOAPLoopService orchestration
    // - Authority service integration
    // - Cross-project operation management

    logger.debug('Gateway components initialized');
  }

  /**
   * Cleanup gateway components
   */
  private async cleanup(): Promise<void> {
    logger.debug('Cleaning up gateway components...');

    // TODO: Cleanup active operations, release resources, etc.

    logger.debug('Gateway components cleaned up');
  }

  /**
   * Emit an event if event emitter is configured
   */
  private emitEvent(type: EventType, payload: Record<string, unknown>): void {
    if (this.events) {
      this.events.emit(type, payload);
      logger.debug(`Event emitted: ${type}`);
    }
  }
}

// Singleton instance
let avaGatewayServiceInstance: AvaGatewayService | null = null;

/**
 * Get the singleton AvaGateway service instance
 *
 * @param events - Event emitter (required on first call)
 * @param config - Configuration options
 * @returns Singleton instance
 */
export function getAvaGatewayService(
  events?: EventEmitter,
  config?: AvaGatewayConfig
): AvaGatewayService {
  if (!avaGatewayServiceInstance) {
    avaGatewayServiceInstance = new AvaGatewayService(events, config);
  }
  return avaGatewayServiceInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetAvaGatewayService(): void {
  if (avaGatewayServiceInstance) {
    // Stop if running
    if (avaGatewayServiceInstance.isRunning()) {
      void avaGatewayServiceInstance.stop();
    }
    avaGatewayServiceInstance = null;
  }
}
