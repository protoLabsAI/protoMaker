/**
 * POST /read endpoint - Read and parse a .pen file
 */

import type { Request, Response } from 'express';
import { join, relative, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createLogger } from '@protolabs-ai/utils';
import { validatePath } from '@protolabs-ai/platform';

const logger = createLogger('DesignsRoutes');

interface ReadRequest {
  projectPath: string;
  filePath: string; // Relative path from projectPath (e.g., "designs/components/shadcn-kit.pen")
}

/**
 * PenDocument represents the structure of a .pen file
 * Based on the Penpot/similar design tool format
 */
export interface PenDocument {
  version: string;
  children?: unknown[];
  [key: string]: unknown;
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

export function createReadHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, filePath } = req.body as ReadRequest;

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

      // Read and parse the file
      try {
        const content = await readFile(fullPath, 'utf-8');
        const document = JSON.parse(content) as PenDocument;

        logger.debug(`Read .pen file: ${filePath}`);

        res.json({
          success: true,
          document,
          filePath,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          res.status(404).json({
            success: false,
            error: 'File not found',
          });
          return;
        }

        if (error instanceof SyntaxError) {
          res.status(400).json({
            success: false,
            error: 'Invalid JSON in .pen file',
          });
          return;
        }

        throw error;
      }
    } catch (error) {
      logger.error('Read failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
