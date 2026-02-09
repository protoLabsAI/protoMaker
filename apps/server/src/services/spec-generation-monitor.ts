/**
 * Spec Generation Monitor
 *
 * Periodically checks running spec/feature generations for stalls
 * and triggers cleanup actions when stalls are detected.
 */

import { createLogger } from '@automaker/utils';
import { getAllRunningGenerations, getSpecRegenerationStatus } from '../routes/app-spec/common.js';

const logger = createLogger('SpecGenerationMonitor');

interface SpecGenerationMonitorConfig {
  enabled: boolean;
  tickIntervalMs: number;
  stallTimeoutMs: number;
}

interface StallInfo {
  projectPath: string;
  type: string;
  startedAt: string;
  lastEventAt: string;
  timeSinceLastEvent: number;
}

export class SpecGenerationMonitor {
  private tickInterval: NodeJS.Timeout | null = null;
  private currentTick: Promise<void> | null = null;
  private config: SpecGenerationMonitorConfig;
  private isRunning = false;
  private aborted = false;

  constructor(config?: Partial<SpecGenerationMonitorConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      tickIntervalMs: config?.tickIntervalMs ?? 30000, // 30s default
      stallTimeoutMs: config?.stallTimeoutMs ?? 300000, // 5 min default
    };
  }

  /**
   * Start the monitor tick loop
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('SpecGenerationMonitor is disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('SpecGenerationMonitor already running');
      return;
    }

    this.isRunning = true;
    this.aborted = false;
    logger.info('Starting SpecGenerationMonitor', {
      tickIntervalMs: this.config.tickIntervalMs,
      stallTimeoutMs: this.config.stallTimeoutMs,
    });

    this.tickInterval = setInterval(() => {
      if (!this.aborted) {
        this.tick();
      }
    }, this.config.tickIntervalMs);
  }

  /**
   * Stop the monitor
   */
  stop(): void {
    logger.info('Stopping SpecGenerationMonitor');
    this.aborted = true;
    this.isRunning = false;

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /**
   * Check for stalled generations
   */
  private async tick(): Promise<void> {
    // Check abort before starting
    if (this.aborted) {
      return;
    }

    try {
      const runningGenerations = getAllRunningGenerations();

      if (runningGenerations.length === 0) {
        return; // Nothing to check
      }

      const stalledJobs: StallInfo[] = [];
      const now = Date.now();

      // Check abort before iteration
      if (this.aborted) {
        return;
      }

      for (const generation of runningGenerations) {
        // Check abort during iteration
        if (this.aborted) {
          return;
        }

        try {
          const lastEventTime = new Date(generation.lastEventAt).getTime();

          // Skip invalid timestamps
          if (isNaN(lastEventTime)) {
            logger.warn(`Invalid lastEventAt timestamp for ${generation.projectPath}`, {
              lastEventAt: generation.lastEventAt,
            });
            continue;
          }

          const timeSinceLastEvent = now - lastEventTime;

          if (timeSinceLastEvent > this.config.stallTimeoutMs) {
            stalledJobs.push({
              projectPath: generation.projectPath,
              type: generation.type,
              startedAt: generation.startedAt,
              lastEventAt: generation.lastEventAt,
              timeSinceLastEvent,
            });
          }
        } catch (error) {
          // Gracefully handle errors for individual generations
          logger.warn(`Error processing generation for ${generation.projectPath}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Log warnings for stalled jobs
      if (stalledJobs.length > 0) {
        logger.warn(`Detected ${stalledJobs.length} stalled generation(s)`);
        for (const stall of stalledJobs) {
          logger.warn(`Stalled generation: ${stall.projectPath}`, {
            type: stall.type,
            startedAt: stall.startedAt,
            lastEventAt: stall.lastEventAt,
            timeSinceLastEventMs: stall.timeSinceLastEvent,
            stallTimeoutMs: this.config.stallTimeoutMs,
          });
        }
      }
    } catch (error) {
      logger.error('Error in SpecGenerationMonitor tick', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    config: SpecGenerationMonitorConfig;
  } {
    return {
      isRunning: this.isRunning,
      config: { ...this.config },
    };
  }
}
