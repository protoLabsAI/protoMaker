/**
 * Categories Routes — CRUD for the per-project categories list
 *
 * Storage: .automaker/categories.json (simple string array per project)
 * Every mutation broadcasts a `categories:updated` event so the CRDT sync
 * bridge can propagate the full array to remote instances (LWW semantics).
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import { validatePath } from '@protolabsai/platform';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import type { EventEmitter } from '../../lib/events.js';

const logger = createLogger('CategoriesRoutes');

function getCategoriesPath(projectPath: string): string {
  return join(projectPath, '.automaker', 'categories.json');
}

async function readCategories(projectPath: string): Promise<string[]> {
  try {
    const raw = await readFile(getCategoriesPath(projectPath), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

async function writeCategories(projectPath: string, categories: string[]): Promise<void> {
  await writeFile(getCategoriesPath(projectPath), JSON.stringify(categories, null, 2), 'utf-8');
}

export function createCategoriesRoutes(events: EventEmitter): Router {
  const router = Router();

  /**
   * POST /api/categories/list
   * Returns the full categories array for a project.
   */
  router.post('/list', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath?: string };
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      validatePath(projectPath);
      const categories = await readCategories(projectPath);
      res.json({ success: true, categories });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to list categories:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/categories/create
   * Adds a new category to the list and broadcasts `categories:updated`.
   */
  router.post('/create', async (req: Request, res: Response) => {
    try {
      const { projectPath, category } = req.body as {
        projectPath?: string;
        category?: string;
      };
      if (!projectPath || !category) {
        res.status(400).json({ success: false, error: 'projectPath and category are required' });
        return;
      }
      validatePath(projectPath);
      const existing = await readCategories(projectPath);
      if (existing.includes(category)) {
        res.status(409).json({ success: false, error: 'Category already exists' });
        return;
      }
      const updated = [...existing, category];
      await writeCategories(projectPath, updated);
      events.broadcast('categories:updated', { projectPath, categories: updated });
      logger.info(`Category created: "${category}" in ${projectPath}`);
      res.json({ success: true, categories: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create category:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/categories/delete
   * Removes a category from the list and broadcasts `categories:updated`.
   */
  router.post('/delete', async (req: Request, res: Response) => {
    try {
      const { projectPath, category } = req.body as {
        projectPath?: string;
        category?: string;
      };
      if (!projectPath || !category) {
        res.status(400).json({ success: false, error: 'projectPath and category are required' });
        return;
      }
      validatePath(projectPath);
      const existing = await readCategories(projectPath);
      const updated = existing.filter((c) => c !== category);
      if (updated.length === existing.length) {
        res.status(404).json({ success: false, error: 'Category not found' });
        return;
      }
      await writeCategories(projectPath, updated);
      events.broadcast('categories:updated', { projectPath, categories: updated });
      logger.info(`Category deleted: "${category}" from ${projectPath}`);
      res.json({ success: true, categories: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete category:', error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
