/**
 * Shared types and constants for the Linear sync subsystem.
 *
 * All sub-services (LinearIssueSync, LinearProjectSync, LinearWebhookHandler,
 * LinearCommentService) and the orchestrator (LinearSyncService) import from
 * this single source of truth.
 */

import type { Feature } from '@protolabs-ai/types';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ProjectService } from './project-service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Debounce time window in milliseconds (5 seconds) */
export const DEBOUNCE_WINDOW_MS = 5000;

/** Conflict detection window in milliseconds (10 seconds) */
export const CONFLICT_DETECTION_WINDOW_MS = 10000;

// ---------------------------------------------------------------------------
// Metrics & Activity
// ---------------------------------------------------------------------------

/** Aggregated sync metrics */
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

/** A single sync activity entry for the activity log */
export interface SyncActivity {
  timestamp: string;
  featureId: string;
  direction: 'push' | 'pull';
  status: 'success' | 'error';
  durationMs: number;
  conflictDetected: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Sync State
// ---------------------------------------------------------------------------

/** Metadata stored for each synced feature */
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

// ---------------------------------------------------------------------------
// Event Payloads
// ---------------------------------------------------------------------------

/** Feature event payload structure */
export interface FeatureEventPayload {
  featureId: string;
  featureName?: string;
  projectPath: string;
  status?: string;
  prUrl?: string;
  prNumber?: number;
  mergeCommitSha?: string;
  mergedBy?: string;
  error?: string;
  /** Full feature object snapshot (required for feature:deleted, pre-deletion) */
  feature?: Feature;
}

/** Project scaffolded event payload structure */
export interface ProjectScaffoldedPayload {
  projectPath: string;
  projectSlug: string;
  projectTitle: string;
  milestoneCount: number;
  featuresCreated: number;
}

/** Project status changed event payload structure */
export interface ProjectStatusChangedPayload {
  projectPath: string;
  projectSlug: string;
  status: string;
  previousStatus?: string;
}

/** Comment created event payload structure */
export interface CommentCreatedPayload {
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

// ---------------------------------------------------------------------------
// Shared guard / callback interface injected into sub-services
// ---------------------------------------------------------------------------

/** Callbacks from the orchestrator that sub-services need during sync */
export interface SyncGuards {
  shouldSync(featureId: string): boolean;
  markSyncing(featureId: string): void;
  unmarkSyncing(featureId: string): void;
  isProjectSyncEnabled(projectPath: string): Promise<boolean>;
  getSyncMetadata(featureId: string): SyncMetadata | undefined;
  updateSyncMetadata(metadata: SyncMetadata): void;
  recordOperation(
    featureId: string,
    direction: 'push' | 'pull',
    status: 'success' | 'error',
    durationMs: number,
    conflictDetected: boolean,
    error?: string
  ): void;
  addCommentToIssue(projectPath: string, issueId: string, body: string): Promise<void>;
  emitter: EventEmitter | null;
}

// ---------------------------------------------------------------------------
// Shared service dependencies injected into sub-services
// ---------------------------------------------------------------------------

/** External service references shared across all sub-services */
export interface SyncDependencies {
  settingsService: SettingsService;
  featureLoader: FeatureLoader;
  projectService?: ProjectService;
}
