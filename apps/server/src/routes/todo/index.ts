/**
 * Todo Routes — CRUD for per-project todo lists and items
 *
 * Storage: .automaker/todos/workspace.json (single file per project)
 * Wraps TodoService which handles all persistence logic.
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import { validatePath } from '@protolabsai/platform';
import { TodoService } from '../../services/todo-service.js';
import type { EventEmitter } from '../../lib/events.js';

const logger = createLogger('TodoRoutes');
const todoService = new TodoService();

export function createTodoRoutes(_events?: EventEmitter): Router {
  const router = Router();

  /**
   * POST /api/todos/list
   * Get all todo lists for a project
   */
  router.post('/list', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath: string };
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      validatePath(projectPath);
      const lists = await todoService.getAllLists(projectPath);
      res.json({ success: true, lists });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to list todo lists:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/todos/create-list
   * Create a new todo list
   */
  router.post('/create-list', async (req: Request, res: Response) => {
    try {
      const { projectPath, name } = req.body as { projectPath: string; name: string };
      if (!projectPath || !name) {
        res.status(400).json({ success: false, error: 'projectPath and name are required' });
        return;
      }
      validatePath(projectPath);
      const list = await todoService.createList(projectPath, name, 'shared');
      res.json({ success: true, list });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create todo list:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/todos/delete-list
   * Delete a todo list
   */
  router.post('/delete-list', async (req: Request, res: Response) => {
    try {
      const { projectPath, listId } = req.body as { projectPath: string; listId: string };
      if (!projectPath || !listId) {
        res.status(400).json({ success: false, error: 'projectPath and listId are required' });
        return;
      }
      validatePath(projectPath);
      await todoService.deleteList(projectPath, listId);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete todo list:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/todos/add-item
   * Add a new item to a list
   */
  router.post('/add-item', async (req: Request, res: Response) => {
    try {
      const { projectPath, listId, title, priority, dueDate, linkedFeatureId } = req.body as {
        projectPath: string;
        listId: string;
        title: string;
        priority?: 0 | 1 | 2 | 3 | 4;
        dueDate?: string;
        linkedFeatureId?: string;
      };
      if (!projectPath || !listId || !title) {
        res.status(400).json({
          success: false,
          error: 'projectPath, listId, and title are required',
        });
        return;
      }
      validatePath(projectPath);
      const item = await todoService.addItem(projectPath, listId, {
        title,
        priority,
        dueDate,
        linkedFeatureId,
      });
      res.json({ success: true, item });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to add todo item:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/todos/update-item
   * Update an existing item
   */
  router.post('/update-item', async (req: Request, res: Response) => {
    try {
      const { projectPath, listId, itemId, updates } = req.body as {
        projectPath: string;
        listId: string;
        itemId: string;
        updates: Record<string, unknown>;
      };
      if (!projectPath || !listId || !itemId || !updates) {
        res
          .status(400)
          .json({ success: false, error: 'projectPath, listId, itemId, and updates are required' });
        return;
      }
      validatePath(projectPath);
      const item = await todoService.updateItem(projectPath, listId, itemId, updates);
      res.json({ success: true, item });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update todo item:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/todos/complete-item
   * Mark an item as completed
   */
  router.post('/complete-item', async (req: Request, res: Response) => {
    try {
      const { projectPath, listId, itemId } = req.body as {
        projectPath: string;
        listId: string;
        itemId: string;
      };
      if (!projectPath || !listId || !itemId) {
        res
          .status(400)
          .json({ success: false, error: 'projectPath, listId, and itemId are required' });
        return;
      }
      validatePath(projectPath);
      const item = await todoService.completeItem(projectPath, listId, itemId);
      res.json({ success: true, item });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to complete todo item:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/todos/delete-item
   * Delete an item from a list
   */
  router.post('/delete-item', async (req: Request, res: Response) => {
    try {
      const { projectPath, listId, itemId } = req.body as {
        projectPath: string;
        listId: string;
        itemId: string;
      };
      if (!projectPath || !listId || !itemId) {
        res
          .status(400)
          .json({ success: false, error: 'projectPath, listId, and itemId are required' });
        return;
      }
      validatePath(projectPath);
      await todoService.deleteItem(projectPath, listId, itemId);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete todo item:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
