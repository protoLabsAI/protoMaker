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
import type { FeatureLoader } from './feature-loader.js';

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
  syncSource?: 'automaker' | 'linear';
  syncDirection?: 'push' | 'pull';
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
  private featureLoader: FeatureLoader | null = null;
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
   * Initialize the service with event emitter, settings service, and feature loader
   */
  initialize(
    emitter: EventEmitter,
    settingsService: SettingsService,
    featureLoader: FeatureLoader
  ): void {
    this.emitter = emitter;
    this.settingsService = settingsService;
    this.featureLoader = featureLoader;

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
  private async handleFeatureCreated(payload: FeatureEventPayload): Promise<void> {
    logger.debug('Received feature:created event', {
      featureId: payload.featureId,
      featureName: payload.featureName,
    });

    // Call the async implementation
    await this.onFeatureCreated(payload);
  }

  /**
   * Create Linear issue when a feature is created
   */
  private async onFeatureCreated(payload: FeatureEventPayload): Promise<void> {
    const { featureId, projectPath } = payload;

    // Guard: Check if service is running and sync is enabled
    if (!this.shouldSync(featureId)) {
      return;
    }

    // Check if sync is enabled for this project
    const syncEnabled = await this.isProjectSyncEnabled(projectPath);
    if (!syncEnabled) {
      logger.debug(`Linear sync not enabled for project ${projectPath}`);
      return;
    }

    if (!this.featureLoader) {
      logger.error('FeatureLoader not initialized');
      return;
    }

    // Mark as syncing to prevent duplicates
    this.markSyncing(featureId);

    try {
      // Get the feature details
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        logger.error(`Feature ${featureId} not found`);
        return;
      }

      // Skip if already synced to Linear
      if (feature.linearIssueId) {
        logger.info(`Feature ${featureId} already has Linear issue ${feature.linearIssueId}`);
        return;
      }

      // Create Linear issue
      const issueResult = await this.createLinearIssue(projectPath, feature);

      // Update feature with Linear issue info
      await this.featureLoader.update(projectPath, featureId, {
        linearIssueId: issueResult.issueId,
        linearIssueUrl: issueResult.issueUrl,
      });

      // Update sync metadata
      const metadata: SyncMetadata = {
        featureId,
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'success',
        linearIssueId: issueResult.issueId,
        syncCount: 1,
        syncSource: 'automaker',
        syncDirection: 'push',
      };
      this.updateSyncMetadata(metadata);

      // Emit completion event
      if (this.emitter) {
        this.emitter.emit('linear:sync:completed', {
          featureId,
          direction: 'push',
          conflictDetected: false,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(
        `Successfully synced feature ${featureId} to Linear issue ${issueResult.issueId}`
      );
    } catch (error) {
      logger.error(`Failed to sync feature ${featureId} to Linear:`, error);

      // Update sync metadata with error
      const metadata: SyncMetadata = {
        featureId,
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        syncCount: 0,
      };
      this.updateSyncMetadata(metadata);

      // Emit error event
      if (this.emitter) {
        this.emitter.emit('linear:sync:error', {
          featureId,
          direction: 'push',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      // Unmark syncing
      this.unmarkSyncing(featureId);
    }
  }

  /**
   * Create a Linear issue via GraphQL API
   */
  private async createLinearIssue(
    projectPath: string,
    feature: { title?: string; description: string; priority?: 0 | 1 | 2 | 3 | 4 }
  ): Promise<{ issueId: string; issueUrl: string }> {
    if (!this.settingsService) {
      throw new Error('SettingsService not initialized');
    }

    // Get Linear OAuth token from settings
    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearAccessToken = settings.integrations?.linear?.agentToken;
    const teamId = settings.integrations?.linear?.teamId;

    if (!linearAccessToken) {
      throw new Error('No Linear OAuth token found in settings');
    }

    if (!teamId) {
      throw new Error('No Linear team ID found in settings');
    }

    // Map Automaker priority (0-4) to Linear priority (0-4)
    // 0=none, 1=urgent, 2=high, 3=normal, 4=low
    const linearPriority = feature.priority ?? 3;

    // Build the issue title and description
    const title = feature.title || 'Untitled Feature';
    const description = feature.description || 'No description provided';

    // GraphQL mutation to create issue
    const mutation = `
      mutation CreateIssue($teamId: String!, $title: String!, $description: String!, $priority: Int!) {
        issueCreate(input: { teamId: $teamId, title: $title, description: $description, priority: $priority }) {
          success
          issue {
            id
            url
          }
        }
      }
    `;

    const variables = {
      teamId,
      title,
      description,
      priority: linearPriority,
    };

    // Call Linear GraphQL API
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${linearAccessToken}`,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as {
      data?: {
        issueCreate?: {
          success: boolean;
          issue?: { id: string; url: string };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    if (!result.data?.issueCreate?.success || !result.data.issueCreate.issue) {
      throw new Error('Failed to create Linear issue');
    }

    return {
      issueId: result.data.issueCreate.issue.id,
      issueUrl: result.data.issueCreate.issue.url,
    };
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
