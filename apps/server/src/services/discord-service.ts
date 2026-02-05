/**
 * Discord Service - Wraps Discord MCP tools with caching
 *
 * Provides a service layer for Discord operations via MCP tools.
 * Includes metadata caching (5min TTL) and graceful fallback when Discord MCP is unavailable.
 *
 * Note: This service doesn't directly call MCP tools. Instead, it provides
 * structured data and helper methods. The actual MCP tools are called by
 * Claude Agent SDK when agents use the Discord MCP server.
 *
 * This service can be extended to cache MCP responses when integrating
 * with a programmatic MCP client in the future.
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('DiscordService');

// Cache TTL: 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Discord channel types matching Discord API
 */
export type DiscordChannelType = 'GUILD_TEXT' | 'GUILD_VOICE' | 'GUILD_CATEGORY' | 'UNKNOWN';

/**
 * Information about a Discord channel
 */
export interface DiscordChannel {
  id: string;
  name: string;
  type: DiscordChannelType;
  categoryId?: string;
  categoryName?: string;
  position?: number;
}

/**
 * Information about a Discord guild (server)
 */
export interface DiscordGuildInfo {
  id: string;
  name: string;
  memberCount?: number;
  channelCount?: number;
  categoryCount?: number;
  textChannelCount?: number;
  voiceChannelCount?: number;
}

/**
 * Cached data structure
 */
interface CachedData<T> {
  data: T;
  timestamp: number;
}

/**
 * Result of a Discord service operation
 */
export interface DiscordServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  fromCache?: boolean;
}

/**
 * Discord Service - Provides Discord operations with caching
 *
 * This service acts as a data layer and helper for Discord operations.
 * Actual Discord MCP tool calls happen through Claude Agent SDK.
 *
 * Future enhancement: Integrate with MCP Client to call tools programmatically
 * and populate cache from real responses.
 */
export class DiscordService {
  private guildInfoCache: CachedData<DiscordGuildInfo> | null = null;
  private channelsCache: CachedData<DiscordChannel[]> | null = null;
  private available: boolean | null = null;
  private lastAvailabilityCheck = 0;
  private readonly AVAILABILITY_CACHE_MS = 60000; // 1 minute

  /**
   * Check if cached data is still valid (within TTL)
   */
  private isCacheValid<T>(cache: CachedData<T> | null): boolean {
    if (!cache) return false;
    const now = Date.now();
    return now - cache.timestamp < CACHE_TTL_MS;
  }

  /**
   * Create cached data structure
   */
  private createCache<T>(data: T): CachedData<T> {
    return {
      data,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if Discord MCP is available
   *
   * This is a placeholder that always returns a cached availability status.
   * In the future, this could check for Discord MCP server in MCP settings.
   *
   * @returns Promise resolving to availability status
   */
  async isAvailable(): Promise<boolean> {
    const now = Date.now();

    // Return cached result if recent
    if (this.available !== null && now - this.lastAvailabilityCheck < this.AVAILABILITY_CACHE_MS) {
      return this.available;
    }

    // For now, assume Discord MCP might be available
    // In the future, check MCP server settings or attempt a test call
    this.available = true;
    this.lastAvailabilityCheck = now;

    logger.debug('Discord MCP availability check (placeholder)', { available: this.available });
    return this.available;
  }

  /**
   * Get guild (server) information
   *
   * Returns cached data if available and valid, otherwise indicates
   * that fresh data should be fetched via MCP tools.
   *
   * @returns Promise resolving to guild info result
   */
  async getGuildInfo(): Promise<DiscordServiceResult<DiscordGuildInfo>> {
    try {
      // Check if Discord MCP is available
      const available = await this.isAvailable();
      if (!available) {
        return {
          success: false,
          error: 'Discord MCP is not available. Please configure Discord MCP server in settings.',
        };
      }

      // Return cached data if valid
      if (this.isCacheValid(this.guildInfoCache)) {
        logger.debug('Returning cached guild info');
        return {
          success: true,
          data: this.guildInfoCache!.data,
          fromCache: true,
        };
      }

      // Indicate that fresh data should be fetched
      // The actual MCP call would happen in the agent via Claude Agent SDK
      logger.debug('Guild info cache miss - fresh data needed');
      return {
        success: false,
        error:
          'Guild info not in cache. Use mcp__discord__get_server_info to fetch from Discord.',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get guild info:', errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Update cached guild info
   *
   * Call this after fetching guild info via MCP tools to update the cache.
   *
   * @param guildInfo - Guild information to cache
   */
  updateGuildInfoCache(guildInfo: DiscordGuildInfo): void {
    this.guildInfoCache = this.createCache(guildInfo);
    logger.debug('Updated guild info cache', { guildId: guildInfo.id });
  }

  /**
   * List all channels in the guild
   *
   * Returns cached data if available and valid, otherwise indicates
   * that fresh data should be fetched via MCP tools.
   *
   * @returns Promise resolving to channels list result
   */
  async listChannels(): Promise<DiscordServiceResult<DiscordChannel[]>> {
    try {
      // Check if Discord MCP is available
      const available = await this.isAvailable();
      if (!available) {
        return {
          success: false,
          error: 'Discord MCP is not available. Please configure Discord MCP server in settings.',
        };
      }

      // Return cached data if valid
      if (this.isCacheValid(this.channelsCache)) {
        logger.debug('Returning cached channels list', { count: this.channelsCache!.data.length });
        return {
          success: true,
          data: this.channelsCache!.data,
          fromCache: true,
        };
      }

      // Indicate that fresh data should be fetched
      logger.debug('Channels cache miss - fresh data needed');
      return {
        success: false,
        error: 'Channels not in cache. Use mcp__discord__list_channels to fetch from Discord.',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to list channels:', errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Update cached channels list
   *
   * Call this after fetching channels via MCP tools to update the cache.
   *
   * @param channels - Channels list to cache
   */
  updateChannelsCache(channels: DiscordChannel[]): void {
    this.channelsCache = this.createCache(channels);
    logger.debug('Updated channels cache', { count: channels.length });
  }

  /**
   * Find a channel by name or ID
   *
   * Searches in cache first. If not found or cache is stale,
   * indicates that fresh data should be fetched via MCP tools.
   *
   * @param nameOrId - Channel name (with or without #) or channel ID
   * @returns Promise resolving to channel find result
   */
  async findChannel(nameOrId: string): Promise<DiscordServiceResult<DiscordChannel>> {
    try {
      // Check if Discord MCP is available
      const available = await this.isAvailable();
      if (!available) {
        return {
          success: false,
          error: 'Discord MCP is not available. Please configure Discord MCP server in settings.',
        };
      }

      // Normalize channel name (remove # if present)
      const searchName = nameOrId.startsWith('#') ? nameOrId.slice(1) : nameOrId;

      // Search in cache if valid
      if (this.isCacheValid(this.channelsCache)) {
        const channel = this.channelsCache!.data.find(
          (ch) => ch.id === searchName || ch.name.toLowerCase() === searchName.toLowerCase()
        );

        if (channel) {
          logger.debug('Found channel in cache', { channelId: channel.id, name: channel.name });
          return {
            success: true,
            data: channel,
            fromCache: true,
          };
        }

        // Not found in cache
        logger.debug('Channel not found in cache', { searchName });
        return {
          success: false,
          error: `Channel "${searchName}" not found in cache. Use mcp__discord__find_channel to search Discord.`,
        };
      }

      // Cache is stale or empty
      logger.debug('Channels cache invalid - fresh data needed');
      return {
        success: false,
        error: 'Channels cache is empty or stale. Use mcp__discord__list_channels first.',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to find channel:', errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Clear all cached data
   *
   * Use this to force fresh data fetches on the next operation.
   */
  clearCache(): void {
    this.guildInfoCache = null;
    this.channelsCache = null;
    logger.debug('Cleared all Discord service caches');
  }

  /**
   * Get cache statistics
   *
   * @returns Cache status information
   */
  getCacheStats(): {
    guildInfoCached: boolean;
    guildInfoAge?: number;
    channelsCached: boolean;
    channelsAge?: number;
    channelsCount?: number;
  } {
    const now = Date.now();
    return {
      guildInfoCached: this.isCacheValid(this.guildInfoCache),
      guildInfoAge: this.guildInfoCache ? now - this.guildInfoCache.timestamp : undefined,
      channelsCached: this.isCacheValid(this.channelsCache),
      channelsAge: this.channelsCache ? now - this.channelsCache.timestamp : undefined,
      channelsCount: this.channelsCache?.data.length,
    };
  }
}

// Export singleton instance
export const discordService = new DiscordService();
