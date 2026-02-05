/**
 * Discord Server Reorganization Routes
 *
 * API endpoints for restructuring Discord server with category-based organization.
 */

import { Router } from 'express';
import { DiscordMCPService } from '../../../services/discord-mcp-service.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('DiscordReorganizeRoutes');

export function createReorganizeRoutes(settingsService: SettingsService): Router {
  const router = Router();
  const discordService = new DiscordMCPService(settingsService);

  /**
   * POST /api/discord/reorganize/plan
   * Generate a migration plan for Discord server reorganization
   *
   * Response:
   * {
   *   plan: ReorganizationPlan,
   *   summary: string
   * }
   */
  router.post('/plan', async (req, res) => {
    try {
      logger.info('Generating Discord reorganization plan');

      const plan = await discordService.generateReorganizationPlan();

      const summary = `
Discord Server Reorganization Plan
===================================

Current Structure:
${plan.currentStructure.map((cat) => `  ${cat.name}: ${cat.channels.length} channels`).join('\n')}

Proposed Changes:
- Categories to create: ${plan.categoriesToCreate.length}
  ${plan.categoriesToCreate.map((c) => `  • ${c.name}`).join('\n  ')}

- Channels to move: ${plan.channelsToMove.length}
  ${plan.channelsToMove
    .map((m) => `  • #${m.channelName}: ${m.fromCategory || 'Uncategorized'} → ${m.toCategory}`)
    .join('\n  ')}

Proposed Structure:
${plan.proposedStructure.map((cat) => `  ${cat.name}: ${cat.channels.length} channels`).join('\n')}
      `.trim();

      res.json({
        plan,
        summary,
      });
    } catch (error) {
      logger.error('Error generating reorganization plan:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to generate reorganization plan',
      });
    }
  });

  /**
   * POST /api/discord/reorganize/execute
   * Execute Discord server reorganization
   *
   * Body:
   * {
   *   plan: ReorganizationPlan,
   *   dryRun?: boolean (default: false)
   * }
   *
   * Response:
   * {
   *   result: ReorganizationResult
   * }
   */
  router.post('/execute', async (req, res) => {
    try {
      const { plan, dryRun = false } = req.body;

      if (!plan) {
        return res.status(400).json({
          error: 'Missing required field: plan',
        });
      }

      logger.info(`Executing Discord reorganization (dryRun: ${dryRun})`);

      const result = await discordService.executeReorganization(plan, dryRun);

      res.json({
        result,
      });
    } catch (error) {
      logger.error('Error executing reorganization:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to execute reorganization',
      });
    }
  });

  /**
   * POST /api/discord/reorganize/undo
   * Undo a previous reorganization
   *
   * Body:
   * {
   *   rollbackData: RollbackData
   * }
   *
   * Response:
   * {
   *   result: ReorganizationResult
   * }
   */
  router.post('/undo', async (req, res) => {
    try {
      const { rollbackData } = req.body;

      if (!rollbackData) {
        return res.status(400).json({
          error: 'Missing required field: rollbackData',
        });
      }

      logger.info('Undoing Discord reorganization');

      const result = await discordService.undoReorganization(rollbackData);

      res.json({
        result,
      });
    } catch (error) {
      logger.error('Error undoing reorganization:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to undo reorganization',
      });
    }
  });

  /**
   * GET /api/discord/reorganize/channels
   * List all Discord channels
   *
   * Response:
   * {
   *   channels: DiscordChannel[]
   * }
   */
  router.get('/channels', async (req, res) => {
    try {
      logger.info('Listing Discord channels');

      const channels = await discordService.listChannels();

      res.json({
        channels,
      });
    } catch (error) {
      logger.error('Error listing channels:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list channels',
      });
    }
  });

  return router;
}
