/**
 * ActionableItem Service - Manages unified actionable items system
 *
 * Provides persistent storage for actionable items in
 * {projectPath}/.automaker/actionable-items.json
 *
 * Consolidates all user attention mechanisms:
 * - HITL forms
 * - Approvals
 * - Notifications
 * - Escalations
 * - Pipeline gates
 */

import { createLogger } from '@protolabs-ai/utils';
import * as secureFs from '../lib/secure-fs.js';
import { ensureAutomakerDir } from '@protolabs-ai/platform';
import type {
  ActionableItem,
  ActionableItemsFile,
  CreateActionableItemInput,
  ActionableItemStatus,
} from '@protolabs-ai/types';
import { DEFAULT_ACTIONABLE_ITEMS_FILE, getEffectivePriority } from '@protolabs-ai/types';
import type { EventEmitter } from '../lib/events.js';
import { randomUUID } from 'crypto';
import { join } from 'path';

const logger = createLogger('ActionableItemService');

/**
 * Get the path to the actionable items file for a project
 */
function getActionableItemsPath(projectPath: string): string {
  return join(projectPath, '.automaker', 'actionable-items.json');
}

/**
 * Atomic file write - write to temp file then rename
 */
async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  const content = JSON.stringify(data, null, 2);

  try {
    await secureFs.writeFile(tempPath, content, 'utf-8');
    await secureFs.rename(tempPath, filePath);
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
 * Safely read JSON file with fallback to default
 */
async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = (await secureFs.readFile(filePath, 'utf-8')) as string;
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultValue;
    }
    if (error instanceof SyntaxError) {
      logger.error(`Invalid JSON in ${filePath}, backing up and using default:`, error);
      try {
        await secureFs.rename(filePath, `${filePath}.corrupted.${Date.now()}`);
      } catch {
        // Ignore backup errors
      }
      return defaultValue;
    }
    logger.error(`Error reading ${filePath}:`, error);
    return defaultValue;
  }
}

/**
 * ActionableItemService - Manages unified actionable items
 *
 * Handles reading and writing actionable items to JSON files with atomic operations
 * for reliability. Each project has its own actionable-items.json file.
 */
export class ActionableItemService {
  private events: EventEmitter | null = null;

  /**
   * Set the event emitter for broadcasting actionable item events
   */
  setEventEmitter(events: EventEmitter): void {
    this.events = events;
  }

  /**
   * Get all actionable items for a project
   *
   * @param projectPath - Absolute path to project directory
   * @param includeActed - Whether to include acted items (default: false)
   * @param includeDismissed - Whether to include dismissed items (default: false)
   * @param includeExpired - Whether to include expired items (default: false)
   * @returns Promise resolving to array of actionable items
   */
  async getActionableItems(
    projectPath: string,
    options: {
      includeActed?: boolean;
      includeDismissed?: boolean;
      includeExpired?: boolean;
    } = {}
  ): Promise<ActionableItem[]> {
    const { includeActed = false, includeDismissed = false, includeExpired = false } = options;

    const itemsPath = getActionableItemsPath(projectPath);
    const file = await readJsonFile<ActionableItemsFile>(itemsPath, DEFAULT_ACTIONABLE_ITEMS_FILE);

    // Check for expired items and update them
    const now = new Date().getTime();
    let hasExpiredItems = false;

    for (const item of file.items) {
      if (item.status === 'pending' && item.expiresAt && new Date(item.expiresAt).getTime() < now) {
        item.status = 'expired';
        hasExpiredItems = true;
      }

      // Check for snoozed items that should be un-snoozed
      if (
        item.status === 'snoozed' &&
        item.snoozedUntil &&
        new Date(item.snoozedUntil).getTime() < now
      ) {
        item.status = 'pending';
        item.snoozedUntil = undefined;
        hasExpiredItems = true; // Reuse flag for any status changes
      }
    }

    // Write back if any items expired or un-snoozed
    if (hasExpiredItems) {
      await atomicWriteJson(itemsPath, file);
    }

    // Filter based on options
    let items = file.items;

    if (!includeActed) {
      items = items.filter((item) => item.status !== 'acted');
    }

    if (!includeDismissed) {
      items = items.filter((item) => item.status !== 'dismissed');
    }

    if (!includeExpired) {
      items = items.filter((item) => item.status !== 'expired');
    }

    // Sort by effective priority (high to low), then by creation date (newest first)
    return items.sort((a, b) => {
      const priorityA = getEffectivePriority(a);
      const priorityB = getEffectivePriority(b);

      const priorityScore: Record<string, number> = {
        urgent: 4,
        high: 3,
        medium: 2,
        low: 1,
      };

      const scoreA = priorityScore[priorityA] || 0;
      const scoreB = priorityScore[priorityB] || 0;

      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Higher priority first
      }

      // Same priority, sort by date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /**
   * Get count of pending actionable items for a project
   *
   * @param projectPath - Absolute path to project directory
   * @returns Promise resolving to pending count
   */
  async getPendingCount(projectPath: string): Promise<number> {
    const items = await this.getActionableItems(projectPath);
    return items.filter((item) => item.status === 'pending' || item.status === 'snoozed').length;
  }

  /**
   * Get count of unread actionable items for a project
   *
   * @param projectPath - Absolute path to project directory
   * @returns Promise resolving to unread count
   */
  async getUnreadCount(projectPath: string): Promise<number> {
    const items = await this.getActionableItems(projectPath);
    return items.filter((item) => !item.read && item.status === 'pending').length;
  }

  /**
   * Create a new actionable item
   *
   * @param input - Actionable item creation input
   * @returns Promise resolving to the created actionable item
   */
  async createActionableItem(input: CreateActionableItemInput): Promise<ActionableItem> {
    const {
      projectPath,
      actionType,
      priority,
      title,
      message,
      expiresAt,
      actionPayload,
      category,
    } = input;

    // Ensure automaker directory exists
    await ensureAutomakerDir(projectPath);

    const itemsPath = getActionableItemsPath(projectPath);
    const file = await readJsonFile<ActionableItemsFile>(itemsPath, DEFAULT_ACTIONABLE_ITEMS_FILE);

    const item: ActionableItem = {
      id: randomUUID(),
      actionType,
      priority,
      title,
      message,
      createdAt: new Date().toISOString(),
      expiresAt,
      status: 'pending',
      actionPayload,
      projectPath,
      read: false,
      category,
    };

    file.items.push(item);
    await atomicWriteJson(itemsPath, file);

    logger.info(`Created actionable item: ${title} (${actionType}) for project ${projectPath}`);

    // Emit event for real-time updates
    if (this.events) {
      this.events.emit('actionable-item:created', item);
    }

    return item;
  }

  /**
   * Update actionable item status
   *
   * @param projectPath - Absolute path to project directory
   * @param itemId - ID of the item to update
   * @param status - New status
   * @returns Promise resolving to the updated item or null if not found
   */
  async updateStatus(
    projectPath: string,
    itemId: string,
    status: ActionableItemStatus
  ): Promise<ActionableItem | null> {
    const itemsPath = getActionableItemsPath(projectPath);
    const file = await readJsonFile<ActionableItemsFile>(itemsPath, DEFAULT_ACTIONABLE_ITEMS_FILE);

    const item = file.items.find((i) => i.id === itemId);
    if (!item) {
      return null;
    }

    item.status = status;

    // Clear snooze when changing from snoozed status
    if (status !== 'snoozed') {
      item.snoozedUntil = undefined;
    }

    await atomicWriteJson(itemsPath, file);

    logger.info(`Updated item ${itemId} status to ${status}`);

    // Emit event for real-time updates
    if (this.events) {
      this.events.emit('actionable-item:status-changed', { itemId, status, item });
    }

    return item;
  }

  /**
   * Mark an actionable item as read
   *
   * @param projectPath - Absolute path to project directory
   * @param itemId - ID of the item to mark as read
   * @returns Promise resolving to the updated item or null if not found
   */
  async markAsRead(projectPath: string, itemId: string): Promise<ActionableItem | null> {
    const itemsPath = getActionableItemsPath(projectPath);
    const file = await readJsonFile<ActionableItemsFile>(itemsPath, DEFAULT_ACTIONABLE_ITEMS_FILE);

    const item = file.items.find((i) => i.id === itemId);
    if (!item) {
      return null;
    }

    item.read = true;
    await atomicWriteJson(itemsPath, file);

    logger.info(`Marked item ${itemId} as read`);
    return item;
  }

  /**
   * Mark all actionable items as read for a project
   *
   * @param projectPath - Absolute path to project directory
   * @returns Promise resolving to number of items marked as read
   */
  async markAllAsRead(projectPath: string): Promise<number> {
    const itemsPath = getActionableItemsPath(projectPath);
    const file = await readJsonFile<ActionableItemsFile>(itemsPath, DEFAULT_ACTIONABLE_ITEMS_FILE);

    let count = 0;
    for (const item of file.items) {
      if (!item.read && item.status === 'pending') {
        item.read = true;
        count++;
      }
    }

    if (count > 0) {
      await atomicWriteJson(itemsPath, file);
      logger.info(`Marked ${count} items as read`);
    }

    return count;
  }

  /**
   * Snooze an actionable item until a specific time
   *
   * @param projectPath - Absolute path to project directory
   * @param itemId - ID of the item to snooze
   * @param snoozedUntil - ISO timestamp when item should re-surface
   * @returns Promise resolving to the updated item or null if not found
   */
  async snoozeItem(
    projectPath: string,
    itemId: string,
    snoozedUntil: string
  ): Promise<ActionableItem | null> {
    const itemsPath = getActionableItemsPath(projectPath);
    const file = await readJsonFile<ActionableItemsFile>(itemsPath, DEFAULT_ACTIONABLE_ITEMS_FILE);

    const item = file.items.find((i) => i.id === itemId);
    if (!item) {
      return null;
    }

    item.status = 'snoozed';
    item.snoozedUntil = snoozedUntil;
    await atomicWriteJson(itemsPath, file);

    logger.info(`Snoozed item ${itemId} until ${snoozedUntil}`);

    // Emit event for real-time updates
    if (this.events) {
      this.events.emit('actionable-item:snoozed', { itemId, snoozedUntil, item });
    }

    return item;
  }

  /**
   * Dismiss an actionable item
   *
   * @param projectPath - Absolute path to project directory
   * @param itemId - ID of the item to dismiss
   * @returns Promise resolving to true if item was dismissed
   */
  async dismissItem(projectPath: string, itemId: string): Promise<boolean> {
    const item = await this.updateStatus(projectPath, itemId, 'dismissed');
    return item !== null;
  }

  /**
   * Dismiss all actionable items for a project
   *
   * @param projectPath - Absolute path to project directory
   * @returns Promise resolving to number of items dismissed
   */
  async dismissAll(projectPath: string): Promise<number> {
    const itemsPath = getActionableItemsPath(projectPath);
    const file = await readJsonFile<ActionableItemsFile>(itemsPath, DEFAULT_ACTIONABLE_ITEMS_FILE);

    let count = 0;
    for (const item of file.items) {
      if (item.status === 'pending' || item.status === 'snoozed') {
        item.status = 'dismissed';
        count++;
      }
    }

    if (count > 0) {
      await atomicWriteJson(itemsPath, file);
      logger.info(`Dismissed ${count} items`);
    }

    return count;
  }

  /**
   * Get actionable item by ID
   *
   * @param projectPath - Absolute path to project directory
   * @param itemId - ID of the item to retrieve
   * @returns Promise resolving to the item or null if not found
   */
  async getItemById(projectPath: string, itemId: string): Promise<ActionableItem | null> {
    const itemsPath = getActionableItemsPath(projectPath);
    const file = await readJsonFile<ActionableItemsFile>(itemsPath, DEFAULT_ACTIONABLE_ITEMS_FILE);

    return file.items.find((item) => item.id === itemId) || null;
  }
}

// Singleton instance
let actionableItemServiceInstance: ActionableItemService | null = null;

/**
 * Get the singleton actionable item service instance
 */
export function getActionableItemService(): ActionableItemService {
  if (!actionableItemServiceInstance) {
    actionableItemServiceInstance = new ActionableItemService();
  }
  return actionableItemServiceInstance;
}
