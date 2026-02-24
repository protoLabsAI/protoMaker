/**
 * POST /write endpoint - Save a PenDocument to a .pen file
 */

import type { Request, Response } from 'express';
import { join, relative, dirname } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { createLogger } from '@protolabs-ai/utils';
import { validatePath } from '@protolabs-ai/platform';
import type { PenDocument } from './read.js';

const logger = createLogger('DesignsRoutes');

interface WriteRequest {
  projectPath: string;
  filePath: string; // Relative path from projectPath (e.g., "designs/components/my-design.pen")
  document: PenDocument;
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

export function createWriteHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, filePath, document } = req.body as WriteRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      if (!document) {
        res.status(400).json({ success: false, error: 'document is required' });
        return;
      }

      // Validate document has required fields
      if (typeof document !== 'object' || !document.version) {
        res.status(400).json({
          success: false,
          error: 'document must be a valid PenDocument with a version field',
        });
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

      // Ensure parent directory exists
      const dir = dirname(fullPath);
      await mkdir(dir, { recursive: true });

      // Write the document as formatted JSON
      const content = JSON.stringify(document, null, 2);
      await writeFile(fullPath, content, 'utf-8');

      logger.debug(`Wrote .pen file: ${filePath}`);

      res.json({
        success: true,
        filePath,
      });
    } catch (error) {
      logger.error('Write failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
