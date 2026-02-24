/**
 * GET /directories endpoint - List directories in workspace
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import path from 'path';
import { getAllowedRootDirectory } from '@protolabs-ai/platform';
import { getErrorMessage, logError } from '../common.js';

export function createDirectoriesHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const allowedRootDirectory = getAllowedRootDirectory();

      if (!allowedRootDirectory) {
        res.status(400).json({
          success: false,
          error: 'ALLOWED_ROOT_DIRECTORY is not configured',
        });
        return;
      }

      const resolvedWorkspaceDir = path.resolve(allowedRootDirectory);

      // Check if directory exists
      try {
        await secureFs.stat(resolvedWorkspaceDir);
      } catch {
        res.status(400).json({
          success: false,
          error: 'Workspace directory path does not exist',
        });
        return;
      }

      // Read directory contents
      const entries = await secureFs.readdir(resolvedWorkspaceDir, {
        withFileTypes: true,
      });

      // Filter to directories only and map to result format
      const directories = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => ({
          name: entry.name,
          path: path.join(resolvedWorkspaceDir, entry.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        success: true,
        directories,
      });
    } catch (error) {
      logError(error, 'List workspace directories failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
