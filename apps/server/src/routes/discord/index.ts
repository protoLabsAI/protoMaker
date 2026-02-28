/**
 * Discord routes - HTTP API for Discord channel management and DMs
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { DiscordService } from '../../services/discord-service.js';
import type { DiscordBotService } from '../../services/discord-bot-service.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { ReactionAbility } from '@protolabs-ai/types';
import {
  createReorganizeHandler,
  createUndoHandler,
  createAuditHandler,
} from './routes/reorganize.js';
import { createSendDMHandler } from './routes/send-dm.js';
import { createReadDMsHandler } from './routes/read-dms.js';

const logger = createLogger('DiscordRoutes');

export function createDiscordRoutes(
  discordBotService?: DiscordBotService,
  settingsService?: SettingsService
): Router {
  const router = Router();
  const discordService = new DiscordService();

  // Channel reorganization endpoints
  router.post('/reorganize', createReorganizeHandler(discordService));
  router.post('/reorganize/undo', createUndoHandler(discordService));
  router.post('/audit', createAuditHandler(discordService));

  // DM endpoints (require DiscordBotService)
  if (discordBotService) {
    router.post('/send-dm', createSendDMHandler(discordBotService));
    router.post('/read-dms', createReadDMsHandler(discordBotService));
  }

  // Reaction abilities endpoints (require SettingsService)
  if (settingsService) {
    /**
     * GET /api/discord/reaction-abilities?projectPath=...
     * Returns the reaction abilities configured for a project
     */
    router.get('/reaction-abilities', async (req: Request, res: Response) => {
      try {
        const projectPath = req.query.projectPath as string;
        if (!projectPath) {
          res.status(400).json({ error: 'projectPath is required' });
          return;
        }

        const projectSettings = await settingsService.getProjectSettings(projectPath);
        const abilities: ReactionAbility[] =
          projectSettings.integrations?.discord?.reactionAbilities ?? [];

        res.json({ abilities });
      } catch (error) {
        logger.error('Failed to get reaction abilities:', error);
        res.status(500).json({ error: 'Failed to get reaction abilities' });
      }
    });

    /**
     * PUT /api/discord/reaction-abilities
     * Saves the full list of reaction abilities for a project
     */
    router.put('/reaction-abilities', async (req: Request, res: Response) => {
      try {
        const { projectPath, abilities } = req.body as {
          projectPath: string;
          abilities: ReactionAbility[];
        };

        if (!projectPath) {
          res.status(400).json({ error: 'projectPath is required' });
          return;
        }
        if (!Array.isArray(abilities)) {
          res.status(400).json({ error: 'abilities must be an array' });
          return;
        }

        const projectSettings = await settingsService.getProjectSettings(projectPath);
        const discordConfig = projectSettings.integrations?.discord ?? { enabled: false };

        await settingsService.updateProjectSettings(projectPath, {
          integrations: {
            ...projectSettings.integrations,
            discord: {
              ...discordConfig,
              reactionAbilities: abilities,
            },
          },
        });

        res.json({ abilities });
      } catch (error) {
        logger.error('Failed to save reaction abilities:', error);
        res.status(500).json({ error: 'Failed to save reaction abilities' });
      }
    });
  }

  return router;
}
