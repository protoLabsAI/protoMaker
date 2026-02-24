import type { RequestHandler } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { DiscordProvisionResult } from '@protolabs-ai/types';

const logger = createLogger('setup:discord-provision');

interface DiscordProvisionRequest {
  projectPath: string;
  projectName: string;
  guildId: string;
}

interface DiscordProvisionResponse {
  success: boolean;
  result?: DiscordProvisionResult;
  error?: string;
}

/**
 * POST /api/setup/discord-provision
 * Create Discord category and channels for a project.
 * This is a lightweight endpoint — actual Discord operations are done
 * via the Discord MCP tools by the orchestrating skill.
 */
export function createDiscordProvisionHandler(): RequestHandler<
  unknown,
  DiscordProvisionResponse,
  DiscordProvisionRequest
> {
  return async (req, res) => {
    try {
      const { projectName, guildId } = req.body;

      if (!projectName || !guildId) {
        res.status(400).json({
          success: false,
          error: 'projectName and guildId are required',
        });
        return;
      }

      logger.info('Discord provisioning requested', { projectName, guildId });

      // The actual Discord channel creation is orchestrated by the /setuplab skill
      // using the discord MCP tools (create_category, create_text_channel, create_webhook).
      // This endpoint serves as the API surface for the MCP tool to call.
      // Return the expected channel structure so the MCP tool can create them.
      res.json({
        success: true,
        result: {
          success: true,
          channels: {
            general: `${projectName}-general`,
            updates: `${projectName}-updates`,
            dev: `${projectName}-dev`,
          },
        },
      });
    } catch (error) {
      logger.error('Discord provisioning failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
