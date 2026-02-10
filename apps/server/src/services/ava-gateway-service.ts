/**
 * Ava Gateway Service - Core coordination service for AI operations
 *
 * The AvaGateway serves as the central coordination point for AI-driven
 * operations, managing lifecycle, event flow, and orchestration across
 * multiple autonomous agents and services.
 */

import { createLogger, classifyError } from '@automaker/utils';
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
    if (!this.config.enabled) {
      logger.info('Gateway disabled; not starting');
      return;
    }

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
      logger.error('Failed to start AvaGateway service:', classifyError(error));

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
      logger.error('Failed to stop AvaGateway service:', classifyError(error));

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
    return {
      ...this.config,
      coordinationRules: structuredClone(this.config.coordinationRules),
    };
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

    // Initialize integration points
    await this.initializeAutoModeCoordination();
    await this.initializeAuthorityIntegration();
    await this.initializeCrossProjectManagement();

    logger.debug('Gateway components initialized');
  }

  /**
   * Cleanup gateway components
   */
  private async cleanup(): Promise<void> {
    logger.debug('Cleaning up gateway components...');

    // Cleanup integration points
    await this.cleanupAutoModeCoordination();
    await this.cleanupAuthorityIntegration();
    await this.cleanupCrossProjectManagement();

    logger.debug('Gateway components cleaned up');
  }

  /**
   * Initialize auto-mode coordination
   * TODO: Add coordination with AutoModeService for concurrent agent management
   */
  private async initializeAutoModeCoordination(): Promise<void> {
    logger.debug('Auto-mode coordination stub (not yet implemented)');
  }

  /**
   * Initialize authority service integration
   * TODO: Add integration with Authority agents (PM, ProjM, EM, Status)
   */
  private async initializeAuthorityIntegration(): Promise<void> {
    logger.debug('Authority integration stub (not yet implemented)');
  }

  /**
   * Initialize cross-project operation management
   * TODO: Add cross-project monitoring and coordination
   */
  private async initializeCrossProjectManagement(): Promise<void> {
    logger.debug('Cross-project management stub (not yet implemented)');
  }

  /**
   * Cleanup auto-mode coordination
   * TODO: Release auto-mode coordination resources
   */
  private async cleanupAutoModeCoordination(): Promise<void> {
    logger.debug('Auto-mode coordination cleanup stub (not yet implemented)');
  }

  /**
   * Cleanup authority service integration
   * TODO: Release authority service resources
   */
  private async cleanupAuthorityIntegration(): Promise<void> {
    logger.debug('Authority integration cleanup stub (not yet implemented)');
  }

  /**
   * Cleanup cross-project operation management
   * TODO: Release cross-project management resources
   */
  private async cleanupCrossProjectManagement(): Promise<void> {
    logger.debug('Cross-project management cleanup stub (not yet implemented)');
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
 * @param events - Event emitter (required on first call, optional for updates)
 * @param config - Configuration options (optional, can update existing instance)
 * @returns Singleton instance
 */
export function getAvaGatewayService(
  events?: EventEmitter,
  config?: AvaGatewayConfig
): AvaGatewayService {
  if (!avaGatewayServiceInstance) {
    avaGatewayServiceInstance = new AvaGatewayService(events, config);
  } else {
    // Allow updating events/config on existing instance
    if (events) {
      avaGatewayServiceInstance.setEventEmitter(events);
    }
    if (config) {
      avaGatewayServiceInstance.updateConfig(config);
    }
  }
  return avaGatewayServiceInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export async function resetAvaGatewayService(): Promise<void> {
  if (avaGatewayServiceInstance) {
    // Stop if running
    if (avaGatewayServiceInstance.isRunning()) {
      await avaGatewayServiceInstance.stop();
    }
    avaGatewayServiceInstance = null;
  }
}
