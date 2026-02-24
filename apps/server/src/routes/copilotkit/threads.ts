/**
 * CopilotKit thread management routes
 *
 * Provides CRUD endpoints for managing CopilotKit conversation threads.
 */

import { Router, type Request, type Response } from 'express';
import type { CopilotKitThreadService } from '../../services/copilotkit-thread-service.js';

export function createCopilotKitThreadRoutes(threadService: CopilotKitThreadService): Router {
  const router = Router();

  /**
   * GET /api/copilotkit/threads
   * List threads, optionally filtered by project path
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string | undefined;
      const threads = await threadService.listThreads(projectPath);
      res.json({ threads });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * GET /api/copilotkit/threads/:id
   * Get a single thread by ID
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const threadId = String(req.params.id ?? '');
      const thread = await threadService.getThread(threadId);
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }
      res.json({ thread });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * POST /api/copilotkit/threads
   * Create a new thread
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { id, title, agentName, projectPath } = req.body;
      if (!id) {
        res.status(400).json({ error: 'id is required' });
        return;
      }

      const now = new Date().toISOString();
      const thread = {
        id,
        title: title || 'New Chat',
        agentName,
        projectPath,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
      };

      await threadService.saveThread(thread);
      res.json({ thread });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * PATCH /api/copilotkit/threads/:id
   * Update thread metadata (rename, update message count)
   */
  router.patch('/:id', async (req: Request, res: Response) => {
    try {
      const threadId = String(req.params.id ?? '');
      const { title, messageCount } = req.body;
      const updated = await threadService.updateThread(threadId, { title, messageCount });
      if (!updated) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }
      res.json({ thread: updated });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * DELETE /api/copilotkit/threads/:id
   * Delete a thread
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const threadId = String(req.params.id ?? '');
      const deleted = await threadService.deleteThread(threadId);
      if (!deleted) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
