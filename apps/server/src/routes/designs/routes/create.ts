/**
 * POST /create endpoint - Create a new empty .pen file
 */

import type { Request, Response } from 'express';
import { join, relative, dirname } from 'node:path';
import { writeFile, mkdir, access } from 'node:fs/promises';
import { createLogger } from '@protolabs-ai/utils';
import { validatePath } from '@protolabs-ai/platform';
import type { PenDocument } from './read.js';

const logger = createLogger('DesignsRoutes');

interface CreateRequest {
  projectPath: string;
  filePath: string; // Relative path from projectPath (e.g., "designs/components/new-design.pen")
}

/**
 * Validate that a file path is within the designs/ directory and doesn't traverse up
 */
function validateDesignPath(projectPath: string, filePath: string): string {
  // Ensure filePath starts with designs/
  if (!filePath.startsWith('designs/') && !filePath.startsWith('designs\\')) {
    throw new Error('File path must be within designs/ directory');
  }

  // Construct full path
  const fullPath = join(projectPath, filePath);

  // Validate against ALLOWED_ROOT_DIRECTORY
  validatePath(fullPath);

  // Additional check: ensure the resolved path is still within designs/
  const designsPath = join(projectPath, 'designs');
  const relativePath = relative(designsPath, fullPath);

  if (relativePath.startsWith('..') || relativePath.includes('..')) {
    throw new Error('Path traversal detected');
  }

  return fullPath;
}

/**
 * Create an empty PenDocument with version 2.8
 */
function createEmptyDocument(): PenDocument {
  return {
    version: '2.8',
    children: [],
  };
}

export function createCreateHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, filePath } = req.body as CreateRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      // Validate and construct full path
      let fullPath: string;
      try {
        fullPath = validateDesignPath(projectPath, filePath);
      } catch (error) {
        res.status(403).json({
          success: false,
          error: error instanceof Error ? error.message : 'Path validation failed',
        });
        return;
      }

      // Ensure file has .pen extension
      if (!fullPath.endsWith('.pen')) {
        res.status(400).json({
          success: false,
          error: 'File must have .pen extension',
        });
        return;
      }

      // Check if file already exists
      try {
        await access(fullPath);
        res.status(409).json({
          success: false,
          error: 'File already exists',
        });
        return;
      } catch {
        // File doesn't exist, which is what we want
      }

      // Ensure parent directory exists
      const dir = dirname(fullPath);
      await mkdir(dir, { recursive: true });

      // Create empty document with version 2.8
      const document = createEmptyDocument();
      const content = JSON.stringify(document, null, 2);
      await writeFile(fullPath, content, 'utf-8');

      logger.debug(`Created new .pen file: ${filePath}`);

      res.json({
        success: true,
        filePath,
        document,
      });
    } catch (error) {
      logger.error('Create failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
