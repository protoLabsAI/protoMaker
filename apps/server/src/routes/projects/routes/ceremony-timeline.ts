/**
 * Ceremony timeline routes
 *
 * POST /api/projects/:slug/ceremony-timeline — append a new entry
 * GET  /api/projects/:slug/ceremony-timeline — retrieve paginated entries
 */

import type { Request, Response } from 'express';
import { projectTimelineService } from '../../../services/project-timeline-service.js';
import type { TimelineEntryType, TimelineEntryAuthor } from '@protolabsai/types';

interface PostTimelineBody {
  projectPath: string;
  type: TimelineEntryType;
  content: string;
  author: TimelineEntryAuthor;
  metadata?: Record<string, unknown>;
}

const VALID_TYPES: TimelineEntryType[] = [
  'standup',
  'retro',
  'status_report',
  'decision',
  'escalation',
  'milestone_complete',
];

const VALID_AUTHORS: TimelineEntryAuthor[] = ['pm', 'ava', 'operator', 'lead-engineer'];

export function createPostCeremonyTimelineHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { slug } = req.params as { slug: string };
      const { projectPath, type, content, author, metadata } = req.body as PostTimelineBody;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      if (!slug) {
        res.status(400).json({ success: false, error: 'Project slug is required' });
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

      const entry = await projectTimelineService.appendEntry(projectPath, slug, {
        type,
        content,
        author,
        ...(metadata !== undefined ? { metadata } : {}),
      });

      res.status(201).json({ success: true, entry });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  };
}

export function createGetCeremonyTimelineHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { slug } = req.params as { slug: string };
      const projectPath = req.query.projectPath as string | undefined;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query param is required' });
        return;
      }
      if (!slug) {
        res.status(400).json({ success: false, error: 'Project slug is required' });
        return;
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      if (isNaN(page) || page < 1) {
        res.status(400).json({ success: false, error: 'page must be a positive integer' });
        return;
      }
      if (isNaN(limit) || limit < 1 || limit > 100) {
        res.status(400).json({ success: false, error: 'limit must be between 1 and 100' });
        return;
      }

      const result = await projectTimelineService.getTimeline(projectPath, slug, { page, limit });

      res.json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  };
}
