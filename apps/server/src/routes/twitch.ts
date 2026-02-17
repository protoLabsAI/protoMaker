/**
 * Twitch routes - HTTP API for Twitch chat integration
 *
 * Provides endpoints for:
 * - POST /api/twitch/connect - Connect to Twitch chat
 * - POST /api/twitch/disconnect - Disconnect from Twitch chat
 * - GET /api/twitch/suggestions - List suggestions with filtering
 * - POST /api/twitch/suggestions/:id/approve - Mark suggestion as processed
 * - POST /api/twitch/suggestions/:id/build - Create board feature from suggestion
 * - POST /api/twitch/poll - Create native Twitch poll from selected suggestions
 * - GET /api/twitch/status - Connection status
 */

import { Router, type Request, type Response } from 'express';
import type { TwitchService } from '../services/twitch/twitch-service.js';
import type { EventEmitter } from '../lib/events.js';
import { createLogger } from '@automaker/utils';
import type { FeatureLoader } from '../services/feature-loader.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('TwitchRoutes');

/**
 * Create Twitch router with all endpoints
 *
 * @param twitchService - Instance of TwitchService
 * @param events - Event emitter for WebSocket notifications
 * @param featureLoader - Feature loader for creating board features
 * @returns Express Router configured with Twitch endpoints
 */
export function createTwitchRoutes(
  twitchService: TwitchService,
  events: EventEmitter,
  featureLoader: FeatureLoader
): Router {
  const router = Router();

  /**
   * POST /api/twitch/connect
   *
   * Connect to Twitch chat
   */
  router.post('/connect', async (_req: Request, res: Response) => {
    try {
      const connected = await twitchService.connect();

      // Emit WebSocket event for connection status change
      events.emit('twitch:connection', {
        connected,
        timestamp: new Date().toISOString(),
      });

      if (connected) {
        const status = twitchService.getStatus();
        res.json({
          success: true,
          connected: true,
          channel: status.channel,
        });
      } else {
        res.status(500).json({
          success: false,
          connected: false,
          error: 'Failed to connect to Twitch. Check server logs for details.',
        });
      }
    } catch (error) {
      logger.error('Error connecting to Twitch:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to connect to Twitch',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/twitch/disconnect
   *
   * Disconnect from Twitch chat
   */
  router.post('/disconnect', async (_req: Request, res: Response) => {
    try {
      await twitchService.disconnect();

      // Emit WebSocket event for connection status change
      events.emit('twitch:connection', {
        connected: false,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        connected: false,
      });
    } catch (error) {
      logger.error('Error disconnecting from Twitch:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect from Twitch',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/twitch/suggestions
   *
   * List suggestions with filtering
   *
   * Query params:
   * - filter: 'all' | 'unprocessed' | 'approved' (default: 'all')
   */
  router.get('/suggestions', async (req: Request, res: Response) => {
    try {
      const filter = (req.query.filter as string) || 'all';

      if (!['all', 'unprocessed', 'approved'].includes(filter)) {
        res.status(400).json({
          error: 'Invalid filter parameter. Must be "all", "unprocessed", or "approved".',
        });
        return;
      }

      const allSuggestions = await twitchService.readSuggestions();

      // Apply filter
      let filteredSuggestions = allSuggestions;
      if (filter === 'unprocessed') {
        filteredSuggestions = allSuggestions.filter((s) => !s.processed);
      } else if (filter === 'approved') {
        filteredSuggestions = allSuggestions.filter((s) => s.processed);
      }

      res.json({
        suggestions: filteredSuggestions,
        count: filteredSuggestions.length,
        total: allSuggestions.length,
        filter,
      });
    } catch (error) {
      logger.error('Error getting Twitch suggestions:', error);
      res.status(500).json({
        error: 'Failed to get Twitch suggestions',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/twitch/suggestions/:id/approve
   *
   * Mark suggestion as processed/approved
   */
  router.post('/suggestions/:id/approve', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;

      // Read all suggestions
      const suggestions = await twitchService.readSuggestions();

      // Find the suggestion
      const suggestion = suggestions.find((s) => s.id === id);
      if (!suggestion) {
        res.status(404).json({
          error: 'Suggestion not found',
        });
        return;
      }

      // Mark as processed
      await twitchService.updateSuggestion(id, { processed: true });

      // Emit WebSocket event for suggestion change
      events.emit('twitch:suggestion:updated', {
        suggestionId: id,
        processed: true,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        suggestion: {
          ...suggestion,
          processed: true,
        },
      });
    } catch (error) {
      logger.error('Error approving Twitch suggestion:', error);
      res.status(500).json({
        error: 'Failed to approve suggestion',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/twitch/suggestions/:id/build
   *
   * Create board feature from suggestion
   *
   * Body:
   * - projectPath: Path to project for creating feature
   */
  router.post('/suggestions/:id/build', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { projectPath } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          error: 'projectPath is required and must be a string',
        });
        return;
      }

      // Read all suggestions
      const suggestions = await twitchService.readSuggestions();

      // Find the suggestion
      const suggestion = suggestions.find((s) => s.id === id);
      if (!suggestion) {
        res.status(404).json({
          error: 'Suggestion not found',
        });
        return;
      }

      // Create board feature
      const featureId = `feature-${Date.now()}-${uuidv4().split('-')[0]}`;
      const feature = {
        id: featureId,
        title: suggestion.suggestion,
        description: `Twitch chat suggestion from @${suggestion.username} in #${suggestion.channel}`,
        status: 'backlog' as const,
        createdAt: new Date().toISOString(),
        metadata: {
          source: 'twitch',
          twitchUsername: suggestion.username,
          twitchChannel: suggestion.channel,
          twitchSuggestionId: suggestion.id,
          twitchTimestamp: suggestion.timestamp,
        },
      };

      await featureLoader.create(projectPath, feature);

      // Mark suggestion as processed
      await twitchService.updateSuggestion(id, { processed: true });

      // Emit WebSocket events
      events.emit('twitch:suggestion:built', {
        suggestionId: id,
        featureId,
        projectPath,
        timestamp: new Date().toISOString(),
      });

      events.emit('twitch:suggestion:updated', {
        suggestionId: id,
        processed: true,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        feature,
        suggestion: {
          ...suggestion,
          processed: true,
        },
      });
    } catch (error) {
      logger.error('Error building feature from Twitch suggestion:', error);
      res.status(500).json({
        error: 'Failed to build feature from suggestion',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/twitch/poll
   *
   * Create native Twitch poll from selected suggestions
   *
   * Body:
   * - suggestionIds: Array of 2-4 suggestion IDs to include in poll
   * - projectPath: Path to project for creating feature from winner
   * - durationSeconds: Poll duration (default: 60, max: 1800)
   */
  router.post('/poll', async (req: Request, res: Response) => {
    try {
      const { suggestionIds, projectPath, durationSeconds } = req.body;

      // Validate suggestionIds
      if (!Array.isArray(suggestionIds) || suggestionIds.length < 2 || suggestionIds.length > 4) {
        res.status(400).json({
          error: 'suggestionIds must be an array of 2-4 suggestion IDs',
        });
        return;
      }

      // Validate projectPath
      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          error: 'projectPath is required and must be a string',
        });
        return;
      }

      // Validate duration
      const duration = durationSeconds || 60;
      if (typeof duration !== 'number' || duration < 15 || duration > 1800) {
        res.status(400).json({
          error: 'durationSeconds must be a number between 15 and 1800',
        });
        return;
      }

      // Read all suggestions
      const allSuggestions = await twitchService.readSuggestions();

      // Find the suggestions
      const suggestions = suggestionIds
        .map((id) => allSuggestions.find((s) => s.id === id))
        .filter((s) => s !== undefined);

      if (suggestions.length !== suggestionIds.length) {
        res.status(404).json({
          error: 'One or more suggestions not found',
        });
        return;
      }

      // Create Twitch poll via Helix API
      const pollResult = await twitchService.createPoll({
        title: 'Which feature should we build?',
        choices: suggestions.map((s) => ({
          title: s.suggestion.substring(0, 25), // Twitch poll choice max length
        })),
        durationSeconds: duration,
      });

      // Store poll metadata for result tracking
      await twitchService.storePollMetadata(pollResult.id, {
        suggestionIds,
        projectPath,
        createdAt: new Date().toISOString(),
        status: 'active',
      });

      // Emit WebSocket event
      events.emit('twitch:poll:created', {
        pollId: pollResult.id,
        suggestionIds,
        projectPath,
        duration,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        poll: pollResult,
        suggestions,
      });
    } catch (error) {
      logger.error('Error creating Twitch poll:', error);
      res.status(500).json({
        error: 'Failed to create Twitch poll',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/twitch/status
   *
   * Get Twitch connection status
   */
  router.get('/status', (_req: Request, res: Response) => {
    try {
      const status = twitchService.getStatus();
      res.json(status);
    } catch (error) {
      logger.error('Error getting Twitch status:', error);
      res.status(500).json({
        error: 'Failed to get Twitch status',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
