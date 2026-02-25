/**
 * POST /browse-project-files endpoint - Browse project directory with path validation
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import { PathNotAllowedError } from '@protolabs-ai/platform';
import { getErrorMessage, logError } from '../common.js';
import path from 'path';

interface BrowseEntry {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  isFile: boolean;
}

export function createBrowseProjectFilesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, relativePath, showHidden } = req.body as {
        projectPath: string;
        relativePath?: string;
        showHidden?: boolean;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const resolvedProjectPath = path.resolve(projectPath);

      // Determine the directory to browse
      const targetPath = relativePath
        ? path.resolve(resolvedProjectPath, relativePath)
        : resolvedProjectPath;

      // Security: Ensure target path is within project path
      const normalizedTarget = path.normalize(targetPath);
      const normalizedProject = path.normalize(resolvedProjectPath);

      if (!normalizedTarget.startsWith(normalizedProject)) {
        res.status(403).json({
          success: false,
          error: 'Access denied: path traversal outside project directory',
        });
        return;
      }

      // Read directory entries
      const entries = await secureFs.readdir(targetPath, { withFileTypes: true });

      const shouldShowHidden = showHidden ?? false;

      // Filter and map entries
      const result: BrowseEntry[] = entries
        .filter((entry) => {
          // Filter out hidden files unless showHidden is true
          if (!shouldShowHidden && entry.name.startsWith('.')) {
            return false;
          }
          return true;
        })
        .map((entry) => {
          // Calculate relative path from project root
          const entryAbsolutePath = path.join(targetPath, entry.name);
          const entryRelativePath = path.relative(resolvedProjectPath, entryAbsolutePath);

          return {
            name: entry.name,
            relativePath: entryRelativePath,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile(),
          };
        });

      res.json({ success: true, entries: result });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      // Directory doesn't exist
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).json({
          success: false,
          error: 'Directory does not exist',
        });
        return;
      }

      // Not a directory
      if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') {
        res.status(400).json({
          success: false,
          error: 'Path is not a directory',
        });
        return;
      }

      logError(error, 'Browse project files failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
