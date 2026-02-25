/**
 * POST /move endpoint - Move/rename file or directory
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import { PathNotAllowedError } from '@protolabs-ai/platform';
import { getErrorMessage, logError } from '../common.js';
import path from 'path';

export function createMoveHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sourcePath, destinationPath } = req.body as {
        sourcePath: string;
        destinationPath: string;
      };

      if (!sourcePath) {
        res.status(400).json({ success: false, error: 'sourcePath is required' });
        return;
      }

      if (!destinationPath) {
        res.status(400).json({ success: false, error: 'destinationPath is required' });
        return;
      }

      // Resolve paths to check for path traversal
      const resolvedSource = path.resolve(sourcePath);
      const resolvedDest = path.resolve(destinationPath);

      // Validate paths don't escape allowed directories (secureFs will handle this)
      // Move/rename using fs.rename which works for both files and directories
      await secureFs.rename(resolvedSource, resolvedDest);

      res.json({ success: true });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      // Source doesn't exist
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).json({
          success: false,
          error: 'Source path does not exist',
        });
        return;
      }

      // Destination already exists
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        res.status(400).json({
          success: false,
          error: 'Destination already exists',
        });
        return;
      }

      logError(error, 'Move/rename failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
