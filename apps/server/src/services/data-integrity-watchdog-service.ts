/**
 * Data Integrity Watchdog Service - Monitors feature directory count
 *
 * Responsibilities:
 * - Track feature directory count over time
 * - Detect catastrophic drops (>50% reduction)
 * - Emit CRITICAL alerts when integrity is breached
 * - Block auto-mode startup when integrity check fails
 * - Persist state in DATA_DIR/integrity-state.json
 *
 * Scheduled via maintenance-tasks.ts every 5 minutes.
 */

import { createLogger } from '@automaker/utils';
import { getFeaturesDir, ensureAutomakerDir } from '@automaker/platform';
import * as secureFs from '../lib/secure-fs.js';
import path from 'path';
import type { EventEmitter } from '../lib/events.js';
import type { DiscordService } from './discord-service.js';

const logger = createLogger('DataIntegrityWatchdog');

/**
 * Integrity state stored in DATA_DIR/integrity-state.json
 */
export interface IntegrityState {
  /** Version for future migrations */
  version: number;
  /** Per-project feature counts */
  projects: Record<
    string,
    {
      /** Last known feature count */
      lastKnownCount: number;
      /** Timestamp of last check */
      lastCheckedAt: string;
      /** Whether integrity is currently breached */
      breached: boolean;
    }
  >;
}

/**
 * Result of an integrity check
 */
export interface IntegrityCheckResult {
  /** Whether integrity is intact (no major data loss) */
  intact: boolean;
  /** Current feature count */
  currentCount: number;
  /** Last known feature count */
  lastKnownCount: number;
  /** Percentage drop (0-100) */
  dropPercentage: number;
  /** Error message if integrity breached */
  errorMessage?: string;
}

/** Current version of integrity state schema */
const INTEGRITY_STATE_VERSION = 1;

/** Default integrity state */
const DEFAULT_INTEGRITY_STATE: IntegrityState = {
  version: INTEGRITY_STATE_VERSION,
  projects: {},
};

/** Threshold for critical alert (50% drop) */
const CRITICAL_DROP_THRESHOLD = 0.5;

/**
 * Data Integrity Watchdog Service
 *
 * Monitors feature directory counts and alerts on catastrophic drops.
 * Integrates with auto-mode to prevent starting when data integrity is compromised.
 *
 * Note: Export both the class and singleton for different use cases:
 * - Use singleton (getDataIntegrityWatchdogService) in production
 * - Use class constructor directly in tests for isolation
 */
export class DataIntegrityWatchdogService {
  private stateFilePath: string;
  private events: EventEmitter | null = null;
  private discordService: DiscordService | null = null;
  private infraChannelId: string | null = null;

  constructor(dataDir: string) {
    this.stateFilePath = path.join(dataDir, 'integrity-state.json');
  }

  /**
   * Set the event emitter for broadcasting alerts
   */
  setEventEmitter(events: EventEmitter): void {
    this.events = events;
  }

  /**
   * Set Discord service and infra channel ID for critical alerts
   */
  setDiscordService(discordService: DiscordService, infraChannelId: string): void {
    this.discordService = discordService;
    this.infraChannelId = infraChannelId;
  }

  /**
   * Read integrity state from disk
   */
  private async readState(): Promise<IntegrityState> {
    try {
      const content = (await secureFs.readFile(this.stateFilePath, 'utf-8')) as string;
      return JSON.parse(content) as IntegrityState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return DEFAULT_INTEGRITY_STATE;
      }
      logger.error('Error reading integrity state:', error);
      return DEFAULT_INTEGRITY_STATE;
    }
  }

  /**
   * Write integrity state to disk atomically
   */
  private async writeState(state: IntegrityState): Promise<void> {
    const tempPath = `${this.stateFilePath}.tmp.${Date.now()}`;
    const content = JSON.stringify(state, null, 2);

    try {
      await secureFs.writeFile(tempPath, content, 'utf-8');
      await secureFs.rename(tempPath, this.stateFilePath);
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await secureFs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Count feature directories in a project
   */
  private async countFeatures(projectPath: string): Promise<number> {
    try {
      const featuresDir = getFeaturesDir(projectPath);
      const entries = await secureFs.readdir(featuresDir);

      // Count directories (each feature has its own directory)
      let count = 0;
      for (const entry of entries) {
        const entryPath = path.join(featuresDir, entry);
        const stats = await secureFs.stat(entryPath);
        if (stats.isDirectory()) {
          count++;
        }
      }

      return count;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Features directory doesn't exist yet - this is a new project
        return 0;
      }
      logger.error(`Error counting features for ${projectPath}:`, error);
      throw error;
    }
  }

  /**
   * Check integrity for a single project
   *
   * @param projectPath - Absolute path to project directory
   * @returns Integrity check result
   */
  async checkIntegrity(projectPath: string): Promise<IntegrityCheckResult> {
    logger.debug(`Checking integrity for ${projectPath}`);

    const state = await this.readState();
    const currentCount = await this.countFeatures(projectPath);

    // Initialize project state if first check
    if (!state.projects[projectPath]) {
      state.projects[projectPath] = {
        lastKnownCount: currentCount,
        lastCheckedAt: new Date().toISOString(),
        breached: false,
      };
      await this.writeState(state);

      logger.info(`Initialized integrity monitoring for ${projectPath}: ${currentCount} features`);

      return {
        intact: true,
        currentCount,
        lastKnownCount: currentCount,
        dropPercentage: 0,
      };
    }

    const projectState = state.projects[projectPath];
    const lastKnownCount = projectState.lastKnownCount;

    // Calculate drop percentage
    let dropPercentage = 0;
    if (lastKnownCount > 0) {
      dropPercentage = (lastKnownCount - currentCount) / lastKnownCount;
    }

    // Check if integrity is breached (>50% drop)
    const breached = dropPercentage > CRITICAL_DROP_THRESHOLD;

    // Update state
    const wasBreached = projectState.breached;
    projectState.lastCheckedAt = new Date().toISOString();

    if (breached && !wasBreached) {
      // New breach detected
      projectState.breached = true;
      await this.writeState(state);

      const errorMessage = `CRITICAL: Feature count dropped ${Math.round(dropPercentage * 100)}% (${lastKnownCount} → ${currentCount})`;
      logger.error(errorMessage);

      // Emit critical alert
      await this.emitCriticalAlert(projectPath, {
        currentCount,
        lastKnownCount,
        dropPercentage,
        errorMessage,
      });

      return {
        intact: false,
        currentCount,
        lastKnownCount,
        dropPercentage: dropPercentage * 100,
        errorMessage,
      };
    } else if (!breached && wasBreached) {
      // Integrity restored
      projectState.breached = false;
      projectState.lastKnownCount = currentCount;
      await this.writeState(state);

      logger.info(`Integrity restored for ${projectPath}: ${currentCount} features`);

      return {
        intact: true,
        currentCount,
        lastKnownCount,
        dropPercentage: dropPercentage * 100,
      };
    } else if (!breached) {
      // Normal case: update last known count if it increased
      if (currentCount > lastKnownCount) {
        projectState.lastKnownCount = currentCount;
        await this.writeState(state);
        logger.debug(`Updated last known count for ${projectPath}: ${currentCount}`);
      }

      return {
        intact: true,
        currentCount,
        lastKnownCount: projectState.lastKnownCount,
        dropPercentage: dropPercentage * 100,
      };
    } else {
      // Still breached
      return {
        intact: false,
        currentCount,
        lastKnownCount,
        dropPercentage: dropPercentage * 100,
        errorMessage: `Data integrity still breached (${lastKnownCount} → ${currentCount})`,
      };
    }
  }

  /**
   * Emit critical alert via events and Discord
   */
  private async emitCriticalAlert(
    projectPath: string,
    details: {
      currentCount: number;
      lastKnownCount: number;
      dropPercentage: number;
      errorMessage?: string;
    }
  ): Promise<void> {
    const { currentCount, lastKnownCount, dropPercentage, errorMessage } = details;

    // Emit event
    if (this.events) {
      this.events.emit('integrity:breach' as Parameters<typeof this.events.emit>[0], {
        projectPath,
        currentCount,
        lastKnownCount,
        dropPercentage: Math.round(dropPercentage * 100),
        message: errorMessage,
      });
    }

    // Post to Discord #infra
    if (this.discordService && this.infraChannelId) {
      const message = `🔴 **DATA INTEGRITY BREACH**

**Project:** ${projectPath}
**Feature Count Drop:** ${lastKnownCount} → ${currentCount} (${Math.round(dropPercentage * 100)}% reduction)

**Auto-mode has been blocked until integrity is restored.**

**Possible Causes:**
- Accidental deletion of .automaker/features/ directory
- File system corruption
- Manual cleanup gone wrong

**Required Action:**
1. Investigate the cause of the feature loss
2. Restore from backup if available
3. Manually clear the integrity breach flag if intentional
`;

      try {
        const result = await this.discordService.sendMessage({
          channelId: this.infraChannelId,
          message,
        });

        if (result.success) {
          logger.info('Posted integrity breach alert to Discord #infra');
        } else {
          logger.error('Failed to post integrity breach alert to Discord', result.error);
        }
      } catch (error) {
        logger.error('Error posting integrity breach to Discord', error);
      }
    }
  }

  /**
   * Check if auto-mode is allowed to start for a project
   *
   * @param projectPath - Absolute path to project directory
   * @returns true if auto-mode can start, false if blocked by integrity breach
   */
  async canStartAutoMode(projectPath: string, forceStart: boolean = false): Promise<boolean> {
    if (forceStart) {
      logger.warn(`Auto-mode force-start enabled for ${projectPath}, bypassing integrity check`);
      return true;
    }

    const result = await this.checkIntegrity(projectPath);

    if (!result.intact) {
      logger.error(
        `Auto-mode blocked for ${projectPath} due to integrity breach: ${result.errorMessage}`
      );
      return false;
    }

    return true;
  }

  /**
   * Manually clear integrity breach for a project
   * (for use when data loss is intentional, e.g., project reset)
   *
   * @param projectPath - Absolute path to project directory
   */
  async clearBreach(projectPath: string): Promise<void> {
    const state = await this.readState();

    if (!state.projects[projectPath]) {
      logger.warn(`No integrity state found for ${projectPath}`);
      return;
    }

    const currentCount = await this.countFeatures(projectPath);

    state.projects[projectPath] = {
      lastKnownCount: currentCount,
      lastCheckedAt: new Date().toISOString(),
      breached: false,
    };

    await this.writeState(state);
    logger.info(`Cleared integrity breach for ${projectPath}, reset to ${currentCount} features`);
  }

  /**
   * Get current integrity status for a project
   */
  async getStatus(projectPath: string): Promise<{
    breached: boolean;
    currentCount: number;
    lastKnownCount: number;
    lastCheckedAt: string | null;
  }> {
    const state = await this.readState();
    const projectState = state.projects[projectPath];

    if (!projectState) {
      const currentCount = await this.countFeatures(projectPath);
      return {
        breached: false,
        currentCount,
        lastKnownCount: currentCount,
        lastCheckedAt: null,
      };
    }

    const currentCount = await this.countFeatures(projectPath);

    return {
      breached: projectState.breached,
      currentCount,
      lastKnownCount: projectState.lastKnownCount,
      lastCheckedAt: projectState.lastCheckedAt,
    };
  }
}

// Singleton instance
let watchdogServiceInstance: DataIntegrityWatchdogService | null = null;

/**
 * Get the singleton data integrity watchdog service instance
 */
export function getDataIntegrityWatchdogService(dataDir: string): DataIntegrityWatchdogService {
  if (!watchdogServiceInstance) {
    watchdogServiceInstance = new DataIntegrityWatchdogService(dataDir);
  }
  return watchdogServiceInstance;
}
