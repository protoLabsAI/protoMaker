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
import type { Feature } from '@automaker/types';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import { LinearMCPClient } from './linear-mcp-client.js';
import type { ProjectService } from './project-service.js';

const logger = createLogger('LinearSyncService');

/**
 * Aggregated sync metrics
 */
export interface SyncMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  conflictsDetected: number;
  pushCount: number;
  pullCount: number;
  avgDurationMs: number;
  lastOperationAt: string | null;
}

/**
 * A single sync activity entry for the activity log
 */
export interface SyncActivity {
  timestamp: string;
  featureId: string;
  direction: 'push' | 'pull';
  status: 'success' | 'error';
  durationMs: number;
  conflictDetected: boolean;
  error?: string;
}

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
  lastLinearState?: string;
  lastSyncedAt?: number;
  conflictDetected?: boolean;
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
  prNumber?: number;
  mergeCommitSha?: string;
  mergedBy?: string;
  error?: string;
}

/**
 * Project scaffolded event payload structure
 */
interface ProjectScaffoldedPayload {
  projectPath: string;
  projectSlug: string;
  projectTitle: string;
  milestoneCount: number;
  featuresCreated: number;
}

/**
 * Comment created event payload structure
 */
interface CommentCreatedPayload {
  commentId: string;
  issueId?: string;
  body: string;
  user?: {
    id: string;
    name: string;
    email?: string;
  };
  createdAt: string;
}

/**
 * Debounce time window in milliseconds (5 seconds)
 */
const DEBOUNCE_WINDOW_MS = 5000;

/**
 * Conflict detection window in milliseconds (10 seconds)
 * If syncs from both sources occur within this window, flag as conflict
 */
const CONFLICT_DETECTION_WINDOW_MS = 10000;

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
  private projectService: ProjectService | null = null;
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
  private running = false;

  /**
   * Metrics counters
   */
  private metrics: SyncMetrics = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    conflictsDetected: 0,
    pushCount: 0,
    pullCount: 0,
    avgDurationMs: 0,
    lastOperationAt: null,
  };

  /**
   * Circular buffer for recent activity (last 100 operations)
   */
  private activityLog: SyncActivity[] = [];
  private readonly MAX_ACTIVITY_LOG_SIZE = 100;

  /**
   * Initialize the service with event emitter, settings service, feature loader, and project service
   */
  initialize(
    emitter: EventEmitter,
    settingsService: SettingsService,
    featureLoader: FeatureLoader,
    projectService?: ProjectService
  ): void {
    this.emitter = emitter;
    this.settingsService = settingsService;
    this.featureLoader = featureLoader;
    this.projectService = projectService ?? null;

    // Subscribe to feature and project lifecycle events
    this.unsubscribe = emitter.subscribe((type, payload) => {
      if (type === 'feature:created') {
        this.handleFeatureCreated(payload as FeatureEventPayload);
      } else if (type === 'feature:status-changed') {
        this.handleFeatureStatusChanged(payload as FeatureEventPayload);
      } else if (type === 'feature:pr-merged') {
        this.handleFeaturePRMerged(payload as FeatureEventPayload);
      } else if (type === 'project:scaffolded') {
        this.handleProjectScaffolded(payload as ProjectScaffoldedPayload);
      } else if (type === 'linear:comment:created') {
        this.handleCommentCreated(payload as CommentCreatedPayload);
      }
    });

    logger.info('LinearSyncService initialized with event subscriptions');
  }

  /**
   * Start the sync service
   */
  start(): void {
    if (this.running) {
      logger.warn('LinearSyncService is already running');
      return;
    }

    this.running = true;
    logger.info('LinearSyncService started');
  }

  /**
   * Stop the sync service
   */
  stop(): void {
    if (!this.running) {
      logger.warn('LinearSyncService is not running');
      return;
    }

    this.running = false;

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
    this.activityLog = [];
    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      conflictsDetected: 0,
      pushCount: 0,
      pullCount: 0,
      avgDurationMs: 0,
      lastOperationAt: null,
    };

    logger.info('LinearSyncService destroyed');
  }

  /**
   * Check if the sync service is currently running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get aggregated sync metrics
   */
  getMetrics(): SyncMetrics {
    return { ...this.metrics };
  }

  /**
   * Get recent sync activity entries
   * @param limit Maximum entries to return (default: 20)
   */
  getRecentActivity(limit = 20): SyncActivity[] {
    return this.activityLog.slice(-limit);
  }

  /**
   * Record a sync operation result for metrics tracking
   */
  private recordOperation(
    featureId: string,
    direction: 'push' | 'pull',
    status: 'success' | 'error',
    durationMs: number,
    conflictDetected: boolean,
    error?: string
  ): void {
    // Update counters
    this.metrics.totalOperations++;
    if (status === 'success') {
      this.metrics.successfulOperations++;
    } else {
      this.metrics.failedOperations++;
    }
    if (conflictDetected) {
      this.metrics.conflictsDetected++;
    }
    if (direction === 'push') {
      this.metrics.pushCount++;
    } else {
      this.metrics.pullCount++;
    }
    this.metrics.lastOperationAt = new Date().toISOString();

    // Update rolling average duration (only for successful ops)
    if (status === 'success' && this.metrics.successfulOperations > 0) {
      const prevTotal = this.metrics.avgDurationMs * (this.metrics.successfulOperations - 1);
      this.metrics.avgDurationMs = (prevTotal + durationMs) / this.metrics.successfulOperations;
    }

    // Add to activity log (circular buffer)
    const activity: SyncActivity = {
      timestamp: new Date().toISOString(),
      featureId,
      direction,
      status,
      durationMs,
      conflictDetected,
      ...(error && { error }),
    };
    this.activityLog.push(activity);
    if (this.activityLog.length > this.MAX_ACTIVITY_LOG_SIZE) {
      this.activityLog.shift();
    }
  }

  /**
   * Check if Linear sync is enabled for a project.
   *
   * Sync is enabled when:
   * 1. Settings have `integrations.linear.enabled: true` AND a token source exists
   *    (agentToken, apiKey, or LINEAR_API_KEY env var)
   * 2. At least one sync option is not explicitly disabled
   */
  async isProjectSyncEnabled(projectPath: string): Promise<boolean> {
    if (!this.settingsService) {
      logger.warn('Settings service not available');
      return false;
    }

    try {
      const settings = await this.settingsService.getProjectSettings(projectPath);
      const linearConfig = settings.integrations?.linear;

      if (!linearConfig?.enabled) {
        return false;
      }

      // Check for any available token source
      const hasToken = !!(
        linearConfig.agentToken ||
        linearConfig.apiKey ||
        process.env.LINEAR_API_KEY ||
        process.env.LINEAR_API_TOKEN
      );

      if (!hasToken) {
        logger.warn(
          `Linear sync enabled for ${projectPath} but no API token configured. ` +
            'Set agentToken (OAuth), apiKey (settings), or LINEAR_API_KEY/LINEAR_API_TOKEN (env var).'
        );
        return false;
      }

      // At least one sync option should be enabled (default is true if not explicitly set)
      const hasSyncEnabled =
        linearConfig.syncOnFeatureCreate !== false ||
        linearConfig.syncOnStatusChange !== false ||
        linearConfig.commentOnCompletion !== false;

      return hasSyncEnabled;
    } catch (error) {
      logger.error(`Failed to check Linear sync settings for ${projectPath}:`, error);
      return false;
    }
  }

  /**
   * Resolve a Linear API token from project settings or environment.
   *
   * Priority: OAuth agentToken > settings apiKey > LINEAR_API_KEY env > LINEAR_API_TOKEN env
   *
   * @throws Error if no token source is available
   */
  private async resolveLinearToken(projectPath: string): Promise<string> {
    if (!this.settingsService) {
      throw new Error('SettingsService not initialized');
    }

    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearConfig = settings.integrations?.linear;

    // Priority 1: OAuth agent token
    if (linearConfig?.agentToken) {
      return linearConfig.agentToken;
    }

    // Priority 2: Personal API key from settings
    if (linearConfig?.apiKey) {
      return linearConfig.apiKey;
    }

    // Priority 3: Environment variable fallback
    const envToken = process.env.LINEAR_API_KEY || process.env.LINEAR_API_TOKEN;
    if (envToken) {
      return envToken;
    }

    throw new Error(
      'No Linear API token configured. Set agentToken (OAuth), apiKey (settings), or LINEAR_API_KEY/LINEAR_API_TOKEN (env var).'
    );
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
   * Get all features with detected conflicts
   */
  getConflicts(): SyncMetadata[] {
    const conflicts: SyncMetadata[] = [];
    for (const metadata of this.syncState.values()) {
      if (metadata.conflictDetected) {
        conflicts.push({ ...metadata });
      }
    }
    return conflicts;
  }

  /**
   * Resolve a conflict for a feature
   *
   * @param featureId - The feature with the conflict
   * @param strategy - Resolution strategy: 'accept-linear' keeps Linear state,
   *   'accept-automaker' keeps Automaker state, 'manual' just clears the flag
   * @returns true if conflict was found and resolved
   */
  resolveConflict(
    featureId: string,
    strategy: 'accept-linear' | 'accept-automaker' | 'manual'
  ): boolean {
    const metadata = this.syncState.get(featureId);
    if (!metadata || !metadata.conflictDetected) {
      return false;
    }

    metadata.conflictDetected = false;
    metadata.lastSyncStatus = 'success';
    this.syncState.set(featureId, metadata);

    logger.info(`Conflict resolved for feature ${featureId} using strategy: ${strategy}`);
    return true;
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
    if (!this.running) {
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

    const startTime = Date.now();

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

      // Mark as syncing to prevent duplicates (after validation checks)
      this.markSyncing(featureId);

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

      // Record metrics
      this.recordOperation(featureId, 'push', 'success', Date.now() - startTime, false);

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

      // Record metrics
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.recordOperation(featureId, 'push', 'error', Date.now() - startTime, false, errorMsg);

      // Update sync metadata with error
      const metadata: SyncMetadata = {
        featureId,
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'error',
        errorMessage: errorMsg,
        syncCount: 0,
      };
      this.updateSyncMetadata(metadata);

      // Emit error event
      if (this.emitter) {
        this.emitter.emit('linear:sync:error', {
          featureId,
          direction: 'push',
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      // Unmark syncing
      this.unmarkSyncing(featureId);
    }
  }

  /**
   * Format issue description with enhanced formatting for Linear
   * Includes SPARC PRD sections, antagonistic review verdicts, milestone context,
   * acceptance criteria, and estimated cost
   */
  private async formatIssueDescription(projectPath: string, feature: Feature): Promise<string> {
    const sections: string[] = [];

    // Basic description
    sections.push(feature.description || 'No description provided');

    // Add PRD metadata if available (SPARC sections)
    if (feature.prdMetadata) {
      sections.push('\n---\n## 📋 PRD Context');

      // Get the project to access SPARC PRD
      if (this.projectService && feature.projectSlug) {
        try {
          const project = await this.projectService.getProject(projectPath, feature.projectSlug);
          if (project?.prd) {
            const { prd } = project;

            // Format SPARC sections
            sections.push('\n### Situation');
            sections.push(prd.situation || 'N/A');

            sections.push('\n### Problem');
            sections.push(prd.problem || 'N/A');

            sections.push('\n### Approach');
            sections.push(prd.approach || 'N/A');

            sections.push('\n### Results');
            sections.push(prd.results || 'N/A');

            sections.push('\n### Constraints');
            sections.push(prd.constraints || 'N/A');
          }
        } catch (error) {
          logger.debug(
            `Could not fetch project PRD: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }

    // Add milestone context if available
    if (feature.milestoneSlug && this.projectService && feature.projectSlug) {
      try {
        const project = await this.projectService.getProject(projectPath, feature.projectSlug);
        const milestone = project?.milestones?.find((m) => m.slug === feature.milestoneSlug);
        if (milestone) {
          sections.push('\n---\n## 🎯 Milestone Context');
          sections.push(`**Milestone:** ${milestone.title}`);
          sections.push(`**Description:** ${milestone.description}`);
          sections.push(`**Status:** ${milestone.status}`);

          if (milestone.dependencies && milestone.dependencies.length > 0) {
            sections.push(`**Dependencies:** ${milestone.dependencies.join(', ')}`);
          }
        }
      } catch (error) {
        logger.debug(
          `Could not fetch milestone context: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Add acceptance criteria as checklist if available
    if (this.projectService && feature.projectSlug && feature.milestoneSlug) {
      try {
        const project = await this.projectService.getProject(projectPath, feature.projectSlug);
        const milestone = project?.milestones?.find((m) => m.slug === feature.milestoneSlug);
        const phase = milestone?.phases?.find((p) => p.featureId === feature.id);

        if (phase?.acceptanceCriteria && phase.acceptanceCriteria.length > 0) {
          sections.push('\n---\n## ✅ Acceptance Criteria');
          phase.acceptanceCriteria.forEach((criterion) => {
            sections.push(`- [ ] ${criterion}`);
          });
        }
      } catch (error) {
        logger.debug(
          `Could not fetch acceptance criteria: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Add antagonistic review verdicts if available
    if (this.projectService && feature.projectSlug) {
      try {
        const project = await this.projectService.getProject(projectPath, feature.projectSlug);
        // Check if project has review comments
        if (project?.reviewComments && project.reviewComments.length > 0) {
          sections.push('\n---\n## 🔍 Review Verdicts');

          // Group by reviewer
          const avaComments = project.reviewComments.filter((c) => c.author === 'ava');
          const jonComments = project.reviewComments.filter((c) => c.author === 'jon');

          if (avaComments.length > 0) {
            sections.push('\n### Ava (Operational Review)');
            avaComments.forEach((comment) => {
              const emoji =
                comment.type === 'approval'
                  ? '✅'
                  : comment.type === 'change-requested'
                    ? '⚠️'
                    : '💡';
              sections.push(
                `${emoji} **${comment.type}** ${comment.section ? `(${comment.section})` : ''}: ${comment.content}`
              );
            });
          }

          if (jonComments.length > 0) {
            sections.push('\n### Jon (Market Review)');
            jonComments.forEach((comment) => {
              const emoji =
                comment.type === 'approval'
                  ? '✅'
                  : comment.type === 'change-requested'
                    ? '⚠️'
                    : '💡';
              sections.push(
                `${emoji} **${comment.type}** ${comment.section ? `(${comment.section})` : ''}: ${comment.content}`
              );
            });
          }
        }
      } catch (error) {
        logger.debug(
          `Could not fetch review verdicts: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Add estimated cost if available
    if (feature.costUsd !== undefined && feature.costUsd > 0) {
      sections.push('\n---\n## 💰 Estimated Cost');
      sections.push(`**Total Cost:** $${feature.costUsd.toFixed(4)} USD`);

      if (feature.executionHistory && feature.executionHistory.length > 0) {
        sections.push(`**Executions:** ${feature.executionHistory.length}`);
        const totalTokens = feature.executionHistory.reduce(
          (sum, exec) => sum + (exec.inputTokens || 0) + (exec.outputTokens || 0),
          0
        );
        sections.push(`**Total Tokens:** ${totalTokens.toLocaleString()}`);
      }
    }

    // Add metadata footer
    sections.push('\n---\n_Synced from Automaker_');

    return sections.join('\n');
  }

  /**
   * Create a Linear issue via GraphQL API
   */
  private async createLinearIssue(
    projectPath: string,
    feature: Feature
  ): Promise<{ issueId: string; issueUrl: string }> {
    if (!this.settingsService) {
      throw new Error('SettingsService not initialized');
    }

    if (!this.featureLoader) {
      throw new Error('FeatureLoader not initialized');
    }

    // Get Linear OAuth token from settings
    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearAccessToken = await this.resolveLinearToken(projectPath);
    const teamId = settings.integrations?.linear?.teamId;

    if (!teamId) {
      throw new Error('No Linear team ID found in settings');
    }

    // Map Automaker priority (0-4) to Linear priority (0-4)
    // 0=none, 1=urgent, 2=high, 3=normal, 4=low
    const linearPriority = feature.priority ?? 3;

    // Build the issue title and description with enhanced formatting
    const title = feature.title || 'Untitled Feature';
    const description = await this.formatIssueDescription(projectPath, feature);

    // Check if this feature has a parent epic (milestone epic)
    // If so, get the parent's linearIssueId to set as parentId
    let parentId: string | undefined;
    if (feature.epicId) {
      const parentFeature = await this.featureLoader.get(projectPath, feature.epicId);
      if (parentFeature?.linearIssueId) {
        parentId = parentFeature.linearIssueId;
        logger.debug(
          `Setting parentId ${parentId} for child feature with epicId ${feature.epicId}`
        );
      }
    }

    // GraphQL mutation to create issue
    const mutation = `
      mutation CreateIssue($teamId: String!, $title: String!, $description: String!, $priority: Int!, $parentId: String) {
        issueCreate(input: { teamId: $teamId, title: $title, description: $description, priority: $priority, parentId: $parentId }) {
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
      parentId,
    };

    // Call Linear GraphQL API with 30s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${linearAccessToken}`,
        },
        body: JSON.stringify({ query: mutation, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

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
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linear API request timed out after 30s');
      }
      throw error;
    }
  }

  /**
   * Update a Linear issue via GraphQL API
   * Used to sync feature updates back to Linear with enhanced formatting
   */
  private async updateLinearIssue(
    projectPath: string,
    issueId: string,
    feature: Feature
  ): Promise<void> {
    if (!this.settingsService) {
      throw new Error('SettingsService not initialized');
    }

    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearAccessToken = await this.resolveLinearToken(projectPath);

    // Format the description with enhanced formatting
    const description = await this.formatIssueDescription(projectPath, feature);
    const title = feature.title || 'Untitled Feature';
    const priority = feature.priority ?? 3;

    // GraphQL mutation to update issue
    const mutation = `
      mutation UpdateIssue($id: String!, $title: String, $description: String, $priority: Int) {
        issueUpdate(id: $id, input: { title: $title, description: $description, priority: $priority }) {
          success
          issue {
            id
            url
          }
        }
      }
    `;

    const variables = {
      id: issueId,
      title,
      description,
      priority,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${linearAccessToken}`,
        },
        body: JSON.stringify({ query: mutation, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as {
        data?: {
          issueUpdate?: {
            success: boolean;
            issue?: { id: string; url: string };
          };
        };
        errors?: Array<{ message: string }>;
      };

      if (result.errors) {
        throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
      }

      if (!result.data?.issueUpdate?.success) {
        throw new Error('Failed to update Linear issue');
      }

      logger.info(`Updated Linear issue ${issueId} with enhanced formatting`);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linear API request timed out after 30s');
      }
      throw error;
    }
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

    const startTime = Date.now();

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

      // Mark as syncing to prevent duplicates (after validation checks)
      this.markSyncing(featureId);

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

      // Record metrics
      this.recordOperation(featureId, 'push', 'success', Date.now() - startTime, false);

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

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.recordOperation(featureId, 'push', 'error', Date.now() - startTime, false, errorMsg);

      // Update sync metadata with error
      const metadata: SyncMetadata = {
        featureId,
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'error',
        errorMessage: errorMsg,
        syncCount: 0,
      };
      this.updateSyncMetadata(metadata);

      // Emit error event
      if (this.emitter) {
        this.emitter.emit('linear:sync:error', {
          featureId,
          direction: 'push',
          error: errorMsg,
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
   * Map Linear workflow state to Automaker status (reverse mapping)
   */
  private mapLinearStateToAutomaker(stateName: string): string {
    const normalized = stateName.toLowerCase();

    if (normalized.includes('backlog') || normalized.includes('todo')) {
      return 'backlog';
    } else if (normalized.includes('in progress') || normalized.includes('started')) {
      return 'in_progress';
    } else if (normalized.includes('in review') || normalized.includes('review')) {
      return 'review';
    } else if (normalized.includes('done') || normalized.includes('completed')) {
      return 'done';
    } else if (normalized.includes('blocked')) {
      return 'blocked';
    } else {
      logger.warn(`Unknown Linear state: ${stateName}, defaulting to backlog`);
      return 'backlog';
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
    const linearAccessToken = await this.resolveLinearToken(projectPath);

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${linearAccessToken}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

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
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linear API request timed out after 30s');
      }
      throw error;
    }
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
    const linearAccessToken = await this.resolveLinearToken(projectPath);
    const teamId = settings.integrations?.linear?.teamId;

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${linearAccessToken}`,
        },
        body: JSON.stringify({ query: mutation, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

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
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linear API request timed out after 30s');
      }
      throw error;
    }
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
    const linearAccessToken = await this.resolveLinearToken(projectPath);

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${linearAccessToken}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

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
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linear API request timed out after 30s');
      }
      throw error;
    }
  }

  /**
   * Create custom workflow states for HITL (Human-In-The-Loop) deepening
   * Creates "Needs Human Review", "Escalated", and "Agent Denied" states
   * Stores state IDs in project config for routing
   *
   * Note: This requires Business plan for custom workflow states.
   * Gracefully degrades if the feature is not available.
   *
   * @param projectPath - The project path
   * @param teamId - The Linear team ID
   * @returns Object with created state IDs, or empty object if creation fails
   */
  async createCustomWorkflowStates(
    projectPath: string,
    teamId: string
  ): Promise<{ needsHumanReview?: string; escalated?: string; agentDenied?: string }> {
    if (!this.settingsService) {
      logger.warn('SettingsService not initialized, cannot create custom workflow states');
      return {};
    }

    const settings = await this.settingsService.getProjectSettings(projectPath);
    let linearAccessToken: string;
    try {
      linearAccessToken = await this.resolveLinearToken(projectPath);
    } catch {
      logger.warn('No Linear API token configured, cannot create custom workflow states');
      return {};
    }

    // Check if custom states already exist
    const existingStates = await this.getCustomWorkflowStates(projectPath, teamId);
    if (existingStates.needsHumanReview && existingStates.escalated && existingStates.agentDenied) {
      logger.info('Custom workflow states already exist, skipping creation');
      return existingStates;
    }

    const customStateIds: { needsHumanReview?: string; escalated?: string; agentDenied?: string } =
      {};

    // Define custom states to create
    const statesToCreate = [
      { name: 'Needs Human Review', type: 'started', color: '#f2c94c', key: 'needsHumanReview' },
      { name: 'Escalated', type: 'started', color: '#f2994a', key: 'escalated' },
      { name: 'Agent Denied', type: 'canceled', color: '#eb5757', key: 'agentDenied' },
    ] as const;

    // Try to create each state
    for (const stateConfig of statesToCreate) {
      // Skip if already exists
      const existingKey = stateConfig.key as keyof typeof existingStates;
      if (existingStates[existingKey]) {
        customStateIds[existingKey] = existingStates[existingKey];
        continue;
      }

      try {
        const mutation = `
          mutation CreateWorkflowState($teamId: String!, $name: String!, $type: String!, $color: String!) {
            workflowStateCreate(input: { teamId: $teamId, name: $name, type: $type, color: $color }) {
              success
              workflowState {
                id
                name
                type
                color
              }
            }
          }
        `;

        const variables = {
          teamId,
          name: stateConfig.name,
          type: stateConfig.type,
          color: stateConfig.color,
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${linearAccessToken}`,
          },
          body: JSON.stringify({ query: mutation, variables }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          logger.warn(
            `Failed to create workflow state "${stateConfig.name}": ${response.status} ${response.statusText}`
          );
          continue;
        }

        const result = (await response.json()) as {
          data?: {
            workflowStateCreate?: {
              success: boolean;
              workflowState?: { id: string; name: string };
            };
          };
          errors?: Array<{ message: string }>;
        };

        if (result.errors) {
          logger.warn(
            `Failed to create workflow state "${stateConfig.name}": ${result.errors.map((e) => e.message).join(', ')}`
          );
          continue;
        }

        if (
          result.data?.workflowStateCreate?.success &&
          result.data.workflowStateCreate.workflowState
        ) {
          const stateId = result.data.workflowStateCreate.workflowState.id;
          customStateIds[existingKey] = stateId;
          logger.info(`Created custom workflow state "${stateConfig.name}": ${stateId}`);
        }
      } catch (error) {
        // Graceful degradation: log warning but continue
        logger.warn(
          `Failed to create workflow state "${stateConfig.name}": ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Store state IDs in project config
    if (Object.keys(customStateIds).length > 0) {
      try {
        const currentSettings = await this.settingsService.getProjectSettings(projectPath);
        if (currentSettings.integrations?.linear) {
          currentSettings.integrations.linear.customStateIds = {
            ...currentSettings.integrations.linear.customStateIds,
            ...customStateIds,
          };
          await this.settingsService.updateProjectSettings(projectPath, currentSettings);
          logger.info('Stored custom workflow state IDs in project config');
        }
      } catch (error) {
        logger.error(
          `Failed to store custom state IDs in config: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return customStateIds;
  }

  /**
   * Get existing custom workflow states from Linear team
   * Returns state IDs for "Needs Human Review", "Escalated", and "Agent Denied"
   *
   * @param projectPath - The project path
   * @param teamId - The Linear team ID
   * @returns Object with existing state IDs
   */
  private async getCustomWorkflowStates(
    projectPath: string,
    teamId: string
  ): Promise<{ needsHumanReview?: string; escalated?: string; agentDenied?: string }> {
    if (!this.settingsService) {
      return {};
    }

    const settings = await this.settingsService.getProjectSettings(projectPath);
    let linearAccessToken: string;
    try {
      linearAccessToken = await this.resolveLinearToken(projectPath);
    } catch {
      return {};
    }

    try {
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

      const variables = { teamId };
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${linearAccessToken}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {};
      }

      const result = (await response.json()) as {
        data?: {
          team?: {
            states?: {
              nodes: Array<{ id: string; name: string }>;
            };
          };
        };
      };

      const states = result.data?.team?.states?.nodes || [];
      const customStates: { needsHumanReview?: string; escalated?: string; agentDenied?: string } =
        {};

      for (const state of states) {
        if (state.name === 'Needs Human Review') {
          customStates.needsHumanReview = state.id;
        } else if (state.name === 'Escalated') {
          customStates.escalated = state.id;
        } else if (state.name === 'Agent Denied') {
          customStates.agentDenied = state.id;
        }
      }

      return customStates;
    } catch (error) {
      logger.warn(
        `Failed to fetch existing custom workflow states: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return {};
    }
  }

  /**
   * Handle feature:pr-merged events
   */
  private async handleFeaturePRMerged(payload: FeatureEventPayload): Promise<void> {
    logger.debug('Received feature:pr-merged event', {
      featureId: payload.featureId,
      prUrl: payload.prUrl,
      prNumber: payload.prNumber,
    });

    // Call the async implementation
    await this.onPRMerged(payload);
  }

  /**
   * Add comment to Linear issue when PR is merged and mark issue as Done
   */
  private async onPRMerged(payload: FeatureEventPayload): Promise<void> {
    const { featureId, projectPath, prUrl, prNumber, mergedBy } = payload;

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

    // Check if comment on completion is enabled
    if (!this.settingsService) {
      logger.error('SettingsService not initialized');
      return;
    }

    const settings = await this.settingsService.getProjectSettings(projectPath);
    if (settings.integrations?.linear?.commentOnCompletion === false) {
      logger.debug(`Comment on completion disabled for project ${projectPath}`);
      return;
    }

    if (!this.featureLoader) {
      logger.error('FeatureLoader not initialized');
      return;
    }

    // Mark as syncing to prevent duplicates
    this.markSyncing(featureId);

    const startTime = Date.now();

    try {
      // Get the feature details
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        logger.error(`Feature ${featureId} not found`);
        return;
      }

      // Skip if feature has no Linear issue ID
      if (!feature.linearIssueId) {
        logger.debug(`Feature ${featureId} has no Linear issue ID, skipping PR merge sync`);
        return;
      }

      // Build the comment markdown
      const agentName = mergedBy || 'agent';
      const prLink = prUrl && prNumber ? `[#${prNumber}](${prUrl})` : prUrl || `#${prNumber}`;
      const timestamp = new Date().toISOString();
      const commentBody = `✅ PR merged: ${prLink} by ${agentName}. Feature complete.`;

      // Add comment to Linear issue
      await this.addCommentToIssue(projectPath, feature.linearIssueId, commentBody);

      // Mark issue as Done if not already
      const currentState = await this.getIssueState(projectPath, feature.linearIssueId);
      if (currentState !== 'Done') {
        await this.updateIssueStatus(projectPath, feature.linearIssueId, 'done');
      }

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

      // Record metrics
      this.recordOperation(featureId, 'push', 'success', Date.now() - startTime, false);

      // Emit completion event
      if (this.emitter) {
        this.emitter.emit('linear:sync:completed', {
          featureId,
          direction: 'push',
          conflictDetected: false,
          timestamp,
        });
      }

      logger.info(
        `Successfully synced PR merge for feature ${featureId} to Linear issue ${feature.linearIssueId}`
      );
    } catch (error) {
      logger.error(`Failed to sync PR merge for feature ${featureId}:`, error);

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.recordOperation(featureId, 'push', 'error', Date.now() - startTime, false, errorMsg);

      // Update sync metadata with error
      const metadata: SyncMetadata = {
        featureId,
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'error',
        errorMessage: errorMsg,
        syncCount: 0,
      };
      this.updateSyncMetadata(metadata);

      // Emit error event
      if (this.emitter) {
        this.emitter.emit('linear:sync:error', {
          featureId,
          direction: 'push',
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      // Unmark syncing
      this.unmarkSyncing(featureId);
    }
  }

  /**
   * Add a comment to a Linear issue
   */
  private async addCommentToIssue(
    projectPath: string,
    issueId: string,
    commentBody: string
  ): Promise<void> {
    if (!this.settingsService) {
      throw new Error('SettingsService not initialized');
    }

    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearAccessToken = await this.resolveLinearToken(projectPath);

    // GraphQL mutation to add comment
    const mutation = `
      mutation AddComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
          comment {
            id
            body
          }
        }
      }
    `;

    const variables = {
      issueId,
      body: commentBody,
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
        commentCreate?: {
          success: boolean;
          comment?: { id: string; body: string };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    if (!result.data?.commentCreate?.success) {
      throw new Error('Failed to add comment to Linear issue');
    }

    logger.info(`Added comment to Linear issue ${issueId}`);
  }

  /**
   * Handle project:scaffolded events
   */
  private async handleProjectScaffolded(payload: ProjectScaffoldedPayload): Promise<void> {
    logger.debug('Received project:scaffolded event', {
      projectSlug: payload.projectSlug,
      projectTitle: payload.projectTitle,
    });

    await this.onProjectScaffolded(payload);
  }

  /**
   * Create a Linear project when an Automaker project is scaffolded,
   * and add any synced child features to the project.
   */
  private async onProjectScaffolded(payload: ProjectScaffoldedPayload): Promise<void> {
    const { projectPath, projectSlug, projectTitle } = payload;

    if (!this.running) {
      logger.debug(`Sync skipped for project ${projectSlug}: service not running`);
      return;
    }

    // Check if sync is enabled for this project
    const syncEnabled = await this.isProjectSyncEnabled(projectPath);
    if (!syncEnabled) {
      logger.debug(`Linear sync not enabled for project ${projectPath}`);
      return;
    }

    if (!this.settingsService || !this.projectService) {
      logger.debug('SettingsService or ProjectService not initialized, skipping project sync');
      return;
    }

    const startTime = Date.now();

    try {
      // Get project to check if already synced
      const project = await this.projectService.getProject(projectPath, projectSlug);
      if (!project) {
        logger.error(`Project ${projectSlug} not found`);
        return;
      }

      // Skip if already synced
      if (project.linearProjectId) {
        logger.info(`Project ${projectSlug} already has Linear project ${project.linearProjectId}`);
        return;
      }

      // Get Linear settings
      const settings = await this.settingsService.getProjectSettings(projectPath);
      const teamId = settings.integrations?.linear?.teamId;

      if (!teamId) {
        logger.debug(`No Linear team ID configured for project ${projectPath}`);
        return;
      }

      // Create Linear project via LinearMCPClient
      const client = new LinearMCPClient(this.settingsService, projectPath);
      const result = await client.createProject({
        name: projectTitle,
        description: project.goal,
        teamIds: [teamId],
      });

      // Store linearProjectId on project metadata
      await this.projectService.updateProject(projectPath, projectSlug, {
        linearProjectId: result.projectId,
        linearProjectUrl: result.url,
      });

      // Also update the project-level Linear settings with the project ID
      const currentSettings = await this.settingsService.getProjectSettings(projectPath);
      if (currentSettings.integrations?.linear) {
        currentSettings.integrations.linear.projectId = result.projectId;
        await this.settingsService.updateProjectSettings(projectPath, currentSettings);
      }

      // Add child features that already have Linear issues to the project
      await this.addChildFeaturesToProject(projectPath, projectSlug, result.projectId, client);

      // Record metrics
      this.recordOperation(
        `project:${projectSlug}`,
        'push',
        'success',
        Date.now() - startTime,
        false
      );

      // Emit project sync event
      if (this.emitter) {
        this.emitter.emit('linear:project:created', {
          projectPath,
          projectSlug,
          linearProjectId: result.projectId,
          linearProjectUrl: result.url,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(`Created Linear project for ${projectSlug}: ${result.projectId}`);
    } catch (error) {
      logger.error(`Failed to sync project ${projectSlug} to Linear:`, error);

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.recordOperation(
        `project:${projectSlug}`,
        'push',
        'error',
        Date.now() - startTime,
        false,
        errorMsg
      );

      if (this.emitter) {
        this.emitter.emit('linear:sync:error', {
          projectSlug,
          direction: 'push',
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Add child features (that have linearIssueId) to a Linear project
   */
  private async addChildFeaturesToProject(
    projectPath: string,
    projectSlug: string,
    linearProjectId: string,
    client: LinearMCPClient
  ): Promise<void> {
    if (!this.featureLoader) {
      return;
    }

    try {
      // Get all features for this project path
      const features = await this.featureLoader.getAll(projectPath);

      // Filter features that have a linearIssueId (already synced to Linear)
      const syncedFeatures = features.filter((f: Feature) => f.linearIssueId);

      if (syncedFeatures.length === 0) {
        logger.debug(`No synced features to add to Linear project for ${projectSlug}`);
        return;
      }

      let addedCount = 0;
      for (const feature of syncedFeatures) {
        try {
          await client.addIssueToProject(feature.linearIssueId!, linearProjectId);
          addedCount++;
        } catch (error) {
          logger.warn(
            `Failed to add feature ${feature.id} to Linear project ${linearProjectId}:`,
            error
          );
        }
      }

      logger.info(
        `Added ${addedCount}/${syncedFeatures.length} features to Linear project ${linearProjectId}`
      );
    } catch (error) {
      logger.error(`Failed to add child features to Linear project:`, error);
    }
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

  /**
   * Handle comment:created events
   */
  private async handleCommentCreated(payload: CommentCreatedPayload): Promise<void> {
    logger.debug('Received linear:comment:created event', {
      commentId: payload.commentId,
      issueId: payload.issueId,
      userName: payload.user?.name,
    });

    // Call the async implementation
    await this.onCommentCreated(payload);
  }

  /**
   * Handle Linear comment creation
   * Parses comment and routes it based on content:
   * 1. Reply to agent elicitation -> forward to running agent
   * 2. New instructions -> update feature description
   * 3. Approval language -> trigger approval bridge
   *
   * @param payload - Comment creation payload
   */
  private async onCommentCreated(payload: CommentCreatedPayload): Promise<void> {
    const { commentId, issueId, body, user } = payload;

    if (!issueId) {
      logger.debug(`Comment ${commentId} has no issueId, skipping`);
      return;
    }

    if (!this.running) {
      logger.debug(`Sync service not running, skipping comment ${commentId}`);
      return;
    }

    if (!this.featureLoader) {
      logger.error('FeatureLoader not initialized');
      return;
    }

    try {
      // Find the feature associated with this Linear issue
      // We need to search across all projects since we don't have projectPath in the webhook
      // For now, we'll use process.cwd() as the project path
      const projectPath = process.cwd();
      const feature = await this.featureLoader.findByLinearIssueId(projectPath, issueId);

      if (!feature) {
        logger.debug(`No feature found for Linear issue ${issueId}, skipping comment routing`);
        return;
      }

      logger.info(`Processing comment for feature ${feature.id}`, {
        commentId,
        issueId,
        userName: user?.name,
      });

      // Parse comment to determine routing
      const commentLower = body.toLowerCase().trim();

      // Check for approval language
      if (this.isApprovalComment(commentLower)) {
        logger.info(`Approval comment detected on issue ${issueId}`);
        // Emit approval event for approval bridge to handle
        if (this.emitter) {
          this.emitter.emit('linear:approval:detected', {
            issueId,
            title: feature.title,
            description: feature.description,
            approvalState: 'Comment Approval',
            detectedAt: new Date().toISOString(),
          });
        }
        return;
      }

      // Check for new instructions (contains action words)
      if (this.isInstructionComment(commentLower)) {
        logger.info(`Instruction comment detected for feature ${feature.id}`);
        // Update feature description with new instructions
        const updatedDescription = `${feature.description}\n\n---\n\n**Additional Instructions from ${user?.name || 'Linear'}:**\n${body}`;
        await this.featureLoader.update(projectPath, feature.id, {
          description: updatedDescription,
        });

        // Emit event for potential signal creation
        if (this.emitter) {
          this.emitter.emit('linear:comment:instruction', {
            featureId: feature.id,
            issueId,
            commentBody: body,
            userName: user?.name,
          });
        }
        return;
      }

      // Default: treat as agent follow-up reply
      logger.info(`Treating comment as agent follow-up for feature ${feature.id}`);
      if (this.emitter) {
        this.emitter.emit('linear:comment:followup', {
          featureId: feature.id,
          projectPath,
          commentBody: body,
          userName: user?.name,
          issueId,
        });
      }
    } catch (error) {
      logger.error(`Failed to process comment ${commentId}:`, error);
    }
  }

  /**
   * Check if comment contains approval language
   */
  private isApprovalComment(commentLower: string): boolean {
    const approvalKeywords = [
      'approve',
      'approved',
      'looks good',
      'lgtm',
      'ship it',
      'go ahead',
      'proceed',
      'green light',
    ];
    return approvalKeywords.some((keyword) => commentLower.includes(keyword));
  }

  /**
   * Check if comment contains instruction language
   */
  private isInstructionComment(commentLower: string): boolean {
    const instructionKeywords = [
      'please',
      'can you',
      'could you',
      'make sure',
      'also',
      'additionally',
      'instead',
      'change',
      'update',
      'modify',
      'add',
      'remove',
      'fix',
    ];
    return instructionKeywords.some((keyword) => commentLower.includes(keyword));
  }

  /**
   * Create a Linear issue for PRD review
   * Called when a PRD needs human review before proceeding to planning
   *
   * @param projectPath - The project path
   * @param prdContent - The PRD markdown content
   * @param reviewSummary - Summary of what needs to be reviewed
   * @param recommendedAction - Recommended next steps
   * @returns Object with created issue ID and URL
   */
  async createPRDReviewIssue(
    projectPath: string,
    prdContent: string,
    reviewSummary: string,
    recommendedAction: string
  ): Promise<{ issueId: string; issueUrl: string }> {
    if (!this.settingsService) {
      throw new Error('SettingsService not initialized');
    }

    // Get Linear OAuth token from settings
    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearAccessToken = await this.resolveLinearToken(projectPath);
    const teamId = settings.integrations?.linear?.teamId;

    if (!teamId) {
      throw new Error('No Linear team ID found in settings');
    }

    // Build issue title and description
    const title = '🔍 PRD Review Required';
    const description = `## Review Summary
${reviewSummary}

## Recommended Action
${recommendedAction}

---

## PRD Content

${prdContent}

---

**Instructions:**
- Review the PRD content above
- If approved: Change status to **Approved** to trigger planning stage
- If changes needed: Change status to **Changes Requested** to return to PRD revision`;

    // Get the "In Review" state ID
    const stateId = await this.getWorkflowStateId(projectPath, teamId, 'In Review');

    // GraphQL mutation to create issue
    const mutation = `
      mutation CreateIssue($teamId: String!, $title: String!, $description: String!, $stateId: String!, $priority: Int!) {
        issueCreate(input: { teamId: $teamId, title: $title, description: $description, stateId: $stateId, priority: $priority }) {
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
      stateId,
      priority: 2, // High priority for reviews
    };

    // Call Linear GraphQL API with 30s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${linearAccessToken}`,
        },
        body: JSON.stringify({ query: mutation, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

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
        throw new Error('Failed to create Linear PRD review issue');
      }

      logger.info(`Created PRD review issue in Linear: ${result.data.issueCreate.issue.id}`);

      return {
        issueId: result.data.issueCreate.issue.id,
        issueUrl: result.data.issueCreate.issue.url,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linear API request timed out after 30s');
      }
      throw error;
    }
  }

  /**
   * Handle Linear issue updates (inbound sync from Linear to Automaker)
   * This method is called when a Linear issue is updated externally.
   * Syncs status, priority, and title changes in a single batched update.
   *
   * @param linearIssueId - The Linear issue ID that was updated
   * @param newStateName - The new Linear workflow state name
   * @param projectPath - The project path (required to find the feature)
   * @param options - Optional additional fields to sync (title, priority)
   */
  async onLinearIssueUpdated(
    linearIssueId: string,
    newStateName: string,
    projectPath: string,
    options?: { title?: string; priority?: number }
  ): Promise<void> {
    const startTime = Date.now();
    let featureId = 'unknown';

    try {
      // Find the feature by Linear issue ID
      if (!this.featureLoader) {
        logger.error('FeatureLoader not initialized');
        return;
      }

      const feature = await this.featureLoader.findByLinearIssueId(projectPath, linearIssueId);
      if (!feature) {
        logger.warn(`No feature found for Linear issue ${linearIssueId}, skipping sync`);
        return;
      }

      featureId = feature.id;

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

      // Get sync metadata to check for loop prevention
      const metadata = this.getSyncMetadata(featureId);

      // Loop prevention: Skip if last sync was from Automaker (outbound push)
      if (metadata?.syncSource === 'automaker') {
        const timeSinceLastSync = Date.now() - (metadata.lastSyncTimestamp || 0);
        if (timeSinceLastSync < DEBOUNCE_WINDOW_MS) {
          logger.debug(
            `Skipping Linear update for ${featureId}: last sync was from Automaker ${timeSinceLastSync}ms ago (loop prevention)`
          );
          return;
        }
      }

      // Collect all changes to batch into a single update
      const featureUpdates: Record<string, any> = {};
      const changeDescriptions: string[] = [];

      // --- Status sync ---
      const lastLinearState = metadata?.lastLinearState;
      const stateChanged = lastLinearState !== newStateName;

      if (stateChanged) {
        const newAutomakerStatus = this.mapLinearStateToAutomaker(newStateName);
        if (feature.status !== newAutomakerStatus) {
          featureUpdates.status = newAutomakerStatus;
          featureUpdates.statusChangeReason = `Synced from Linear (${newStateName})`;
          changeDescriptions.push(`status: ${feature.status} → ${newAutomakerStatus}`);
        }
      }

      // --- Title sync ---
      if (options?.title !== undefined && options.title !== feature.title) {
        featureUpdates.title = options.title;
        changeDescriptions.push(`title: "${feature.title}" → "${options.title}"`);
      }

      // --- Priority sync (Linear 0-4 → Automaker 0-4, direct mapping) ---
      if (options?.priority !== undefined && options.priority !== feature.priority) {
        featureUpdates.priority = options.priority;
        changeDescriptions.push(`priority: ${feature.priority ?? 'none'} → ${options.priority}`);
      }

      // If nothing changed, just update metadata and return
      if (Object.keys(featureUpdates).length === 0) {
        if (stateChanged) {
          // State name changed but mapped to same Automaker status — still record it
          const updatedMetadata: SyncMetadata = {
            ...metadata,
            featureId,
            lastSyncTimestamp: Date.now(),
            lastSyncStatus: 'success',
            linearIssueId,
            syncCount: (metadata?.syncCount || 0) + 1,
            syncSource: 'linear',
            syncDirection: 'pull',
            lastLinearState: newStateName,
            lastSyncedAt: Date.now(),
          };
          this.updateSyncMetadata(updatedMetadata);
        }
        logger.debug(`No field changes needed for feature ${featureId}`);
        return;
      }

      // Mark as syncing to prevent duplicates
      this.markSyncing(featureId);

      try {
        // Detect conflicts: if last sync was very recent from either source
        let conflictDetected = false;
        if (metadata?.lastSyncedAt) {
          const timeSinceLastSync = Date.now() - metadata.lastSyncedAt;
          if (timeSinceLastSync < CONFLICT_DETECTION_WINDOW_MS) {
            conflictDetected = true;
            logger.warn(
              `Conflict detected for feature ${featureId}: syncs from both sources within ${CONFLICT_DETECTION_WINDOW_MS}ms window`
            );
          }
        }

        // Batch all field updates into a single call
        await this.featureLoader.update(projectPath, featureId, featureUpdates);

        // Update sync metadata
        const updatedMetadata: SyncMetadata = {
          featureId,
          lastSyncTimestamp: Date.now(),
          lastSyncStatus: 'success',
          linearIssueId,
          syncCount: (metadata?.syncCount || 0) + 1,
          syncSource: 'linear',
          syncDirection: 'pull',
          lastLinearState: newStateName,
          lastSyncedAt: Date.now(),
          conflictDetected,
        };
        this.updateSyncMetadata(updatedMetadata);

        // Record metrics
        this.recordOperation(
          featureId,
          'pull',
          'success',
          Date.now() - startTime,
          conflictDetected
        );

        // Emit completion event
        if (this.emitter) {
          this.emitter.emit('linear:sync:completed', {
            featureId,
            direction: 'pull',
            conflictDetected,
            changes: changeDescriptions,
            timestamp: new Date().toISOString(),
          });
        }

        logger.info(
          `Synced Linear issue ${linearIssueId} → feature ${featureId}: ${changeDescriptions.join(', ')}${conflictDetected ? ' (conflict detected)' : ''}`
        );
      } finally {
        // Unmark syncing
        this.unmarkSyncing(featureId);
      }
    } catch (error) {
      logger.error(`Failed to sync Linear issue ${linearIssueId}:`, error);

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.recordOperation(featureId, 'pull', 'error', Date.now() - startTime, false, errorMsg);

      // Emit error event
      if (this.emitter) {
        this.emitter.emit('linear:sync:error', {
          linearIssueId,
          direction: 'pull',
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}

// Singleton instance
export const linearSyncService = new LinearSyncService();
