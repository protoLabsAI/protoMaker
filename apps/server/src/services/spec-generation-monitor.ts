/**
 * Spec Generation Monitor
 *
 * Monitors spec regeneration events and detects stalls.
 * Uses heartbeat pattern: events update lastEventAt timestamp,
 * periodic tick checks for staleness.
 *
 * Pattern inspired by BullMQ job monitoring.
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('SpecGenerationMonitor');

interface SpecGenerationMonitorConfig {
  tickIntervalMs: number;
  stallTimeoutMs: number;
}

interface ProjectState {
  projectPath: string;
  lastEventAt: number;
}

export class SpecGenerationMonitor {
  private tickInterval: NodeJS.Timeout | null = null;
  private currentTick: Promise<void> | null = null;
  private config: SpecGenerationMonitorConfig;
  private isRunning = false;
  private aborted = false;
  private projectStates = new Map<string, ProjectState>();
  private eventUnsubscribe: (() => void) | null = null;

  constructor(
    private events: EventEmitter,
    config: SpecGenerationMonitorConfig
  ) {
    this.config = {
      tickIntervalMs: config.tickIntervalMs,
      stallTimeoutMs: config.stallTimeoutMs,
    };
  }

  /**
   * Start the spec generation monitor tick loop
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('SpecGenerationMonitor already running');
      return;
    }

    this.isRunning = true;
    this.aborted = false;
    logger.info(
      `Starting SpecGenerationMonitor with ${this.config.tickIntervalMs}ms interval, ${this.config.stallTimeoutMs}ms stall timeout`
    );

    // Subscribe to spec regeneration events
    this.eventUnsubscribe = this.events.on('spec-regeneration:event', (payload: any) => {
      if (payload.projectPath) {
        this.updateLastEventAt(payload.projectPath);
      }
    });

    // Start tick interval
    this.tickInterval = setInterval(() => {
      this.currentTick = this.tick();
    }, this.config.tickIntervalMs);

    // Run first tick immediately
    this.currentTick = this.tick();
  }

  /**
   * Stop the spec generation monitor
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.aborted = true;

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = null;
    }

    logger.info('SpecGenerationMonitor stopped');
  }

  /**
   * Get current in-flight tick promise for graceful shutdown
   */
  getCurrentTick(): Promise<void> | null {
    return this.currentTick;
  }

  /**
   * Update last event timestamp for a project
   */
  private updateLastEventAt(projectPath: string): void {
    const existing = this.projectStates.get(projectPath);
    if (existing) {
      existing.lastEventAt = Date.now();
    } else {
      this.projectStates.set(projectPath, {
        projectPath,
        lastEventAt: Date.now(),
      });
    }
    logger.debug(`Updated lastEventAt for ${projectPath}`);
  }

  /**
   * Main tick function - runs periodically to check for stalls
   */
  private async tick(): Promise<void> {
    if (this.aborted) {
      logger.debug('SpecGenerationMonitor tick aborted');
      return;
    }

    try {
      logger.debug('SpecGenerationMonitor tick starting...');

      // Check abort before heavy operations
      if (this.aborted) {
        return;
      }

      // TODO: Add cleanup logic in next phase
      // For now, just log
      logger.debug('Tick complete (no cleanup logic yet)');
    } catch (error) {
      logger.error('SpecGenerationMonitor tick failed:', error);
    }
  }
}
