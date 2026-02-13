/**
 * Linear Sync Service
 *
 * Foundation service for syncing features to Linear.
 * Provides guard mechanisms for loop prevention and debouncing.
 *
 * This service handles:
 * - Event subscriptions for feature lifecycle events
 * - Loop prevention using a Set to track features currently being synced
 * - Debouncing logic to prevent multiple syncs within a short time window
 * - Sync metadata storage for tracking sync state
 * - Helper methods for checking sync eligibility
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('LinearSyncService');

/**
 * Metadata stored for each synced feature
 */
export interface SyncMetadata {
  featureId: string;
  lastSyncTimestamp: number;
  lastSyncStatus: 'success' | 'error' | 'pending';
  linearIssueId?: string;
  errorMessage?: string;
  syncCount: number;
}

/**
 * Feature event payload structure
 */
interface FeatureEventPayload {
  featureId: string;
  featureName?: string;
  projectPath: string;
  status?: string;
  prUrl?: string;
  error?: string;
}

/**
 * Debounce time window in milliseconds (5 seconds)
 */
const DEBOUNCE_WINDOW_MS = 5000;

/**
 * LinearSyncService - Manages syncing features to Linear
 *
 * This service provides the foundational infrastructure for Linear sync:
 * - Guard mechanisms to prevent sync loops
 * - Debouncing to prevent duplicate syncs
 * - Metadata tracking for sync state
 * - Event subscriptions for feature lifecycle
 */
export class LinearSyncService {
  private emitter: EventEmitter | null = null;
  private settingsService: SettingsService | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * Set of feature IDs currently being synced (loop prevention)
   */
  private syncingFeatures: Set<string> = new Set();

  /**
   * Map of feature IDs to last sync timestamps (debouncing)
   */
  private lastSyncTimes: Map<string, number> = new Map();

  /**
   * Map of feature IDs to sync metadata (state tracking)
   */
  private syncState: Map<string, SyncMetadata> = new Map();

  /**
   * Flag to track if service is running
   */
  private isRunning = false;

  /**
   * Initialize the service with event emitter and settings service
   */
  initialize(emitter: EventEmitter, settingsService: SettingsService): void {
    this.emitter = emitter;
    this.settingsService = settingsService;

    // Subscribe to feature lifecycle events
    this.unsubscribe = emitter.subscribe((type, payload) => {
      if (type === 'feature:created') {
        this.handleFeatureCreated(payload as FeatureEventPayload);
      } else if (type === 'feature:status-changed') {
        this.handleFeatureStatusChanged(payload as FeatureEventPayload);
      } else if (type === 'feature:pr-merged') {
        this.handleFeaturePRMerged(payload as FeatureEventPayload);
      }
    });

    logger.info('LinearSyncService initialized with event subscriptions');
  }

  /**
   * Start the sync service
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('LinearSyncService is already running');
      return;
    }

    this.isRunning = true;
    logger.info('LinearSyncService started');
  }

  /**
   * Stop the sync service
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('LinearSyncService is not running');
      return;
    }

    this.isRunning = false;

    // Clear any in-progress syncs
    this.syncingFeatures.clear();

    logger.info('LinearSyncService stopped');
  }

  /**
   * Cleanup subscriptions and state
   */
  destroy(): void {
    this.stop();

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.emitter = null;
    this.settingsService = null;
    this.lastSyncTimes.clear();
    this.syncState.clear();

    logger.info('LinearSyncService destroyed');
  }

  /**
   * Check if Linear sync is enabled for a project
   */
  async isProjectSyncEnabled(projectPath: string): Promise<boolean> {
    if (!this.settingsService) {
      logger.warn('Settings service not available');
      return false;
    }

    try {
      const settings = await this.settingsService.getProjectSettings(projectPath);
      const linearConfig = settings.integrations?.linear;

      // Check if Linear integration is configured with OAuth token
      // At least one sync option should be enabled (default is true if not explicitly set)
      const hasSyncEnabled =
        linearConfig?.syncOnFeatureCreate !== false ||
        linearConfig?.syncOnStatusChange !== false ||
        linearConfig?.commentOnCompletion !== false;

      return !!(linearConfig?.enabled && linearConfig.agentToken && hasSyncEnabled);
    } catch (error) {
      logger.error(`Failed to check Linear sync settings for ${projectPath}:`, error);
      return false;
    }
  }

  /**
   * Get sync metadata for a feature
   */
  getSyncMetadata(featureId: string): SyncMetadata | undefined {
    return this.syncState.get(featureId);
  }

  /**
   * Update sync metadata for a feature
   */
  updateSyncMetadata(metadata: SyncMetadata): void {
    this.syncState.set(metadata.featureId, metadata);
    logger.debug(`Updated sync metadata for feature ${metadata.featureId}`, {
      status: metadata.lastSyncStatus,
      syncCount: metadata.syncCount,
    });
  }

  /**
   * Check if a feature should be synced (passes all guard checks)
   *
   * Guards:
   * 1. Service must be running
   * 2. Feature must not be currently syncing (loop prevention)
   * 3. Sufficient time must have passed since last sync (debouncing)
   */
  shouldSync(featureId: string): boolean {
    // Guard 1: Service must be running
    if (!this.isRunning) {
      logger.debug(`Sync skipped for ${featureId}: service not running`);
      return false;
    }

    // Guard 2: Feature must not be currently syncing (loop prevention)
    if (this.syncingFeatures.has(featureId)) {
      logger.debug(`Sync skipped for ${featureId}: already syncing (loop prevention)`);
      return false;
    }

    // Guard 3: Debouncing - check if enough time has passed since last sync
    const lastSyncTime = this.lastSyncTimes.get(featureId);
    if (lastSyncTime) {
      const timeSinceLastSync = Date.now() - lastSyncTime;
      if (timeSinceLastSync < DEBOUNCE_WINDOW_MS) {
        logger.debug(
          `Sync skipped for ${featureId}: debounce window active (${timeSinceLastSync}ms < ${DEBOUNCE_WINDOW_MS}ms)`
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Handle feature:created events
   */
  private handleFeatureCreated(payload: FeatureEventPayload): void {
    logger.debug('Received feature:created event', {
      featureId: payload.featureId,
      featureName: payload.featureName,
    });

    // No actual sync logic yet - just structure and guards
    // Future implementation will check guards and perform sync
  }

  /**
   * Handle feature:status-changed events
   */
  private handleFeatureStatusChanged(payload: FeatureEventPayload): void {
    logger.debug('Received feature:status-changed event', {
      featureId: payload.featureId,
      status: payload.status,
    });

    // No actual sync logic yet - just structure and guards
    // Future implementation will check guards and perform sync
  }

  /**
   * Handle feature:pr-merged events
   */
  private handleFeaturePRMerged(payload: FeatureEventPayload): void {
    logger.debug('Received feature:pr-merged event', {
      featureId: payload.featureId,
      prUrl: payload.prUrl,
    });

    // No actual sync logic yet - just structure and guards
    // Future implementation will check guards and perform sync
  }

  /**
   * Mark a feature as currently syncing (internal use by future sync logic)
   */
  protected markSyncing(featureId: string): void {
    this.syncingFeatures.add(featureId);
    this.lastSyncTimes.set(featureId, Date.now());
  }

  /**
   * Unmark a feature as syncing (internal use by future sync logic)
   */
  protected unmarkSyncing(featureId: string): void {
    this.syncingFeatures.delete(featureId);
  }
}

// Singleton instance
export const linearSyncService = new LinearSyncService();
