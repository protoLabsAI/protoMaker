/**
 * PUT /api/settings/project/discord-channels - Update Discord channel mappings
 *
 * Dedicated endpoint for updating Discord channel mappings without affecting
 * other project settings. Performs a deep merge to preserve existing mappings.
 *
 * Request body: `{ projectPath: string, channelMappings: Partial<DiscordChannelMappings> }`
 * Response: `{ "success": true, "settings": ProjectSettings }`
 */

import type { Request, Response } from 'express';
import type { SettingsService } from '../../../services/settings-service.js';
import type { ProjectSettings } from '../../../types/settings.js';
import { getErrorMessage, logError } from '../common.js';

interface DiscordChannelMappings {
  featureCreated?: string;
  featureCompleted?: string;
  featureError?: string;
  prCreated?: string;
  prMerged?: string;
  autoModeStatus?: string;
  general?: string;
}

/**
 * Create handler factory for PUT /api/settings/project/discord-channels
 *
 * @param settingsService - Instance of SettingsService for file I/O
 * @returns Express request handler
 */
export function createUpdateDiscordChannelsHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, channelMappings } = req.body as {
        projectPath?: string;
        channelMappings?: Partial<DiscordChannelMappings>;
      };

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (!channelMappings || typeof channelMappings !== 'object') {
        res.status(400).json({
          success: false,
          error: 'channelMappings object is required',
        });
        return;
      }

      // Validate channel IDs are strings or undefined
      for (const [key, value] of Object.entries(channelMappings)) {
        if (value !== undefined && typeof value !== 'string') {
          res.status(400).json({
            success: false,
            error: `Invalid channel ID for ${key}: must be a string`,
          });
          return;
        }
      }

      // Update only the Discord channel mappings
      const updates: Partial<ProjectSettings> = {
        discordChannelMappings: channelMappings,
      };

      const settings = await settingsService.updateProjectSettings(projectPath, updates);

      res.json({
        success: true,
        settings,
        discordChannelMappings: settings.discordChannelMappings,
      });
    } catch (error) {
      logError(error, 'Update Discord channel mappings failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
