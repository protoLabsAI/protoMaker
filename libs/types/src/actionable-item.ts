/**
 * ActionableItem Types - Unified system for all user attention items
 *
 * Consolidates notifications, HITL forms, escalations, pipeline gates,
 * and approvals into a single data model with priority, actions, and lifecycle.
 */

/**
 * ActionType - Defines the type of action required
 */
export type ActionableItemActionType =
  | 'hitl_form'
  | 'approval'
  | 'review'
  | 'notification'
  | 'gate'
  | 'escalation'
  | 'signal';

/**
 * Priority - Urgency level for the actionable item
 */
export type ActionableItemPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Status - Lifecycle state of the actionable item
 */
export type ActionableItemStatus = 'pending' | 'acted' | 'dismissed' | 'expired' | 'snoozed';

/**
 * ActionPayload - Type-specific payload for actions
 */
export interface ActionPayload {
  formId?: string;
  featureId?: string;
  gateId?: string;
  escalationId?: string;
  pipelineId?: string;
  [key: string]: unknown;
}

/**
 * ActionableItem - Unified model for all user attention items
 */
export interface ActionableItem {
  /** Unique identifier for the actionable item */
  id: string;

  /** Type of action required */
  actionType: ActionableItemActionType;

  /** Priority level */
  priority: ActionableItemPriority;

  /** Short title for display */
  title: string;

  /** Longer descriptive message */
  message: string;

  /** ISO timestamp when item was created */
  createdAt: string;

  /** Optional ISO timestamp when item expires */
  expiresAt?: string;

  /** Current lifecycle status */
  status: ActionableItemStatus;

  /** Optional ISO timestamp when item was snoozed until */
  snoozedUntil?: string;

  /** Type-specific action payload */
  actionPayload: ActionPayload;

  /** Project path this item belongs to */
  projectPath: string;

  /** Whether the item has been read/viewed */
  read: boolean;

  /** Optional category for grouping */
  category?: string;
}

/**
 * ActionableItemsFile - Structure of the actionable-items.json file
 */
export interface ActionableItemsFile {
  /** Version for future migrations */
  version: number;

  /** List of actionable items */
  items: ActionableItem[];
}

/** Current version of the actionable items file schema */
export const ACTIONABLE_ITEMS_VERSION = 1;

/** Default actionable items file structure */
export const DEFAULT_ACTIONABLE_ITEMS_FILE: ActionableItemsFile = {
  version: ACTIONABLE_ITEMS_VERSION,
  items: [],
};

/**
 * Input for creating a new actionable item
 */
export interface CreateActionableItemInput {
  actionType: ActionableItemActionType;
  priority: ActionableItemPriority;
  title: string;
  message: string;
  expiresAt?: string;
  actionPayload: ActionPayload;
  projectPath: string;
  category?: string;
}

/**
 * Priority scoring for sorting items
 */
export const PRIORITY_SCORE: Record<ActionableItemPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Calculate effective priority based on expiry time
 * Items escalate in priority as they approach expiration
 */
export function getEffectivePriority(item: ActionableItem): ActionableItemPriority {
  if (!item.expiresAt || item.status !== 'pending') {
    return item.priority;
  }

  const now = new Date().getTime();
  const expiresAt = new Date(item.expiresAt).getTime();
  const timeRemaining = expiresAt - now;

  // Already expired
  if (timeRemaining <= 0) {
    return 'urgent';
  }

  // Less than 10 minutes remaining
  if (timeRemaining < 10 * 60 * 1000) {
    return 'urgent';
  }

  // Less than 30 minutes remaining
  if (timeRemaining < 30 * 60 * 1000) {
    return item.priority === 'low' ? 'medium' : 'high';
  }

  return item.priority;
}
