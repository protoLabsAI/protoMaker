/**
 * Linear Sync Service — Orchestrator
 *
 * Thin coordinator that:
 *  1. Manages guard state (loop prevention, debouncing, metrics, activity log)
 *  2. Wires sub-services via a shared SyncGuards callback object
 *  3. Subscribes to feature/project lifecycle events and routes them
 *  4. Delegates all sync business logic to focused modules:
 *     - LinearIssueSync      — feature → Linear issue (create / update / merge)
 *     - LinearProjectSync    — project scaffolding, milestone sync, status sync
 *     - LinearWebhookHandler — inbound Linear → Automaker (status/title/deps)
 *     - LinearCommentService — comment routing, PRD workflows
 */

import { createLogger } from '@protolabs-ai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ProjectService } from './project-service.js';
import { LinearIssueSync } from './linear-issue-sync.js';
import { LinearProjectSync } from './linear-project-sync.js';
import { LinearWebhookHandler } from './linear-webhook-handler.js';
import { LinearCommentService } from './linear-comment-service.js';
import {
  mapAutomakerStatusToLinear as _mapAutomakerStatusToLinear,
  mapLinearStateToAutomaker as _mapLinearStateToAutomaker,
} from './linear-state-mapper.js';
import {
  DEBOUNCE_WINDOW_MS,
  type SyncMetrics,
  type SyncActivity,
  type SyncMetadata,
  type SyncGuards,
  type FeatureEventPayload,
  type ProjectScaffoldedPayload,
  type ProjectStatusChangedPayload,
  type CommentCreatedPayload,
} from './linear-sync-types.js';

// Re-export types consumed by route files and other services
export type { SyncMetrics, SyncActivity, SyncMetadata };

const logger = createLogger('LinearSyncService');

export class LinearSyncService {
  // ---- injected dependencies ----
  private emitter: EventEmitter | null = null;
  private settingsService: SettingsService | null = null;
  private unsubscribe: (() => void) | null = null;

  // ---- guard state ----
  private syncingFeatures: Set<string> = new Set();
  private lastSyncTimes: Map<string, number> = new Map();
  private syncState: Map<string, SyncMetadata> = new Map();
  private running = false;

  // ---- metrics ----
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
  private activityLog: SyncActivity[] = [];
  private readonly MAX_ACTIVITY_LOG_SIZE = 100;

  // ---- sub-services ----
  private readonly issueSync = new LinearIssueSync();
  private readonly projectSync = new LinearProjectSync();
  private readonly webhookHandler = new LinearWebhookHandler();
  private readonly commentService = new LinearCommentService();

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  initialize(
    emitter: EventEmitter,
    settingsService: SettingsService,
    featureLoader: FeatureLoader,
    projectService?: ProjectService
  ): void {
    this.emitter = emitter;
    this.settingsService = settingsService;

    const guards = this.buildGuards();

    this.issueSync.initialize(settingsService, featureLoader, guards, projectService);
    this.projectSync.initialize(settingsService, featureLoader, guards, projectService);
    this.webhookHandler.initialize(settingsService, featureLoader, guards);
    this.commentService.initialize(settingsService, featureLoader, guards);

    this.unsubscribe = emitter.subscribe((type, payload) => {
      void this.route(type, payload);
    });

    logger.info('LinearSyncService initialized');
  }

  start(): void {
    if (this.running) {
      logger.warn('LinearSyncService is already running');
      return;
    }
    this.running = true;
    logger.info('LinearSyncService started');
  }

  stop(): void {
    if (!this.running) {
      logger.warn('LinearSyncService is not running');
      return;
    }
    this.running = false;
    this.syncingFeatures.clear();
    logger.info('LinearSyncService stopped');
  }

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

  isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------------
  // Event routing
  // -------------------------------------------------------------------------

  private async route(type: string, payload: unknown): Promise<void> {
    if (!this.running) return;
    if (type === 'feature:created') {
      await this.issueSync.onFeatureCreated(payload as FeatureEventPayload);
    } else if (type === 'feature:status-changed') {
      await this.issueSync.onFeatureStatusChanged(payload as FeatureEventPayload);
    } else if (type === 'feature:deleted') {
      await this.issueSync.onFeatureDeleted(payload as FeatureEventPayload);
    } else if (type === 'feature:pr-merged') {
      await this.issueSync.onPRMerged(payload as FeatureEventPayload);
    } else if (type === 'project:scaffolded') {
      await this.projectSync.handleProjectScaffolded(payload as ProjectScaffoldedPayload);
    } else if (type === 'project:status-changed') {
      await this.projectSync.handleProjectStatusChanged(payload as ProjectStatusChangedPayload);
    } else if (type === 'linear:comment:created') {
      await this.commentService.handleCommentCreated(payload as CommentCreatedPayload);
    } else if (type === 'authority:pm-prd-ready') {
      this.commentService.handlePrdReady(
        payload as { projectPath?: string; featureId?: string; prd?: string }
      );
    }
  }

  // -------------------------------------------------------------------------
  // Guard methods (shared with sub-services via SyncGuards)
  // -------------------------------------------------------------------------

  shouldSync(featureId: string): boolean {
    if (!this.running) {
      logger.debug(`Sync skipped for ${featureId}: service not running`);
      return false;
    }
    if (this.syncingFeatures.has(featureId)) {
      logger.debug(`Sync skipped for ${featureId}: already syncing`);
      return false;
    }
    const lastSync = this.lastSyncTimes.get(featureId);
    if (lastSync && Date.now() - lastSync < DEBOUNCE_WINDOW_MS) {
      logger.debug(`Sync skipped for ${featureId}: debounce window active`);
      return false;
    }
    return true;
  }

  protected markSyncing(featureId: string): void {
    this.syncingFeatures.add(featureId);
    this.lastSyncTimes.set(featureId, Date.now());
  }

  protected unmarkSyncing(featureId: string): void {
    this.syncingFeatures.delete(featureId);
  }

  protected mapAutomakerStatusToLinear(status: string): string {
    return _mapAutomakerStatusToLinear(status);
  }

  protected mapLinearStateToAutomaker(stateName: string): string {
    return _mapLinearStateToAutomaker(stateName);
  }

  protected async getWorkflowStateId(
    projectPath: string,
    teamId: string,
    stateName: string
  ): Promise<string> {
    return this.issueSync.getWorkflowStateId(projectPath, teamId, stateName);
  }

  protected async addCommentToIssue(
    projectPath: string,
    issueId: string,
    commentBody: string
  ): Promise<void> {
    return this.issueSync.addCommentToIssue(projectPath, issueId, commentBody);
  }

  async isProjectSyncEnabled(projectPath: string): Promise<boolean> {
    if (!this.settingsService) return false;
    try {
      const settings = await this.settingsService.getProjectSettings(projectPath);
      const linear = settings?.integrations?.linear;
      if (!linear?.enabled) return false;
      const hasToken = !!(
        linear.agentToken ||
        linear.apiKey ||
        process.env.LINEAR_API_KEY ||
        process.env.LINEAR_API_TOKEN
      );
      if (!hasToken) {
        logger.warn(`Linear sync enabled for ${projectPath} but no API token configured.`);
        return false;
      }
      return (
        linear.syncOnFeatureCreate !== false ||
        linear.syncOnStatusChange !== false ||
        linear.commentOnCompletion !== false
      );
    } catch (error) {
      logger.error(`Failed to check Linear sync settings for ${projectPath}:`, error);
      return false;
    }
  }

  getSyncMetadata(featureId: string): SyncMetadata | undefined {
    return this.syncState.get(featureId);
  }

  updateSyncMetadata(metadata: SyncMetadata): void {
    this.syncState.set(metadata.featureId, metadata);
  }

  getConflicts(): SyncMetadata[] {
    return [...this.syncState.values()].filter((m) => m.conflictDetected).map((m) => ({ ...m }));
  }

  resolveConflict(
    featureId: string,
    strategy: 'accept-linear' | 'accept-automaker' | 'manual'
  ): boolean {
    const metadata = this.syncState.get(featureId);
    if (!metadata?.conflictDetected) return false;
    metadata.conflictDetected = false;
    metadata.lastSyncStatus = 'success';
    this.syncState.set(featureId, metadata);
    logger.info(`Conflict resolved for feature ${featureId} using strategy: ${strategy}`);
    return true;
  }

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------

  getMetrics(): SyncMetrics {
    return { ...this.metrics };
  }

  getRecentActivity(limit = 20): SyncActivity[] {
    return this.activityLog.slice(-limit);
  }

  private recordOperation(
    featureId: string,
    direction: 'push' | 'pull',
    status: 'success' | 'error',
    durationMs: number,
    conflictDetected: boolean,
    error?: string
  ): void {
    this.metrics.totalOperations++;
    if (status === 'success') this.metrics.successfulOperations++;
    else this.metrics.failedOperations++;
    if (conflictDetected) this.metrics.conflictsDetected++;
    if (direction === 'push') this.metrics.pushCount++;
    else this.metrics.pullCount++;
    this.metrics.lastOperationAt = new Date().toISOString();

    if (status === 'success' && this.metrics.successfulOperations > 0) {
      const prevTotal = this.metrics.avgDurationMs * (this.metrics.successfulOperations - 1);
      this.metrics.avgDurationMs = (prevTotal + durationMs) / this.metrics.successfulOperations;
    }

    this.activityLog.push({
      timestamp: new Date().toISOString(),
      featureId,
      direction,
      status,
      durationMs,
      conflictDetected,
      ...(error && { error }),
    });
    if (this.activityLog.length > this.MAX_ACTIVITY_LOG_SIZE) this.activityLog.shift();
  }

  // -------------------------------------------------------------------------
  // Public delegation to sub-services
  // -------------------------------------------------------------------------

  async createCustomWorkflowStates(
    projectPath: string,
    teamId: string
  ): Promise<{ needsHumanReview?: string; escalated?: string; agentDenied?: string }> {
    return this.projectSync.createCustomWorkflowStates(projectPath, teamId);
  }

  async syncProjectStatusToLinear(
    projectPath: string,
    projectSlug: string,
    projectStatus: string
  ): Promise<void> {
    return this.projectSync.syncProjectStatusToLinear(projectPath, projectSlug, projectStatus);
  }

  async createPRDReviewIssue(
    projectPath: string,
    prdContent: string,
    reviewSummary: string,
    recommendedAction: string
  ): Promise<{ issueId: string; issueUrl: string }> {
    return this.commentService.createPRDReviewIssue(
      projectPath,
      prdContent,
      reviewSummary,
      recommendedAction
    );
  }

  async onLinearIssueUpdated(
    linearIssueId: string,
    newStateName: string,
    projectPath: string,
    options?: { title?: string; priority?: number; dueDate?: string }
  ): Promise<void> {
    return this.webhookHandler.onLinearIssueUpdated(
      linearIssueId,
      newStateName,
      projectPath,
      options
    );
  }

  async syncProjectToLinear(
    projectPath: string,
    projectSlug: string,
    options?: { linearProjectId?: string; cleanupPlaceholders?: boolean }
  ): Promise<{
    success: boolean;
    linearProjectId: string;
    milestones: Array<{
      name: string;
      linearMilestoneId: string;
      action: 'created' | 'updated' | 'existing';
    }>;
    issuesAssigned: number;
    deletedPlaceholders: string[];
    errors: string[];
  }> {
    return this.projectSync.syncProjectToLinear(projectPath, projectSlug, options);
  }

  // -------------------------------------------------------------------------
  // Guard factory
  // -------------------------------------------------------------------------

  private buildGuards(): SyncGuards {
    // Capture emitter reference for use in the getter closure.
    // Arrow functions below capture `this` lexically from the class method.
    const emitter = this.emitter;
    return {
      shouldSync: (id) => this.shouldSync(id),
      markSyncing: (id) => this.markSyncing(id),
      unmarkSyncing: (id) => this.unmarkSyncing(id),
      isProjectSyncEnabled: (path) => this.isProjectSyncEnabled(path),
      getSyncMetadata: (id) => this.getSyncMetadata(id),
      updateSyncMetadata: (m) => this.updateSyncMetadata(m),
      recordOperation: (id, dir, status, ms, conflict, err) =>
        this.recordOperation(id, dir, status, ms, conflict, err),
      get emitter() {
        return emitter;
      },
    };
  }
}

// Singleton instance
export const linearSyncService = new LinearSyncService();
