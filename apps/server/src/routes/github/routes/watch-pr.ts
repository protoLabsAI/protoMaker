/**
 * POST /github/watch-pr endpoint
 *
 * Registers a PR with the PRWatcherService for background CI monitoring.
 * Returns immediately with `{ watching: true, prNumber }`.
 * When checks resolve, the server emits a `pr:watch-resolved` WebSocket event
 * that the Ava chat UI injects as a new message.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import { getPRWatcherService } from '../../../services/pr-watcher-service.js';
import type { EventEmitter } from '../../../lib/events.js';
import { getErrorMessage } from './common.js';

const logger = createLogger('WatchPRRoute');

interface WatchPRRequest {
  projectPath: string;
  prNumber: number;
  /** Chat session ID — injected by the UI so the notification is routed back to the right session */
  sessionId?: string;
}

export function createWatchPRHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, prNumber, sessionId } = req.body as WatchPRRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!prNumber || typeof prNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'prNumber is required and must be a number' });
        return;
      }

      // Initialise (or retrieve) the singleton watcher
      const watcher = getPRWatcherService(events);
      if (!watcher) {
        res.status(500).json({ success: false, error: 'PRWatcherService unavailable' });
        return;
      }

      watcher.addWatch(prNumber, projectPath, sessionId);

      logger.info(`Registered watch for PR #${prNumber} (session: ${sessionId ?? 'broadcast'})`);

      res.json({
        success: true,
        watching: true,
        prNumber,
      });
    } catch (error) {
      logger.error('watch-pr handler error:', error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
