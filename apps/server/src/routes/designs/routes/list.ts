/**
 * POST /list endpoint - Recursively list all .pen files in designs/ directory
 */

import type { Request, Response } from 'express';
import { join, relative } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { createLogger } from '@protolabs-ai/utils';
import { validatePath } from '@protolabs-ai/platform';

const logger = createLogger('DesignsRoutes');

interface ListRequest {
  projectPath: string;
}

interface DesignFileEntry {
  path: string; // Relative path from designs/
  name: string;
  size: number;
  modified: string;
}

/**
 * Recursively find all .pen files in a directory
 */
async function findPenFiles(dirPath: string, basePath: string): Promise<DesignFileEntry[]> {
  const results: DesignFileEntry[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively search subdirectories
        const subResults = await findPenFiles(fullPath, basePath);
        results.push(...subResults);
      } else if (entry.isFile() && entry.name.endsWith('.pen')) {
        const stats = await stat(fullPath);
        const relativePath = relative(basePath, fullPath);

        results.push({
          path: relativePath,
          name: entry.name,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        });
      }
    }
  } catch (error) {
    logger.warn(`Failed to read directory ${dirPath}:`, error);
  }

  return results;
}

export function createListHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as ListRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Construct path to designs/ directory
      const designsPath = join(projectPath, 'designs');

      // Validate the designs path is within allowed directories
      try {
        validatePath(designsPath);
      } catch (error) {
        res.status(403).json({
          success: false,
          error: `Access to designs directory not allowed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        return;
      }

      // Check if designs directory exists
      try {
        const stats = await stat(designsPath);
        if (!stats.isDirectory()) {
          res.status(400).json({
            success: false,
            error: 'designs/ is not a directory',
          });
          return;
        }
      } catch (error) {
        // Directory doesn't exist - return empty list
        res.json({ success: true, files: [] });
        return;
      }

      // Recursively find all .pen files
      const files = await findPenFiles(designsPath, designsPath);

      // Sort by path for consistent ordering
      files.sort((a, b) => a.path.localeCompare(b.path));

      logger.debug(`Found ${files.length} .pen files in ${designsPath}`);

      res.json({ success: true, files });
    } catch (error) {
      logger.error('List failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
