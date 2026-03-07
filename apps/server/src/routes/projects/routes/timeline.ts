/**
 * GET /api/projects/:slug/timeline
 *
 * Returns all EventLedger events for a project in chronological order.
 *
 * Query params:
 *   ?since=<ISO 8601>  — only return events after this timestamp (exclusive)
 *   ?type=<eventType>  — only return events of this type
 */

import type { Request, Response } from 'express';
import type { EventLedgerService } from '../../../services/event-ledger-service.js';

export function createTimelineHandler(eventLedger: EventLedgerService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { slug } = req.params as { slug: string };

      if (!slug) {
        res.status(400).json({ success: false, error: 'Project slug is required' });
        return;
      }

      const since = req.query.since as string | undefined;
      const type = req.query.type as string | undefined;

      if (since !== undefined && isNaN(new Date(since).getTime())) {
        res.status(400).json({ success: false, error: 'Invalid "since" timestamp' });
        return;
      }

      const events = await eventLedger.queryByProject(slug, { since, type });

      res.json({ success: true, events });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  };
}
