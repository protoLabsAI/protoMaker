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
  private async handleFeatureStatusChanged(payload: FeatureEventPayload): Promise<void> {
    logger.debug('Received feature:status-changed event', {
      featureId: payload.featureId,
      status: payload.status,
    });

    // Call the async implementation
    await this.onFeatureStatusChanged(payload);
  }

  /**
   * Sync feature status changes to Linear
   */
  private async onFeatureStatusChanged(payload: FeatureEventPayload): Promise<void> {
    const { featureId, projectPath, status } = payload;

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

    // Check if status change sync is enabled
    if (!this.settingsService) {
      logger.error('SettingsService not initialized');
      return;
    }

    const settings = await this.settingsService.getProjectSettings(projectPath);
    if (settings.integrations?.linear?.syncOnStatusChange === false) {
      logger.debug(`Status change sync disabled for project ${projectPath}`);
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

      // Skip if feature has no Linear issue ID
      if (!feature.linearIssueId) {
        logger.debug(`Feature ${featureId} has no Linear issue ID, skipping status sync`);
        return;
      }

      // Skip if status is unchanged from last sync
      const lastMetadata = this.getSyncMetadata(featureId);
      if (lastMetadata?.linearIssueId === feature.linearIssueId) {
        // Check if status is the same
        const currentLinearState = await this.getIssueState(projectPath, feature.linearIssueId);
        const newLinearState = this.mapAutomakerStatusToLinear(
          status || feature.status || 'backlog'
        );

        if (currentLinearState === newLinearState) {
          logger.debug(`Status unchanged for feature ${featureId}, skipping sync`);
          return;
        }
      }

      // Update Linear issue status
      await this.updateIssueStatus(
        projectPath,
        feature.linearIssueId,
        status || feature.status || 'backlog'
      );

      // Update sync metadata
      const existingMetadata = this.getSyncMetadata(featureId);
      const metadata: SyncMetadata = {
        featureId,
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'success',
        linearIssueId: feature.linearIssueId,
        syncCount: (existingMetadata?.syncCount || 0) + 1,
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
        `Successfully synced status change for feature ${featureId} to Linear issue ${feature.linearIssueId}`
      );
    } catch (error) {
      logger.error(`Failed to sync status change for feature ${featureId}:`, error);

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
   * Map Automaker status to Linear workflow state name
   */
  private mapAutomakerStatusToLinear(status: string): string {
    switch (status) {
      case 'backlog':
        return 'Backlog';
      case 'in_progress':
        return 'In Progress';
      case 'review':
        return 'In Review';
      case 'done':
        return 'Done';
      case 'blocked':
        return 'Blocked';
      case 'verified':
        return 'Done'; // Map verified to Done
      default:
        logger.warn(`Unknown Automaker status: ${status}, defaulting to Backlog`);
        return 'Backlog';
    }
  }

  /**
   * Get current Linear issue state
   */
  private async getIssueState(projectPath: string, issueId: string): Promise<string> {
    if (!this.settingsService) {
      throw new Error('SettingsService not initialized');
    }

    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearAccessToken = settings.integrations?.linear?.agentToken;

    if (!linearAccessToken) {
      throw new Error('No Linear OAuth token found in settings');
    }

    // GraphQL query to get issue state
    const query = `
      query GetIssue($id: String!) {
        issue(id: $id) {
          id
          state {
            name
          }
        }
      }
    `;

    const variables = {
      id: issueId,
    };

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${linearAccessToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as {
      data?: {
        issue?: {
          state?: { name: string };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    return result.data?.issue?.state?.name || 'Backlog';
  }

  /**
   * Update Linear issue status
   */
  private async updateIssueStatus(
    projectPath: string,
    issueId: string,
    status: string
  ): Promise<void> {
    if (!this.settingsService) {
      throw new Error('SettingsService not initialized');
    }

    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearAccessToken = settings.integrations?.linear?.agentToken;
    const teamId = settings.integrations?.linear?.teamId;

    if (!linearAccessToken) {
      throw new Error('No Linear OAuth token found in settings');
    }

    if (!teamId) {
      throw new Error('No Linear team ID found in settings');
    }

    // Map status to Linear state name
    const linearStateName = this.mapAutomakerStatusToLinear(status);

    // Get workflow state ID from Linear
    const stateId = await this.getWorkflowStateId(projectPath, teamId, linearStateName);

    // GraphQL mutation to update issue
    const mutation = `
      mutation UpdateIssue($id: String!, $stateId: String!) {
        issueUpdate(id: $id, input: { stateId: $stateId }) {
          success
          issue {
            id
            state {
              name
            }
          }
        }
      }
    `;

    const variables = {
      id: issueId,
      stateId,
    };

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
        issueUpdate?: {
          success: boolean;
          issue?: { id: string; state?: { name: string } };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    if (!result.data?.issueUpdate?.success) {
      throw new Error('Failed to update Linear issue status');
    }

    logger.info(`Updated Linear issue ${issueId} to state: ${linearStateName}`);
  }

  /**
   * Get workflow state ID from Linear by state name
   */
  private async getWorkflowStateId(
    projectPath: string,
    teamId: string,
    stateName: string
  ): Promise<string> {
    if (!this.settingsService) {
      throw new Error('SettingsService not initialized');
    }

    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearAccessToken = settings.integrations?.linear?.agentToken;

    if (!linearAccessToken) {
      throw new Error('No Linear OAuth token found in settings');
    }

    // GraphQL query to fetch workflow states
    const query = `
      query GetWorkflowStates($teamId: String!) {
        team(id: $teamId) {
          id
          states {
            nodes {
              id
              name
            }
          }
        }
      }
    `;

    const variables = {
      teamId,
    };

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${linearAccessToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as {
      data?: {
        team?: {
          states?: {
            nodes: Array<{ id: string; name: string }>;
          };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    const states = result.data?.team?.states?.nodes || [];
    const state = states.find((s) => s.name === stateName);

    if (!state) {
      throw new Error(`Workflow state "${stateName}" not found in Linear team ${teamId}`);
    }

    return state.id;
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
