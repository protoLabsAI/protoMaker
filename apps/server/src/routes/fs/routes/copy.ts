/**
 * POST /copy endpoint - Copy file or directory
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import { PathNotAllowedError } from '@protolabs-ai/platform';
import { getErrorMessage, logError } from '../common.js';
import fs from 'fs';
import path from 'path';

/**
 * Recursively copy a directory
 */
async function copyDirectory(
  sourcePath: string,
  destinationPath: string,
  overwrite: boolean
): Promise<void> {
  // Create destination directory
  await secureFs.mkdir(destinationPath, { recursive: true });

  // Read source directory entries
  const entries = await secureFs.readdir(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(sourcePath, entry.name);
    const destPath = path.join(destinationPath, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy subdirectory
      await copyDirectory(srcPath, destPath, overwrite);
    } else if (entry.isFile()) {
      // Copy file
      const mode = overwrite
        ? fs.constants.COPYFILE_FICLONE
        : fs.constants.COPYFILE_FICLONE | fs.constants.COPYFILE_EXCL;
      await secureFs.copyFile(srcPath, destPath, mode);
    }
    // Skip symlinks and other special files for safety
  }
}

export function createCopyHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sourcePath, destinationPath, overwrite } = req.body as {
        sourcePath: string;
        destinationPath: string;
        overwrite?: boolean;
      };

      if (!sourcePath) {
        res.status(400).json({ success: false, error: 'sourcePath is required' });
        return;
      }

      if (!destinationPath) {
        res.status(400).json({ success: false, error: 'destinationPath is required' });
        return;
      }

      const shouldOverwrite = overwrite ?? false;

      // Resolve paths to check for path traversal
      const resolvedSource = path.resolve(sourcePath);
      const resolvedDest = path.resolve(destinationPath);

      // Validate paths don't escape allowed directories (secureFs will handle this)
      // Check if source exists and get its type
      const sourceStats = await secureFs.lstat(resolvedSource);

      if (sourceStats.isDirectory()) {
        // Recursive directory copy
        await copyDirectory(resolvedSource, resolvedDest, shouldOverwrite);
      } else if (sourceStats.isFile()) {
        // Single file copy
        const mode = shouldOverwrite
          ? fs.constants.COPYFILE_FICLONE
          : fs.constants.COPYFILE_FICLONE | fs.constants.COPYFILE_EXCL;
        await secureFs.copyFile(resolvedSource, resolvedDest, mode);
      } else {
        res.status(400).json({
          success: false,
          error: 'Source path must be a file or directory',
        });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      // File exists and overwrite is false
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        res.status(400).json({
          success: false,
          error: 'Destination already exists (use overwrite: true to replace)',
        });
        return;
      }

      logError(error, 'Copy file/directory failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
