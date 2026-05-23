/**
 * Beads Routes — CRUD over a project's `.beads/` issue tracker via the `br` CLI.
 *
 * Storage is owned by `br` (beads_rust). This server is a thin client; see
 * BeadsService for the subprocess details.
 *
 * @see CLAUDE.md — "Local Issue Tracker: `br` (beads)"
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import { validatePath } from '@protolabsai/platform';
import type { CreateBeadsIssueInput, UpdateBeadsIssueInput } from '@protolabsai/types';
import type { BeadsService } from '../../services/beads-service.js';

const logger = createLogger('BeadsRoutes');

export function createBeadsRoutes(beadsService: BeadsService): Router {
  const router = Router();

  router.post('/list', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath: string };
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      validatePath(projectPath);
      const issues = await beadsService.list(projectPath);
      res.json({ success: true, issues });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('list failed:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/ready', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath: string };
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      validatePath(projectPath);
      const issues = await beadsService.ready(projectPath);
      res.json({ success: true, issues });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('ready failed:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/show', async (req: Request, res: Response) => {
    try {
      const { projectPath, id } = req.body as { projectPath: string; id: string };
      if (!projectPath || !id) {
        res.status(400).json({ success: false, error: 'projectPath and id are required' });
        return;
      }
      validatePath(projectPath);
      const issue = await beadsService.show(projectPath, id);
      res.json({ success: true, issue });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('show failed:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/create', async (req: Request, res: Response) => {
    try {
      const { projectPath, input } = req.body as {
        projectPath: string;
        input: CreateBeadsIssueInput;
      };
      if (!projectPath || !input?.title) {
        res.status(400).json({ success: false, error: 'projectPath and input.title are required' });
        return;
      }
      validatePath(projectPath);
      const issue = await beadsService.create(projectPath, input);
      res.json({ success: true, issue });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('create failed:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/update', async (req: Request, res: Response) => {
    try {
      const { projectPath, id, input } = req.body as {
        projectPath: string;
        id: string;
        input: UpdateBeadsIssueInput;
      };
      if (!projectPath || !id || !input) {
        res.status(400).json({ success: false, error: 'projectPath, id, and input are required' });
        return;
      }
      validatePath(projectPath);
      const issue = await beadsService.update(projectPath, id, input);
      res.json({ success: true, issue });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('update failed:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/close', async (req: Request, res: Response) => {
    try {
      const { projectPath, id, reason } = req.body as {
        projectPath: string;
        id: string;
        reason?: string;
      };
      if (!projectPath || !id) {
        res.status(400).json({ success: false, error: 'projectPath and id are required' });
        return;
      }
      validatePath(projectPath);
      const issue = await beadsService.close(projectPath, id, reason);
      res.json({ success: true, issue });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('close failed:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/delete', async (req: Request, res: Response) => {
    try {
      const { projectPath, id } = req.body as { projectPath: string; id: string };
      if (!projectPath || !id) {
        res.status(400).json({ success: false, error: 'projectPath and id are required' });
        return;
      }
      validatePath(projectPath);
      const result = await beadsService.delete(projectPath, id);
      res.json({ success: true, deleted: result.deleted });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('delete failed:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
