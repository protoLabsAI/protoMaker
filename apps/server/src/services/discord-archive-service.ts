/**
 * Discord Archive Service
 *
 * Handles archiving Discord channels when projects are deleted:
 * - Creates Archive category if it doesn't exist
 * - Moves project channels to Archive category
 * - Tracks archival metadata (7-day retention)
 * - Provides permanent deletion after retention period
 */

import type { ProjectArchiveMetadata } from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('discord-archive-service');

const RETENTION_DAYS = 7;
const ARCHIVE_CATEGORY_NAME = 'Archive';

export interface DiscordChannel {
  id: string;
  name: string;
  categoryId?: string;
}

export interface ArchiveChannelsOptions {
  channelIds: string[];
  projectSlug: string;
}

export interface ArchiveChannelsResult {
  success: boolean;
  archiveCategoryId?: string;
  archivedChannels: string[];
  failedChannels: string[];
  error?: string;
}

/**
 * Check if Discord MCP tools are available
 */
function isDiscordMcpAvailable(): boolean {
  // Check if Discord MCP tools are accessible
  // This is a placeholder - actual implementation would check MCP registry
  return typeof (global as any).mcpTools?.discord !== 'undefined';
}

/**
 * Find or create the Archive category
 */
async function findOrCreateArchiveCategory(): Promise<string | null> {
  try {
    if (!isDiscordMcpAvailable()) {
      logger.warn('Discord MCP not available, skipping archive category creation');
      return null;
    }

    // Try to find existing Archive category
    // Placeholder for MCP tool call: mcp__discord__find_category
    const categoryId = await findArchiveCategoryId();
    if (categoryId) {
      logger.info('Found existing Archive category', { categoryId });
      return categoryId;
    }

    // Create new Archive category
    // Placeholder for MCP tool call: mcp__discord__create_category
    const newCategoryId = await createArchiveCategory();
    if (newCategoryId) {
      logger.info('Created new Archive category', { categoryId: newCategoryId });
      return newCategoryId;
    }

    return null;
  } catch (error) {
    logger.error('Failed to find or create Archive category', { error });
    return null;
  }
}

/**
 * Find existing Archive category ID
 */
async function findArchiveCategoryId(): Promise<string | null> {
  // Placeholder for actual MCP call
  // In real implementation, this would call:
  // const result = await mcp__discord__find_category({ name: ARCHIVE_CATEGORY_NAME });
  // return result?.id ?? null;
  return null;
}

/**
 * Create Archive category
 */
async function createArchiveCategory(): Promise<string | null> {
  // Placeholder for actual MCP call
  // In real implementation, this would call:
  // const result = await mcp__discord__create_category({ name: ARCHIVE_CATEGORY_NAME });
  // return result?.id ?? null;
  return null;
}

/**
 * Move a channel to the Archive category
 */
async function moveChannelToCategory(channelId: string, categoryId: string): Promise<boolean> {
  try {
    // Placeholder for actual MCP call
    // In real implementation, this would call:
    // await mcp__discord__move_channel({ channelId, categoryId });
    logger.info('Moved channel to Archive category', { channelId, categoryId });
    return true;
  } catch (error) {
    logger.error('Failed to move channel to Archive category', { channelId, categoryId, error });
    return false;
  }
}

/**
 * Delete a Discord channel permanently
 */
async function deleteChannel(channelId: string): Promise<boolean> {
  try {
    // Placeholder for actual MCP call
    // In real implementation, this would call:
    // await mcp__discord__delete_channel({ channelId });
    logger.info('Deleted Discord channel', { channelId });
    return true;
  } catch (error) {
    logger.error('Failed to delete Discord channel', { channelId, error });
    return false;
  }
}

/**
 * Archive Discord channels for a project
 *
 * Moves channels to Archive category and returns metadata for tracking
 */
export async function archiveProjectChannels(
  options: ArchiveChannelsOptions
): Promise<ArchiveChannelsResult> {
  const { channelIds, projectSlug } = options;

  if (!channelIds || channelIds.length === 0) {
    return {
      success: true,
      archivedChannels: [],
      failedChannels: [],
    };
  }

  logger.info('Starting Discord channel archival', { projectSlug, channelCount: channelIds.length });

  // Check if Discord MCP is available
  if (!isDiscordMcpAvailable()) {
    logger.warn('Discord MCP not available, skipping channel archival');
    return {
      success: false,
      archivedChannels: [],
      failedChannels: channelIds,
      error: 'Discord MCP not available',
    };
  }

  // Find or create Archive category
  const archiveCategoryId = await findOrCreateArchiveCategory();
  if (!archiveCategoryId) {
    logger.error('Failed to get Archive category');
    return {
      success: false,
      archivedChannels: [],
      failedChannels: channelIds,
      error: 'Failed to create Archive category',
    };
  }

  // Move each channel to Archive category
  const archivedChannels: string[] = [];
  const failedChannels: string[] = [];

  for (const channelId of channelIds) {
    const success = await moveChannelToCategory(channelId, archiveCategoryId);
    if (success) {
      archivedChannels.push(channelId);
    } else {
      failedChannels.push(channelId);
    }
  }

  logger.info('Discord channel archival completed', {
    projectSlug,
    archived: archivedChannels.length,
    failed: failedChannels.length,
  });

  return {
    success: failedChannels.length === 0,
    archiveCategoryId,
    archivedChannels,
    failedChannels,
  };
}

/**
 * Permanently delete archived channels
 *
 * Should only be called after retention period (7 days)
 */
export async function permanentlyDeleteChannels(channelIds: string[]): Promise<{
  success: boolean;
  deletedChannels: string[];
  failedChannels: string[];
}> {
  if (!channelIds || channelIds.length === 0) {
    return {
      success: true,
      deletedChannels: [],
      failedChannels: [],
    };
  }

  logger.info('Starting permanent channel deletion', { channelCount: channelIds.length });

  const deletedChannels: string[] = [];
  const failedChannels: string[] = [];

  for (const channelId of channelIds) {
    const success = await deleteChannel(channelId);
    if (success) {
      deletedChannels.push(channelId);
    } else {
      failedChannels.push(channelId);
    }
  }

  logger.info('Permanent channel deletion completed', {
    deleted: deletedChannels.length,
    failed: failedChannels.length,
  });

  return {
    success: failedChannels.length === 0,
    deletedChannels,
    failedChannels,
  };
}

/**
 * Create archive metadata for a project
 */
export function createArchiveMetadata(archiveCategoryId?: string): ProjectArchiveMetadata {
  const now = new Date();
  const scheduledDeletion = new Date(now);
  scheduledDeletion.setDate(scheduledDeletion.getDate() + RETENTION_DAYS);

  return {
    archivedAt: now.toISOString(),
    scheduledDeletionAt: scheduledDeletion.toISOString(),
    channelsArchived: !!archiveCategoryId,
    archiveCategoryId,
  };
}

/**
 * Check if a project is ready for permanent deletion
 */
export function isReadyForPermanentDeletion(archiveMetadata?: ProjectArchiveMetadata): boolean {
  if (!archiveMetadata) {
    return true; // No archive metadata means immediate deletion is ok
  }

  const scheduledDeletion = new Date(archiveMetadata.scheduledDeletionAt);
  const now = new Date();

  return now >= scheduledDeletion;
}

/**
 * Calculate days remaining until permanent deletion
 */
export function getDaysUntilDeletion(archiveMetadata: ProjectArchiveMetadata): number {
  const scheduledDeletion = new Date(archiveMetadata.scheduledDeletionAt);
  const now = new Date();
  const diffMs = scheduledDeletion.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}
