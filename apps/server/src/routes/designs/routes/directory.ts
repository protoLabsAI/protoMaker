/**
 * POST /directory endpoint - Read directory contents for designs view
 * Provides HTTP fallback for Electron IPC in web mode
 */

import type { Request, Response } from 'express';
import { readdir, stat } from 'node:fs/promises';
import { createLogger } from '@protolabs-ai/utils';
import { validatePath } from '@protolabs-ai/platform';

const logger = createLogger('DesignsDirectoryRoute');

interface DirectoryRequest {
  path: string;
}

interface DirectoryResult {
  success: boolean;
  files?: string[];
  error?: string;
}

interface StatResult {
  success: boolean;
  isDirectory?: boolean;
  isFile?: boolean;
  error?: string;
}

/**
 * Read directory contents and return file/folder names
 * Mimics Electron IPC readDirectory behavior
 */
async function readDirectory(dirPath: string): Promise<DirectoryResult> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files = entries.map((entry) => entry.name);

    return {
      success: true,
      files,
    };
  } catch (error) {
    logger.warn(`Failed to read directory ${dirPath}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get file/directory stats
 * Mimics Electron IPC statFile behavior
 */
async function statFile(filePath: string): Promise<StatResult> {
  try {
    const stats = await stat(filePath);

    return {
      success: true,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function createDirectoryHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { path: dirPath } = req.body as DirectoryRequest;

      if (!dirPath) {
        res.status(400).json({ success: false, error: 'path is required' });
        return;
      }

      // Validate the path is within allowed directories (security check)
      try {
        validatePath(dirPath);
      } catch (error) {
        res.status(403).json({
          success: false,
          error: `Access to directory not allowed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        return;
      }

      // Read the directory
      const result = await readDirectory(dirPath);

      res.json(result);
    } catch (error) {
      logger.error('Directory read failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createStatHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { path: filePath } = req.body as DirectoryRequest;

      if (!filePath) {
        res.status(400).json({ success: false, error: 'path is required' });
        return;
      }

      // Validate the path is within allowed directories (security check)
      try {
        validatePath(filePath);
      } catch (error) {
        res.status(403).json({
          success: false,
          error: `Access to file not allowed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        return;
      }

      // Get file stats
      const result = await statFile(filePath);

      res.json(result);
    } catch (error) {
      logger.error('Stat failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
