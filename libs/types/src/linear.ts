/**
 * Linear Sync Types - Bidirectional sync metadata and payloads
 *
 * Types for syncing features between AutoMaker and Linear.
 * Supports conflict detection, sync direction tracking, and state snapshots.
 */

/**
 * LinearSyncMetadata - Sync state tracking for a feature
 *
 * Attached to Feature.linearSyncMetadata to track sync history,
 * detect conflicts, and maintain state snapshots.
 */
export interface LinearSyncMetadata {
  /** ISO 8601 timestamp of last successful sync */
  lastSyncedAt: string;
  /** Source of the last sync: 'linear' (from Linear to AutoMaker) or 'automaker' (from AutoMaker to Linear) */
  syncSource: 'linear' | 'automaker';
  /** Direction of the last sync: 'inbound' (Linear → AutoMaker), 'outbound' (AutoMaker → Linear) */
  syncDirection: 'inbound' | 'outbound';
  /** Whether a conflict was detected during the last sync */
  conflictDetected: boolean;
  /** Snapshot of the last known Linear issue state (for conflict detection) */
  lastLinearState?: LinearIssueSnapshot;
  /** Snapshot of the last known AutoMaker feature state (for conflict detection) */
  lastAutomakerState?: FeatureSnapshot;
}

/**
 * LinearIssueSnapshot - Snapshot of a Linear issue's state
 *
 * Used for conflict detection by comparing the current Linear state
 * with the last known state.
 */
export interface LinearIssueSnapshot {
  /** Linear issue ID */
  id: string;
  /** Issue title */
  title: string;
  /** Issue description (markdown) */
  description: string;
  /** Linear status (state name) */
  status: string;
  /** Priority (0=none, 1=urgent, 2=high, 3=normal, 4=low) */
  priority?: number;
  /** Assignee ID */
  assigneeId?: string;
  /** ISO 8601 timestamp of last Linear update */
  updatedAt: string;
}

/**
 * FeatureSnapshot - Snapshot of an AutoMaker feature's state
 *
 * Used for conflict detection by comparing the current AutoMaker state
 * with the last known state.
 */
export interface FeatureSnapshot {
  /** Feature ID */
  id: string;
  /** Feature title */
  title?: string;
  /** Feature description */
  description: string;
  /** Feature status */
  status?: string;
  /** Complexity level */
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  /** Assignee name */
  assignee?: string | null;
  /** ISO 8601 timestamp of last AutoMaker update */
  updatedAt?: string;
}

/**
 * LinearIssuePayload - Payload for linear:issue:updated event
 *
 * Fired when a Linear issue is updated via webhook or polling.
 * Contains the issue data needed to update the corresponding feature.
 */
export interface LinearIssuePayload {
  /** Linear issue ID */
  issueId: string;
  /** Issue title */
  title: string;
  /** Issue description (markdown) */
  description: string;
  /** Linear status (state name) */
  status: string;
  /** Priority (0=none, 1=urgent, 2=high, 3=normal, 4=low) */
  priority?: number;
  /** Assignee ID */
  assigneeId?: string;
  /** Assignee display name */
  assigneeName?: string;
  /** Project ID */
  projectId?: string;
  /** Team ID */
  teamId: string;
  /** ISO 8601 timestamp of the update */
  updatedAt: string;
  /** URL to the issue in Linear */
  url: string;
}

/**
 * LinearProjectPayload - Payload for linear:project:updated event
 *
 * Fired when a Linear project is updated via webhook or polling.
 * Contains project metadata for sync operations.
 */
export interface LinearProjectPayload {
  /** Linear project ID */
  projectId: string;
  /** Project name */
  name: string;
  /** Project description (markdown) */
  description?: string;
  /** Project status */
  status: string;
  /** Team ID that owns the project */
  teamId: string;
  /** ISO 8601 timestamp of the update */
  updatedAt: string;
  /** URL to the project in Linear */
  url: string;
}

/**
 * LinearSyncStartedPayload - Payload for linear:sync:started event
 *
 * Fired when a sync operation begins.
 */
export interface LinearSyncStartedPayload {
  /** Feature ID being synced */
  featureId: string;
  /** Direction of sync: 'inbound' (Linear → AutoMaker) or 'outbound' (AutoMaker → Linear) */
  direction: 'inbound' | 'outbound';
  /** ISO 8601 timestamp when sync started */
  timestamp: string;
}

/**
 * LinearSyncCompletedPayload - Payload for linear:sync:completed event
 *
 * Fired when a sync operation completes successfully.
 */
export interface LinearSyncCompletedPayload {
  /** Feature ID that was synced */
  featureId: string;
  /** Direction of sync: 'inbound' (Linear → AutoMaker) or 'outbound' (AutoMaker → Linear) */
  direction: 'inbound' | 'outbound';
  /** Whether any conflicts were detected */
  conflictDetected: boolean;
  /** ISO 8601 timestamp when sync completed */
  timestamp: string;
}

/**
 * LinearSyncErrorPayload - Payload for linear:sync:error event
 *
 * Fired when a sync operation fails.
 */
export interface LinearSyncErrorPayload {
  /** Feature ID that failed to sync */
  featureId: string;
  /** Direction of sync: 'inbound' (Linear → AutoMaker) or 'outbound' (AutoMaker → Linear) */
  direction: 'inbound' | 'outbound';
  /** Error message describing the failure */
  error: string;
  /** ISO 8601 timestamp when the error occurred */
  timestamp: string;
}
