/**
 * Content routes - HTTP API for content creation pipeline
 *
 * Provides endpoints for managing content creation flows including:
 * - Flow execution (create, status, resume)
 * - HITL review submission
 * - Content listing and export
 */

import { Router, type Request, type Response } from 'express';
import { contentFlowService } from '../../services/content-flow-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('ContentRoutes');

/**
 * Create the content router
 */
export function createContentRoutes(): Router {
  const router = Router();

  /**
   * POST /api/content/create
   * Start a new content creation flow
   */
  router.post('/create', async (req: Request, res: Response) => {
    try {
      const { projectPath, topic, contentConfig } = req.body;

      if (!projectPath || !topic) {
        res.status(400).json({ error: 'projectPath and topic are required' });
        return;
      }

      const result = await contentFlowService.startFlow(projectPath, topic, contentConfig || {});

      res.json(result);
    } catch (error: any) {
      logger.error('Create flow error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/content/status
   * Get status of a content flow run
   */
  router.post('/status', async (req: Request, res: Response) => {
    try {
      const { runId } = req.body;

      if (!runId) {
        res.status(400).json({ error: 'runId is required' });
        return;
      }

      const status = contentFlowService.getStatus(runId);

      if (!status) {
        res.status(404).json({ error: `Flow ${runId} not found` });
        return;
      }

      res.json(status);
    } catch (error: any) {
      logger.error('Get status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/content/list
   * List all generated content
   */
  router.post('/list', async (req: Request, res: Response) => {
    try {
      const { projectPath, filters } = req.body;

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath is required' });
        return;
      }

      const content = await contentFlowService.listContent(projectPath, filters);

      res.json({ content });
    } catch (error: any) {
      logger.error('List content error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/content/review
   * Submit HITL review at interrupt gates
   */
  router.post('/review', async (req: Request, res: Response) => {
    try {
      const { projectPath, runId, gate, decision, feedback } = req.body;

      if (!projectPath || !runId || !gate || !decision) {
        res.status(400).json({ error: 'projectPath, runId, gate, and decision are required' });
        return;
      }

      const validGates = ['research_hitl', 'outline_hitl', 'final_review_hitl'];
      if (!validGates.includes(gate)) {
        res.status(400).json({ error: `Invalid gate. Must be one of: ${validGates.join(', ')}` });
        return;
      }

      const validDecisions = ['approve', 'revise', 'reject'];
      if (!validDecisions.includes(decision)) {
        res
          .status(400)
          .json({ error: `Invalid decision. Must be one of: ${validDecisions.join(', ')}` });
        return;
      }

      const result = await contentFlowService.resumeFlow(projectPath, runId, {
        gate,
        decision,
        feedback,
      });

      res.json(result);
    } catch (error: any) {
      logger.error('Review flow error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/content/export
   * Export content in specific format
   */
  router.post('/export', async (req: Request, res: Response) => {
    try {
      const { projectPath, runId, format } = req.body;

      if (!projectPath || !runId || !format) {
        res.status(400).json({ error: 'projectPath, runId, and format are required' });
        return;
      }

      const validFormats = ['markdown', 'hf-dataset', 'jsonl', 'frontmatter-md'];
      if (!validFormats.includes(format)) {
        res
          .status(400)
          .json({ error: `Invalid format. Must be one of: ${validFormats.join(', ')}` });
        return;
      }

      const result = await contentFlowService.exportContent(projectPath, runId, format);

      res.json(result);
    } catch (error: any) {
      logger.error('Export content error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
