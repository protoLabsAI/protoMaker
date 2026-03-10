/**
 * Ceremony timeline routes
 *
 * POST /api/projects/:slug/ceremony-timeline
 *   Append a new entry to the project's ceremony timeline.
 *   Body: { projectPath, type, content, author, metadata? }
 *
 * GET /api/projects/:slug/ceremony-timeline
 *   Retrieve paginated entries from the project's ceremony timeline.
 *   Query params: projectPath (required), since?, limit?, offset?
 */

import type { Request, Response } from 'express';
import {
  projectTimelineService,
  type AppendTimelineEntryOptions,
} from '../../../services/project-timeline-service.js';
import type { TimelineEntryType, TimelineEntryAuthor } from '@protolabsai/types';
import { getErrorMessage, logError } from '../common.js';

const VALID_TYPES: TimelineEntryType[] = [
  'standup',
  'retro',
  'status_report',
  'decision',
  'escalation',
  'milestone_complete',
];

const VALID_AUTHORS: TimelineEntryAuthor[] = ['pm', 'ava', 'operator', 'lead-engineer'];

// ---------------------------------------------------------------------------
// POST /api/projects/:slug/ceremony-timeline
// ---------------------------------------------------------------------------

interface PostCeremonyTimelineBody {
  projectPath: string;
  type: TimelineEntryType;
  content: string;
  author: TimelineEntryAuthor;
  metadata?: Record<string, unknown>;
}

export function createPostCeremonyTimelineHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { slug } = req.params as { slug: string };
      const { projectPath, type, content, author, metadata } =
        req.body as PostCeremonyTimelineBody;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      if (!type || !VALID_TYPES.includes(type)) {
        res
          .status(400)
          .json({ success: false, error: `type must be one of: ${VALID_TYPES.join(', ')}` });
        return;
      }
      if (!content || typeof content !== 'string') {
        res.status(400).json({ success: false, error: 'content is required and must be a string' });
        return;
      }
      if (!author || !VALID_AUTHORS.includes(author)) {
        res
          .status(400)
          .json({ success: false, error: `author must be one of: ${VALID_AUTHORS.join(', ')}` });
        return;
      }

      const options: AppendTimelineEntryOptions = { type, content, author };
      if (metadata !== undefined) {
        options.metadata = metadata;
      }

      const entry = await projectTimelineService.appendEntry(projectPath, slug, options);

      res.status(201).json({ success: true, entry });
    } catch (error) {
      logError(error, 'POST ceremony-timeline failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

// ---------------------------------------------------------------------------
// GET /api/projects/:slug/ceremony-timeline
// ---------------------------------------------------------------------------

export function createGetCeremonyTimelineHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { slug } = req.params as { slug: string };
      const projectPath = req.query.projectPath as string | undefined;
      const since = req.query.since as string | undefined;
      const limitRaw = req.query.limit as string | undefined;
      const offsetRaw = req.query.offset as string | undefined;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query param is required' });
        return;
      }

      if (since !== undefined && isNaN(new Date(since).getTime())) {
        res.status(400).json({ success: false, error: 'Invalid "since" timestamp' });
        return;
      }

      const limit = limitRaw !== undefined ? parseInt(limitRaw, 10) : undefined;
      const offset = offsetRaw !== undefined ? parseInt(offsetRaw, 10) : undefined;

      if (limit !== undefined && (isNaN(limit) || limit < 0)) {
        res.status(400).json({ success: false, error: 'limit must be a non-negative integer' });
        return;
      }
      if (offset !== undefined && (isNaN(offset) || offset < 0)) {
        res.status(400).json({ success: false, error: 'offset must be a non-negative integer' });
        return;
      }

      const result = await projectTimelineService.getTimeline(projectPath, slug, {
        since,
        limit,
        offset,
      });

      res.json({ success: true, ...result });
    } catch (error) {
      logError(error, 'GET ceremony-timeline failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
