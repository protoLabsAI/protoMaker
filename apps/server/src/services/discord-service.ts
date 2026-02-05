/**
 * Discord Service - Channel management wrapper for Discord MCP
 *
 * Provides convenient methods for managing Discord channels, categories,
 * and archival workflows. Wraps the Discord MCP server tools.
 *
 * Key features:
 * - Create categories and text channels
 * - Archive channels to a dedicated Archive category
 * - Delete channels with confirmation
 * - Return channel IDs for storage in settings
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createLogger } from '@automaker/utils';
import type { MCPServerConfig } from '@automaker/types';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('DiscordService');
const DEFAULT_TIMEOUT = 30000; // 30 seconds for Discord operations
const ARCHIVE_CATEGORY_NAME = 'Archive';

/**
 * Result from creating a category
 */
export interface CreateCategoryResult {
  categoryId: string;
  categoryName: string;
}

/**
 * Result from creating a text channel
 */
export interface CreateTextChannelResult {
  channelId: string;
  channelName: string;
  categoryId?: string;
}

/**
 * Result from archiving a channel
 */
export interface ArchiveChannelResult {
  channelId: string;
  archiveCategoryId: string;
  success: boolean;
}

/**
 * Result from deleting a channel
 */
export interface DeleteChannelResult {
  channelId: string;
  success: boolean;
}

/**
 * Discord Service for channel management
 *
 * Provides high-level methods for Discord channel operations by wrapping
 * the Discord MCP server tools. Handles connection management and error handling.
 */
export class DiscordService {
  private settingsService: SettingsService;
  private client: Client | null = null;
  private transport:
    | StdioClientTransport
    | SSEClientTransport
    | StreamableHTTPClientTransport
    | null = null;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  /**
   * Get Discord MCP server configuration from settings
   */
  private async getDiscordConfig(): Promise<MCPServerConfig | null> {
    try {
      const globalSettings = await this.settingsService.getGlobalSettings();
      const discordServer = globalSettings.mcpServers?.find(
        (s) => s.name.toLowerCase().includes('discord') || s.id.includes('discord')
      );

      if (!discordServer) {
        logger.warn('Discord MCP server not found in settings');
        return null;
      }

      return discordServer;
    } catch (error) {
      logger.error('Error getting Discord config:', error);
      return null;
    }
  }

  /**
   * Create MCP client transport based on server configuration
   */
  private async createTransport(
    config: MCPServerConfig
  ): Promise<StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport> {
    if (config.type === 'sse') {
      if (!config.url) {
        throw new Error('URL is required for SSE transport');
      }
      const headers = config.headers;
      return new SSEClientTransport(new URL(config.url), {
        requestInit: headers ? { headers } : undefined,
        eventSourceInit: headers
          ? {
              fetch: (url: string | URL | Request, init?: RequestInit) => {
                const fetchHeaders = new Headers(init?.headers || {});
                for (const [key, value] of Object.entries(headers)) {
                  fetchHeaders.set(key, value);
                }
                return fetch(url, { ...init, headers: fetchHeaders });
              },
            }
          : undefined,
      });
    }

    if (config.type === 'http') {
      if (!config.url) {
        throw new Error('URL is required for HTTP transport');
      }
      return new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: config.headers
          ? {
              headers: config.headers,
            }
          : undefined,
      });
    }

    // Default to stdio
    if (!config.command) {
      throw new Error('Command is required for stdio transport');
    }

    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });
  }

  /**
   * Connect to Discord MCP server
   */
  private async connect(): Promise<void> {
    if (this.client) {
      return; // Already connected
    }

    const config = await this.getDiscordConfig();
    if (!config) {
      throw new Error('Discord MCP server not configured');
    }

    this.client = new Client({
      name: 'automaker-discord-service',
      version: '1.0.0',
    });

    this.transport = await this.createTransport(config);

    await Promise.race([
      this.client.connect(this.transport),
      this.timeout(DEFAULT_TIMEOUT, 'Connection to Discord MCP timed out'),
    ]);

    logger.info('Connected to Discord MCP server');
  }

  /**
   * Disconnect from Discord MCP server
   */
  private async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        logger.error('Error closing Discord MCP client:', error);
      }
      this.client = null;
      this.transport = null;
    }
  }

  /**
   * Call a Discord MCP tool
   */
  private async callTool<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
    await this.connect();

    if (!this.client) {
      throw new Error('Failed to connect to Discord MCP');
    }

    try {
      const result = await Promise.race([
        this.client.callTool({ name: toolName, arguments: args }),
        this.timeout(DEFAULT_TIMEOUT, `Discord MCP tool ${toolName} timed out`),
      ]);

      // Type guard: ensure result has expected structure
      if (!result || typeof result !== 'object' || !('content' in result)) {
        throw new Error(`Invalid response from Discord MCP tool ${toolName}`);
      }

      const content = result.content;
      if (!Array.isArray(content) || content.length === 0) {
        throw new Error(`No response from Discord MCP tool ${toolName}`);
      }

      const firstContent = content[0];
      if (firstContent && typeof firstContent === 'object' && 'type' in firstContent && firstContent.type === 'text' && 'text' in firstContent) {
        // Try to parse as JSON
        try {
          return JSON.parse(firstContent.text as string) as T;
        } catch {
          // If not JSON, return as is
          return firstContent.text as T;
        }
      }

      throw new Error(`Unexpected content type from Discord MCP: ${firstContent && typeof firstContent === 'object' && 'type' in firstContent ? firstContent.type : 'unknown'}`);
    } catch (error) {
      logger.error(`Error calling Discord MCP tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Create a timeout promise
   */
  private timeout<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Create a category
   *
   * @param name - Category name
   * @returns Promise resolving to category ID and name
   */
  async createCategory(name: string): Promise<CreateCategoryResult> {
    logger.info(`Creating category: ${name}`);

    try {
      const result = await this.callTool<{ id: string; name: string }>('mcp__discord__create_category', {
        name,
      });

      logger.info(`Created category: ${name} (ID: ${result.id})`);

      return {
        categoryId: result.id,
        categoryName: result.name,
      };
    } catch (error) {
      logger.error(`Failed to create category ${name}:`, error);
      throw new Error(`Failed to create category: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a text channel
   *
   * @param name - Channel name
   * @param categoryId - Optional category ID to place the channel in
   * @returns Promise resolving to channel ID, name, and category ID
   */
  async createTextChannel(name: string, categoryId?: string): Promise<CreateTextChannelResult> {
    logger.info(`Creating text channel: ${name}${categoryId ? ` in category ${categoryId}` : ''}`);

    try {
      const args: Record<string, unknown> = { name };
      if (categoryId) {
        args.categoryId = categoryId;
      }

      const result = await this.callTool<{ id: string; name: string; categoryId?: string }>(
        'mcp__discord__create_text_channel',
        args
      );

      logger.info(`Created text channel: ${name} (ID: ${result.id})`);

      return {
        channelId: result.id,
        channelName: result.name,
        categoryId: result.categoryId,
      };
    } catch (error) {
      logger.error(`Failed to create text channel ${name}:`, error);
      throw new Error(`Failed to create text channel: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Find or create the Archive category
   *
   * @returns Promise resolving to archive category ID
   */
  private async ensureArchiveCategory(): Promise<string> {
    try {
      // Try to find existing Archive category
      const result = await this.callTool<{ id: string } | null>('mcp__discord__find_category', {
        categoryName: ARCHIVE_CATEGORY_NAME,
      });

      if (result && result.id) {
        logger.info(`Found existing Archive category (ID: ${result.id})`);
        return result.id;
      }

      // Create Archive category if it doesn't exist
      logger.info('Archive category not found, creating it');
      const createResult = await this.createCategory(ARCHIVE_CATEGORY_NAME);
      return createResult.categoryId;
    } catch (error) {
      logger.error('Failed to ensure Archive category:', error);
      throw new Error(`Failed to ensure Archive category: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Archive a channel by moving it to the Archive category
   *
   * @param channelId - ID of the channel to archive
   * @returns Promise resolving to archive result
   */
  async archiveChannel(channelId: string): Promise<ArchiveChannelResult> {
    logger.info(`Archiving channel: ${channelId}`);

    try {
      // Ensure Archive category exists
      const archiveCategoryId = await this.ensureArchiveCategory();

      // Move channel to Archive category
      // Note: Discord MCP may not have a direct "move channel" API
      // This implementation assumes we can update the channel's parent category
      await this.callTool<{ success: boolean }>('mcp__discord__update_channel', {
        channelId,
        categoryId: archiveCategoryId,
      });

      logger.info(`Archived channel ${channelId} to Archive category`);

      return {
        channelId,
        archiveCategoryId,
        success: true,
      };
    } catch (error) {
      logger.error(`Failed to archive channel ${channelId}:`, error);
      throw new Error(`Failed to archive channel: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a channel with confirmation
   *
   * @param channelId - ID of the channel to delete
   * @param confirmed - Whether deletion is confirmed (default: false)
   * @returns Promise resolving to deletion result
   * @throws Error if confirmation is not provided
   */
  async deleteChannel(channelId: string, confirmed: boolean = false): Promise<DeleteChannelResult> {
    if (!confirmed) {
      throw new Error('Channel deletion must be confirmed. Set confirmed=true to proceed.');
    }

    logger.info(`Deleting channel: ${channelId} (confirmed)`);

    try {
      await this.callTool<{ success: boolean }>('mcp__discord__delete_channel', {
        channelId,
      });

      logger.info(`Deleted channel: ${channelId}`);

      return {
        channelId,
        success: true,
      };
    } catch (error) {
      logger.error(`Failed to delete channel ${channelId}:`, error);
      throw new Error(`Failed to delete channel: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Cleanup - disconnect when service is done
   */
  async cleanup(): Promise<void> {
    await this.disconnect();
  }
}

// Singleton instance
let discordServiceInstance: DiscordService | null = null;

/**
 * Get the singleton Discord service instance
 *
 * @param settingsService - Settings service instance (required for first call)
 * @returns Discord service instance
 */
export function getDiscordService(settingsService?: SettingsService): DiscordService {
  if (!discordServiceInstance) {
    if (!settingsService) {
      throw new Error('SettingsService required to initialize DiscordService');
    }
    discordServiceInstance = new DiscordService(settingsService);
  }
  return discordServiceInstance;
}
