/**
 * Design file routes
 * Provides API for listing and reading .pen design files
 */

import { Router } from 'express';

export function createDesignsRoutes(): Router {
  const router = Router();

  router.post('/list', createListHandler());
  router.post('/read', createReadHandler());

  return router;
}

// ── List designs ────────────────────────────────────────────

import type { Request, Response } from 'express';
import { readdir, stat } from 'fs/promises';
import { readFile } from 'fs/promises';
import path from 'path';

interface DesignFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DesignFileEntry[];
}

/**
 * Recursively build a directory tree of .pen files under designs/
 */
async function buildTree(dirPath: string, basePath: string): Promise<DesignFileEntry[]> {
  const entries: DesignFileEntry[] = [];

  let items: string[];
  try {
    const dirEntries = await readdir(dirPath, { withFileTypes: true });
    items = dirEntries.map((e) => e.name);
  } catch {
    return entries;
  }

  for (const name of items.sort()) {
    const fullPath = path.join(dirPath, name);
    const relativePath = path.relative(basePath, fullPath);

    let stats;
    try {
      stats = await stat(fullPath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      const children = await buildTree(fullPath, basePath);
      // Only include directories that contain .pen files (directly or nested)
      if (children.length > 0) {
        entries.push({ name, path: relativePath, isDirectory: true, children });
      }
    } else if (name.endsWith('.pen')) {
      entries.push({ name, path: relativePath, isDirectory: false });
    }
  }

  return entries;
}

function createListHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const designsDir = path.join(projectPath, 'designs');

      let dirExists = false;
      try {
        const s = await stat(designsDir);
        dirExists = s.isDirectory();
      } catch {
        dirExists = false;
      }

      if (!dirExists) {
        res.json({ success: true, files: [] });
        return;
      }

      const files = await buildTree(designsDir, designsDir);
      res.json({ success: true, files });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  };
}

// ── Read design ─────────────────────────────────────────────

function createReadHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, filePath } = req.body as {
        projectPath: string;
        filePath: string;
      };

      if (!projectPath || !filePath) {
        res.status(400).json({ success: false, error: 'projectPath and filePath are required' });
        return;
      }

      // Path traversal protection
      const normalized = path.normalize(filePath);
      if (normalized.includes('..') || path.isAbsolute(normalized)) {
        res.status(403).json({ success: false, error: 'Path traversal not allowed' });
        return;
      }

      if (!normalized.endsWith('.pen')) {
        res.status(400).json({ success: false, error: 'Only .pen files can be read' });
        return;
      }

      const fullPath = path.join(projectPath, 'designs', normalized);
      const content = await readFile(fullPath, 'utf-8');

      res.json({ success: true, content });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        res.status(404).json({ success: false, error: 'File not found' });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  };
}
