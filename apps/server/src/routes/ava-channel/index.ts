/**
 * Ava Channel routes - Private coordination channel for Ava instances
 *
 * POST /api/ava-channel/send     - Post a message to the private Ava channel
 * GET  /api/ava-channel/messages - Read recent messages with optional filters
 * POST /api/ava-channel/file-improvement - File a System Improvements ticket
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { AvaChannelService } from '../../services/ava-channel-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';

const logger = createLogger('AvaChannelRoutes');

/** Slug for the System Improvements project */
const SYSTEM_IMPROVEMENTS_SLUG = 'system-improvements';

/** Rate limit: max 3 improvement tickets per instance per day */
const MAX_TICKETS_PER_DAY = 3;

/** Track daily ticket counts per instance: instanceId -> { date, count } */
const ticketRateLimiter = new Map<string, { date: string; count: number }>();

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function checkRateLimit(instanceId: string): { allowed: boolean; remaining: number } {
  const today = getTodayDateString();
  const entry = ticketRateLimiter.get(instanceId);

  if (!entry || entry.date !== today) {
    ticketRateLimiter.set(instanceId, { date: today, count: 0 });
    return { allowed: true, remaining: MAX_TICKETS_PER_DAY };
  }

  const remaining = MAX_TICKETS_PER_DAY - entry.count;
  return { allowed: remaining > 0, remaining };
}

function incrementRateLimit(instanceId: string): void {
  const today = getTodayDateString();
  const entry = ticketRateLimiter.get(instanceId);
  if (!entry || entry.date !== today) {
    ticketRateLimiter.set(instanceId, { date: today, count: 1 });
  } else {
    entry.count += 1;
  }
}

export function createAvaChannelRoutes(
  avaChannelService: AvaChannelService | undefined,
  featureLoader: FeatureLoader
): Router {
  const router = Router();

  /**
   * POST /api/ava-channel/send
   * Body: { message: string, context?: string, instanceId?: string }
   * Posts a message to the private Ava coordination channel.
   */
  router.post('/send', async (req: Request, res: Response): Promise<void> => {
    try {
      const { message, context, instanceId, intent, expectsResponse } = req.body as {
        message?: string;
        context?: string;
        instanceId?: string;
        intent?: 'inform' | 'request' | 'coordination' | 'escalation';
        expectsResponse?: boolean;
      };

      if (!message || typeof message !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'message is required', type: 'validation_error' },
        });
        return;
      }

      if (!avaChannelService) {
        res.status(503).json({
          success: false,
          error: {
            message: 'Ava channel service not available',
            type: 'service_unavailable',
          },
        });
        return;
      }

      let content = message;
      if (context) {
        content = `${message}\n\nContext: ${context}`;
      }

      const source = instanceId === 'operator' ? ('operator' as const) : ('ava' as const);
      const posted = await avaChannelService.postMessage(content, source, {
        instanceName: instanceId,
        intent: intent ?? 'inform',
        expectsResponse: expectsResponse ?? false,
      });

      res.json({
        success: true,
        message: posted,
      });
    } catch (error) {
      logger.error('Failed to send Ava channel message:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'internal_error',
        },
      });
    }
  });

  /**
   * GET /api/ava-channel/messages
   * Query params: limit?, since?, until?, instanceId?
   * Returns recent messages from the private Ava channel.
   */
  router.get('/messages', async (req: Request, res: Response): Promise<void> => {
    try {
      const { since, until, instanceId, includeProtocol } = req.query as {
        since?: string;
        until?: string;
        instanceId?: string;
        includeProtocol?: string;
      };

      if (!avaChannelService) {
        res.status(503).json({
          success: false,
          error: {
            message: 'Ava channel service not available',
            type: 'service_unavailable',
          },
        });
        return;
      }

      const from = since ? new Date(since) : undefined;
      const to = until ? new Date(until) : undefined;

      const messages = await avaChannelService.getMessages({
        from: from && !isNaN(from.getTime()) ? from : undefined,
        to: to && !isNaN(to.getTime()) ? to : undefined,
        instanceId,
        includeProtocol: includeProtocol === 'true',
      });

      const seen = new Set<string>();
      const deduped = messages.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      res.json({
        success: true,
        messages: deduped,
        total: deduped.length,
      });
    } catch (error) {
      logger.error('Failed to read Ava channel messages:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'internal_error',
        },
      });
    }
  });

  /**
   * POST /api/ava-channel/file-improvement
   * Body: {
   *   projectPath: string,
   *   title: string,
   *   description: string,
   *   frictionSummary: string,
   *   discussionContext?: string,
   *   complexity?: string,
   *   priority?: number,
   *   instanceId?: string,
   *   discussantCount?: number,
   * }
   *
   * Creates a feature on the System Improvements board.
   * Enforces:
   *   - Rate limit: max 3 tickets per instance per day
   *   - Dedup check: searches existing backlog before filing
   *   - Minimum discussion threshold: at least 2 Ava instances must have discussed
   */
  router.post('/file-improvement', async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        title,
        description,
        frictionSummary,
        discussionContext,
        complexity,
        priority,
        instanceId,
        discussantCount,
      } = req.body as {
        projectPath?: string;
        title?: string;
        description?: string;
        frictionSummary?: string;
        discussionContext?: string;
        complexity?: string;
        priority?: number;
        instanceId?: string;
        discussantCount?: number;
      };

      // Validate required fields
      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'projectPath is required', type: 'validation_error' },
        });
        return;
      }

      if (!title || typeof title !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'title is required', type: 'validation_error' },
        });
        return;
      }

      if (!description || typeof description !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'description is required', type: 'validation_error' },
        });
        return;
      }

      if (!frictionSummary || typeof frictionSummary !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'frictionSummary is required', type: 'validation_error' },
        });
        return;
      }

      // Minimum discussion threshold check: at least 2 Ava instances must have discussed
      const numDiscussants = discussantCount ?? 1;
      if (numDiscussants < 2) {
        res.status(422).json({
          success: false,
          error: {
            message:
              'At least 2 Ava instances must have discussed this friction point before filing a ticket. Read the channel first, confirm another instance has mentioned this issue.',
            type: 'discussion_threshold_not_met',
            discussantCount: numDiscussants,
            required: 2,
          },
        });
        return;
      }

      // Rate limit check
      const effectiveInstanceId = instanceId || 'unknown';
      const rateCheck = checkRateLimit(effectiveInstanceId);
      if (!rateCheck.allowed) {
        res.status(429).json({
          success: false,
          error: {
            message: `Rate limit exceeded: max ${MAX_TICKETS_PER_DAY} system improvement tickets per instance per day`,
            type: 'rate_limit_exceeded',
            remaining: 0,
            resetsAt: `${getTodayDateString()}T23:59:59Z`,
          },
        });
        return;
      }

      // Dedup check: search existing features across all projects for a similar title
      let existingFeatures: Array<{
        id: string;
        title: string;
        status: string;
        projectSlug?: string;
      }> = [];
      try {
        // Load all features and check for existing System Improvements tickets with similar title
        const allFeatures = await featureLoader.getAll(projectPath);
        existingFeatures = allFeatures
          .filter((f) => f.projectSlug === SYSTEM_IMPROVEMENTS_SLUG)
          .map((f) => ({
            id: f.id,
            title: f.title ?? '',
            status: f.status ?? '',
            projectSlug: f.projectSlug,
          }));
      } catch (err) {
        logger.warn('Failed to load features for dedup check, proceeding anyway:', err);
      }

      // Check for duplicate by title similarity (simple case-insensitive includes)
      const lowerTitle = title.toLowerCase();
      const duplicate = existingFeatures.find(
        (f) =>
          f.status !== 'done' &&
          (f.title.toLowerCase().includes(lowerTitle) || lowerTitle.includes(f.title.toLowerCase()))
      );

      if (duplicate) {
        res.status(409).json({
          success: false,
          error: {
            message: `A similar ticket already exists in the System Improvements backlog: "${duplicate.title}" (${duplicate.status})`,
            type: 'duplicate_ticket',
            existingFeatureId: duplicate.id,
            existingFeatureTitle: duplicate.title,
            existingFeatureStatus: duplicate.status,
          },
        });
        return;
      }

      // Build the full description with friction summary and discussion context
      const fullDescription = [
        description,
        '',
        `**Friction Summary:** ${frictionSummary}`,
        discussionContext ? `\n**Discussion Context:**\n${discussionContext}` : '',
        '',
        `_Filed by Ava instance: ${effectiveInstanceId} on ${new Date().toISOString()}_`,
      ]
        .filter((line) => line !== undefined)
        .join('\n');

      // Create the feature on the System Improvements project
      const featureData = {
        title,
        description: fullDescription,
        status: 'backlog' as const,
        projectSlug: SYSTEM_IMPROVEMENTS_SLUG,
        ...(complexity && {
          complexity: complexity as 'small' | 'medium' | 'large' | 'architectural',
        }),
        priority: (priority ?? 3) as 0 | 1 | 2 | 3 | 4,
        assignee: 'agent',
      };

      // Use featureLoader to create the feature
      const newFeature = await featureLoader.create(projectPath, featureData);

      // Increment rate limit counter
      incrementRateLimit(effectiveInstanceId);

      logger.info(
        `System improvement ticket filed by instance ${effectiveInstanceId}: "${title}" (${newFeature.id})`
      );

      res.json({
        success: true,
        feature: {
          id: newFeature.id,
          title: newFeature.title,
          status: newFeature.status,
          projectSlug: SYSTEM_IMPROVEMENTS_SLUG,
        },
        rateLimit: {
          remaining: rateCheck.remaining - 1,
          resetsAt: `${getTodayDateString()}T23:59:59Z`,
        },
      });
    } catch (error) {
      logger.error('Failed to file system improvement ticket:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'internal_error',
        },
      });
    }
  });

  return router;
}
