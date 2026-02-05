/**
 * Discord MCP Service
 *
 * Provides functionality to interact with Discord server via MCP tools.
 * Handles channel and category management operations.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { MCPServerConfig } from '@automaker/types';
import type { SettingsService } from './settings-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('DiscordMCPService');
const DEFAULT_TIMEOUT = 30000; // 30 seconds for Discord operations

export interface DiscordChannel {
  id: string;
  name: string;
  type: 'GUILD_TEXT' | 'GUILD_VOICE' | 'GUILD_CATEGORY' | string;
  parentId?: string;
  position?: number;
}

export interface DiscordCategory {
  id: string;
  name: string;
  channels: DiscordChannel[];
}

export interface ReorganizationPlan {
  categoriesToCreate: Array<{ name: string }>;
  channelsToMove: Array<{
    channelId: string;
    channelName: string;
    fromCategory?: string;
    toCategory: string;
    categoryId?: string;
  }>;
  currentStructure: DiscordCategory[];
  proposedStructure: DiscordCategory[];
}

export interface ReorganizationResult {
  success: boolean;
  executedActions: string[];
  errors: string[];
  rollbackData?: RollbackData;
}

export interface RollbackData {
  timestamp: string;
  channelMoves: Array<{
    channelId: string;
    channelName: string;
    originalCategoryId?: string;
    newCategoryId?: string;
  }>;
  createdCategories: Array<{
    categoryId: string;
    categoryName: string;
  }>;
}

/**
 * Discord MCP Service for channel and category management
 */
export class DiscordMCPService {
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
   * Connect to Discord MCP server
   */
  private async connect(): Promise<void> {
    if (this.client) {
      return; // Already connected
    }

    // Find Discord MCP server config
    const globalSettings = await this.settingsService.getGlobalSettings();
    const discordServer = globalSettings.mcpServers?.find(
      (s) => s.name.toLowerCase().includes('discord') || s.id.toLowerCase().includes('discord')
    );

    if (!discordServer) {
      throw new Error('Discord MCP server not configured in settings');
    }

    this.client = new Client({
      name: 'automaker-discord-client',
      version: '1.0.0',
    });

    this.transport = await this.createTransport(discordServer);

    await Promise.race([
      this.client.connect(this.transport),
      this.timeout(DEFAULT_TIMEOUT, 'Discord MCP connection timeout'),
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
        logger.warn('Error closing Discord MCP client:', error);
      }
      this.client = null;
      this.transport = null;
    }
  }

  /**
   * Call a Discord MCP tool
   */
  private async callTool<T = unknown>(toolName: string, args: Record<string, unknown>): Promise<T> {
    await this.connect();

    if (!this.client) {
      throw new Error('Discord MCP client not connected');
    }

    try {
      const result = await Promise.race([
        this.client.callTool({
          name: toolName,
          arguments: args,
        }),
        this.timeout(DEFAULT_TIMEOUT, `${toolName} timeout`),
      ]);

      // Parse the result content
      if (
        result &&
        typeof result === 'object' &&
        'content' in result &&
        Array.isArray(result.content) &&
        result.content.length > 0
      ) {
        const content = result.content[0];
        if (content && typeof content === 'object' && 'type' in content && content.type === 'text' && 'text' in content) {
          return JSON.parse(content.text as string) as T;
        }
      }

      return result as T;
    } catch (error) {
      logger.error(`Error calling Discord tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * List all channels in the Discord server
   */
  async listChannels(): Promise<DiscordChannel[]> {
    try {
      const result = await this.callTool<{ channels: DiscordChannel[] }>(
        'mcp__discord__list_channels',
        {}
      );
      return result.channels || [];
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Find a category by name
   */
  async findCategory(categoryName: string): Promise<string | null> {
    try {
      const result = await this.callTool<{ categoryId: string | null }>(
        'mcp__discord__find_category',
        { categoryName }
      );
      return result.categoryId;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Create a new category
   */
  async createCategory(categoryName: string): Promise<string> {
    try {
      const result = await this.callTool<{ categoryId: string }>('mcp__discord__create_category', {
        name: categoryName,
      });
      return result.categoryId;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Move a channel to a category
   */
  async moveChannelToCategory(channelId: string, categoryId: string): Promise<void> {
    try {
      // Use edit channel to set parent
      await this.callTool('mcp__discord__edit_channel', {
        channelId,
        parentId: categoryId,
      });
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Generate a reorganization plan
   */
  async generateReorganizationPlan(): Promise<ReorganizationPlan> {
    const channels = await this.listChannels();

    // Define the target category structure
    const targetCategories = [
      'General',
      'Projects',
      'Engineering',
      'Knowledge',
      'Automations',
      'Archive',
    ];

    // Current structure
    const currentStructure = this.organizeChannelsByCategory(channels);

    // Proposed structure (basic categorization logic)
    const proposedStructure: DiscordCategory[] = targetCategories.map((catName) => ({
      id: '', // Will be filled during execution
      name: catName,
      channels: [],
    }));

    // Categorization rules
    const channelsToMove: ReorganizationPlan['channelsToMove'] = [];

    for (const channel of channels) {
      if (channel.type === 'GUILD_CATEGORY') continue;

      let targetCategory = 'General';

      // Categorization logic based on channel name
      const lowerName = channel.name.toLowerCase();

      if (
        lowerName.includes('project') ||
        lowerName.includes('sprint') ||
        lowerName.includes('milestone')
      ) {
        targetCategory = 'Projects';
      } else if (
        lowerName.includes('dev') ||
        lowerName.includes('code') ||
        lowerName.includes('engineering') ||
        lowerName.includes('backend') ||
        lowerName.includes('frontend')
      ) {
        targetCategory = 'Engineering';
      } else if (
        lowerName.includes('docs') ||
        lowerName.includes('wiki') ||
        lowerName.includes('knowledge') ||
        lowerName.includes('learning')
      ) {
        targetCategory = 'Knowledge';
      } else if (
        lowerName.includes('bot') ||
        lowerName.includes('automation') ||
        lowerName.includes('ci') ||
        lowerName.includes('webhook')
      ) {
        targetCategory = 'Automations';
      } else if (
        lowerName.includes('archive') ||
        lowerName.includes('old') ||
        lowerName.includes('deprecated')
      ) {
        targetCategory = 'Archive';
      }

      // Find current category
      const currentCategory = currentStructure.find((cat) =>
        cat.channels.some((ch) => ch.id === channel.id)
      );

      // Only move if the target category is different
      if (!currentCategory || currentCategory.name !== targetCategory) {
        channelsToMove.push({
          channelId: channel.id,
          channelName: channel.name,
          fromCategory: currentCategory?.name,
          toCategory: targetCategory,
        });

        // Add to proposed structure
        const targetCat = proposedStructure.find((c) => c.name === targetCategory);
        if (targetCat) {
          targetCat.channels.push(channel);
        }
      }
    }

    // Categories to create (those that don't exist yet)
    const existingCategoryNames = currentStructure.map((c) => c.name);
    const categoriesToCreate = targetCategories
      .filter((name) => !existingCategoryNames.includes(name))
      .map((name) => ({ name }));

    return {
      categoriesToCreate,
      channelsToMove,
      currentStructure,
      proposedStructure,
    };
  }

  /**
   * Execute reorganization based on plan
   */
  async executeReorganization(
    plan: ReorganizationPlan,
    dryRun = false
  ): Promise<ReorganizationResult> {
    const executedActions: string[] = [];
    const errors: string[] = [];
    const rollbackData: RollbackData = {
      timestamp: new Date().toISOString(),
      channelMoves: [],
      createdCategories: [],
    };

    if (dryRun) {
      executedActions.push('DRY RUN: No changes were made');
      executedActions.push(
        `Would create ${plan.categoriesToCreate.length} categories: ${plan.categoriesToCreate.map((c) => c.name).join(', ')}`
      );
      executedActions.push(
        `Would move ${plan.channelsToMove.length} channels to new categories`
      );
      return { success: true, executedActions, errors };
    }

    try {
      await this.connect();

      // Step 1: Create missing categories
      const categoryIdMap = new Map<string, string>();

      for (const category of plan.categoriesToCreate) {
        try {
          const categoryId = await this.createCategory(category.name);
          categoryIdMap.set(category.name, categoryId);
          rollbackData.createdCategories.push({
            categoryId,
            categoryName: category.name,
          });
          executedActions.push(`Created category: ${category.name}`);
        } catch (error) {
          const errorMsg = `Failed to create category ${category.name}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error(errorMsg);
        }
      }

      // Also get IDs for existing categories
      const allChannels = await this.listChannels();
      for (const channel of allChannels) {
        if (channel.type === 'GUILD_CATEGORY') {
          categoryIdMap.set(channel.name, channel.id);
        }
      }

      // Step 2: Move channels to new categories
      for (const move of plan.channelsToMove) {
        try {
          const categoryId = categoryIdMap.get(move.toCategory);
          if (!categoryId) {
            errors.push(`Category ${move.toCategory} not found for channel ${move.channelName}`);
            continue;
          }

          // Find original category ID for rollback
          const originalChannel = allChannels.find((ch) => ch.id === move.channelId);
          const originalCategoryId = originalChannel?.parentId;

          await this.moveChannelToCategory(move.channelId, categoryId);

          rollbackData.channelMoves.push({
            channelId: move.channelId,
            channelName: move.channelName,
            originalCategoryId,
            newCategoryId: categoryId,
          });

          executedActions.push(
            `Moved channel #${move.channelName} from ${move.fromCategory || 'no category'} to ${move.toCategory}`
          );
        } catch (error) {
          const errorMsg = `Failed to move channel ${move.channelName}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error(errorMsg);
        }
      }

      return {
        success: errors.length === 0,
        executedActions,
        errors,
        rollbackData: rollbackData.channelMoves.length > 0 ? rollbackData : undefined,
      };
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Undo a previous reorganization
   */
  async undoReorganization(rollbackData: RollbackData): Promise<ReorganizationResult> {
    const executedActions: string[] = [];
    const errors: string[] = [];

    try {
      await this.connect();

      // Restore channel positions
      for (const move of rollbackData.channelMoves) {
        try {
          if (move.originalCategoryId) {
            await this.moveChannelToCategory(move.channelId, move.originalCategoryId);
            executedActions.push(`Restored channel #${move.channelName} to original category`);
          }
        } catch (error) {
          const errorMsg = `Failed to restore channel ${move.channelName}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error(errorMsg);
        }
      }

      // Note: We don't delete created categories as they might have been used for other purposes
      executedActions.push(
        `Note: Created categories were not deleted to preserve any new channels added to them`
      );

      return {
        success: errors.length === 0,
        executedActions,
        errors,
      };
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Organize channels by their current category
   */
  private organizeChannelsByCategory(channels: DiscordChannel[]): DiscordCategory[] {
    const categories = new Map<string, DiscordCategory>();
    const uncategorized: DiscordChannel[] = [];

    // First pass: collect all categories
    for (const channel of channels) {
      if (channel.type === 'GUILD_CATEGORY') {
        categories.set(channel.id, {
          id: channel.id,
          name: channel.name,
          channels: [],
        });
      }
    }

    // Second pass: assign channels to categories
    for (const channel of channels) {
      if (channel.type === 'GUILD_CATEGORY') continue;

      if (channel.parentId && categories.has(channel.parentId)) {
        categories.get(channel.parentId)!.channels.push(channel);
      } else {
        uncategorized.push(channel);
      }
    }

    // Add uncategorized channels
    if (uncategorized.length > 0) {
      categories.set('uncategorized', {
        id: 'uncategorized',
        name: 'Uncategorized',
        channels: uncategorized,
      });
    }

    return Array.from(categories.values());
  }

  /**
   * Create appropriate transport based on server type
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
   * Create a timeout promise
   */
  private timeout<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }
}
