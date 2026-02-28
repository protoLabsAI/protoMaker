/**
 * Integration Routes - API endpoints for managing Linear, Discord, and other integrations
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { SettingsService } from '../../services/settings-service.js';
import type { ProjectIntegrations, ReactionAbility } from '@protolabs-ai/types';
import { integrationService } from '../../services/integration-service.js';
import type { IntegrationRegistryService } from '../../services/integration-registry-service.js';

const logger = createLogger('IntegrationRoutes');

export function createIntegrationRoutes(
  settingsService: SettingsService,
  integrationRegistryService?: IntegrationRegistryService
): Router {
  const router = Router();

  /**
   * GET /api/integrations
   * Get integration configuration for a project
   */
  router.post('/get', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      const projectSettings = await settingsService.getProjectSettings(projectPath);
      const integrations = projectSettings.integrations || {};

      res.json({ integrations });
    } catch (error) {
      logger.error('Failed to get integrations:', error);
      res.status(500).json({ error: 'Failed to get integrations' });
    }
  });

  /**
   * POST /api/integrations/update
   * Update integration configuration for a project
   */
  router.post('/update', async (req: Request, res: Response) => {
    try {
      const { projectPath, integrations } = req.body;

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      if (!integrations) {
        res.status(400).json({ error: 'integrations is required' });
        return;
      }

      // Validate integrations structure
      const validatedIntegrations: ProjectIntegrations = {};

      if (integrations.linear) {
        validatedIntegrations.linear = {
          enabled: integrations.linear.enabled ?? false,
          workspaceId: integrations.linear.workspaceId,
          teamId: integrations.linear.teamId,
          projectId: integrations.linear.projectId,
          syncOnFeatureCreate: integrations.linear.syncOnFeatureCreate ?? true,
          syncOnStatusChange: integrations.linear.syncOnStatusChange ?? true,
          commentOnCompletion: integrations.linear.commentOnCompletion ?? true,
          priorityMapping: integrations.linear.priorityMapping,
          labelName: integrations.linear.labelName,
        };
      }

      if (integrations.discord) {
        validatedIntegrations.discord = {
          enabled: integrations.discord.enabled ?? false,
          serverId: integrations.discord.serverId,
          channelId: integrations.discord.channelId,
          createThreadsForAgents: integrations.discord.createThreadsForAgents ?? true,
          notifyOnCompletion: integrations.discord.notifyOnCompletion ?? true,
          notifyOnError: integrations.discord.notifyOnError ?? true,
          notifyOnAutoModeComplete: integrations.discord.notifyOnAutoModeComplete ?? true,
          mentionOnError: integrations.discord.mentionOnError,
          useWebhook: integrations.discord.useWebhook ?? false,
          webhookId: integrations.discord.webhookId,
          webhookToken: integrations.discord.webhookToken,
        };
      }

      // Update project settings
      await settingsService.updateProjectSettings(projectPath, {
        integrations: validatedIntegrations,
      });

      logger.info(`Updated integrations for project: ${projectPath}`);
      res.json({ success: true, integrations: validatedIntegrations });
    } catch (error) {
      logger.error('Failed to update integrations:', error);
      res.status(500).json({ error: 'Failed to update integrations' });
    }
  });

  /**
   * POST /api/integrations/test-linear
   * Test Linear integration by manually triggering a sync
   */
  router.post('/test-linear', async (req: Request, res: Response) => {
    try {
      const { projectPath, featureId } = req.body;

      if (!projectPath || !featureId) {
        res.status(400).json({ error: 'projectPath and featureId are required' });
        return;
      }

      await integrationService.triggerLinearSync(projectPath, featureId);

      logger.info(`Triggered Linear sync for feature: ${featureId}`);
      res.json({ success: true, message: 'Linear sync triggered' });
    } catch (error) {
      logger.error('Failed to trigger Linear sync:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * POST /api/integrations/test-discord
   * Test Discord integration by manually sending a message
   */
  router.post('/test-discord', async (req: Request, res: Response) => {
    try {
      const { projectPath, featureId, message } = req.body;

      if (!projectPath || !featureId || !message) {
        res.status(400).json({ error: 'projectPath, featureId, and message are required' });
        return;
      }

      await integrationService.triggerDiscordNotification(projectPath, featureId, message);

      logger.info(`Triggered Discord notification for feature: ${featureId}`);
      res.json({ success: true, message: 'Discord notification triggered' });
    } catch (error) {
      logger.error('Failed to trigger Discord notification:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * POST /api/integrations/status
   * Get aggregated status for Discord, Linear, and GitHub integrations
   */
  router.post('/status', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      const projectSettings = await settingsService.getProjectSettings(projectPath);
      const integrations = projectSettings.integrations || {};

      // Check Discord bot status
      const discordConnected = integrations.discord?.enabled ?? false;
      const discordBotOnline = await integrationService.checkDiscordBotStatus();

      // Check Linear OAuth status
      const linearConnected = integrations.linear?.enabled ?? false;
      const linearOAuthValid = await integrationService.checkLinearOAuthStatus();

      // Check GitHub auth status (check if gh CLI is authenticated)
      const githubAuthenticated = await integrationService.checkGitHubAuthStatus();

      res.json({
        success: true,
        discord: {
          connected: discordConnected,
          botOnline: discordBotOnline,
        },
        linear: {
          connected: linearConnected,
          oauthValid: linearOAuthValid,
        },
        github: {
          authenticated: githubAuthenticated,
        },
      });
    } catch (error) {
      logger.error('Failed to get integration status:', error);
      res.status(500).json({ error: 'Failed to get integration status' });
    }
  });

  // ---------------------------------------------------------------------------
  // Discord reaction abilities
  // ---------------------------------------------------------------------------

  /**
   * GET /api/integrations/discord/reaction-abilities
   * Get the list of reaction abilities for a project
   */
  router.get('/discord/reaction-abilities', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string | undefined;

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
   * PUT /api/integrations/discord/reaction-abilities
   * Save the list of reaction abilities for a project
   */
  router.put('/discord/reaction-abilities', async (req: Request, res: Response) => {
    try {
      const { projectPath, abilities } = req.body as {
        projectPath?: string;
        abilities?: ReactionAbility[];
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
      const existingDiscord = projectSettings.integrations?.discord ?? { enabled: false };

      await settingsService.updateProjectSettings(projectPath, {
        integrations: {
          ...projectSettings.integrations,
          discord: {
            ...existingDiscord,
            reactionAbilities: abilities,
          },
        },
      });

      logger.info(`Updated reaction abilities for project: ${projectPath}`);
      res.json({ abilities });
    } catch (error) {
      logger.error('Failed to update reaction abilities:', error);
      res.status(500).json({ error: 'Failed to update reaction abilities' });
    }
  });

  // ---------------------------------------------------------------------------
  // Registry endpoints (unified integration management)
  // ---------------------------------------------------------------------------

  if (integrationRegistryService) {
    /**
     * POST /api/integrations/registry/list
     * List all registered integrations with health summaries
     */
    router.post('/registry/list', async (req: Request, res: Response) => {
      try {
        const { category } = req.body;
        const integrations = await integrationRegistryService.listSummaries(category);
        res.json({ integrations });
      } catch (error) {
        logger.error('Failed to list integrations:', error);
        res.status(500).json({ error: 'Failed to list integrations' });
      }
    });

    /**
     * POST /api/integrations/registry/get
     * Get a single integration descriptor with health
     */
    router.post('/registry/get', async (req: Request, res: Response) => {
      try {
        const { id } = req.body;
        if (!id) {
          res.status(400).json({ error: 'id is required' });
          return;
        }

        const integration = integrationRegistryService.get(id);
        if (!integration) {
          res.status(404).json({ error: `Integration "${id}" not found` });
          return;
        }

        const health = integration.hasHealthCheck
          ? await integrationRegistryService.checkHealth(id)
          : undefined;

        res.json({ integration, health });
      } catch (error) {
        logger.error('Failed to get integration:', error);
        res.status(500).json({ error: 'Failed to get integration' });
      }
    });

    /**
     * POST /api/integrations/registry/health
     * Run health checks (single integration or all)
     */
    router.post('/registry/health', async (req: Request, res: Response) => {
      try {
        const { id } = req.body;

        if (id) {
          const health = await integrationRegistryService.checkHealth(id);
          res.json({ health: [health] });
        } else {
          const health = await integrationRegistryService.checkAllHealth();
          res.json({ health });
        }
      } catch (error) {
        logger.error('Failed to check integration health:', error);
        res.status(500).json({ error: 'Failed to check integration health' });
      }
    });

    /**
     * POST /api/integrations/registry/toggle
     * Enable or disable an integration
     */
    router.post('/registry/toggle', async (req: Request, res: Response) => {
      try {
        const { id, enabled } = req.body;

        if (!id || typeof enabled !== 'boolean') {
          res.status(400).json({ error: 'id (string) and enabled (boolean) are required' });
          return;
        }

        const result = integrationRegistryService.setEnabled(id, enabled);
        if (!result.success) {
          res.status(400).json({ error: result.error });
          return;
        }

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to toggle integration:', error);
        res.status(500).json({ error: 'Failed to toggle integration' });
      }
    });
  }

  return router;
}
