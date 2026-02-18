/**
 * POST /resolve-directory endpoint - Resolve directory path from directory name
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import path from 'path';
import { getErrorMessage, logError } from '../common.js';

export function createResolveDirectoryHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        directoryName,
        sampleFiles,
        fileCount: _fileCount,
      } = req.body as {
        directoryName: string;
        sampleFiles?: string[];
        fileCount?: number;
      };

      if (!directoryName) {
        res.status(400).json({ success: false, error: 'directoryName is required' });
        return;
      }

      // If directoryName looks like an absolute path, try validating it directly
      if (path.isAbsolute(directoryName) || directoryName.includes(path.sep)) {
        try {
          const resolvedPath = path.resolve(directoryName);
          const stats = await secureFs.stat(resolvedPath);
          if (stats.isDirectory()) {
            res.json({
              success: true,
              path: resolvedPath,
            });
            return;
          }
        } catch {
          // Not a valid absolute path, continue to search
        }
      }

      // Search for directory in common locations
      const searchPaths: string[] = [
        process.cwd(), // Current working directory
        process.env.HOME || process.env.USERPROFILE || '', // User home
        path.join(process.env.HOME || process.env.USERPROFILE || '', 'Documents'),
        path.join(process.env.HOME || process.env.USERPROFILE || '', 'Desktop'),
        // Common project locations
        path.join(process.env.HOME || process.env.USERPROFILE || '', 'Projects'),
      ].filter(Boolean);

      // Also check parent of current working directory
      try {
        const parentDir = path.dirname(process.cwd());
        if (!searchPaths.includes(parentDir)) {
          searchPaths.push(parentDir);
        }
      } catch {
        // Ignore
      }

      // Search for directory matching the name and file structure
      for (const searchPath of searchPaths) {
        try {
          const candidatePath = path.join(searchPath, directoryName);
          const stats = await secureFs.stat(candidatePath);

          if (stats.isDirectory()) {
            // Verify it matches by checking for sample files
            if (sampleFiles && sampleFiles.length > 0) {
              let matches = 0;
              for (const sampleFile of sampleFiles.slice(0, 5)) {
                // Remove directory name prefix from sample file path
                const relativeFile = sampleFile.startsWith(directoryName + '/')
                  ? sampleFile.substring(directoryName.length + 1)
                  : sampleFile.split('/').slice(1).join('/') ||
                    sampleFile.split('/').pop() ||
                    sampleFile;

                try {
                  const filePath = path.join(candidatePath, relativeFile);
                  await secureFs.access(filePath);
                  matches++;
                } catch {
                  // File doesn't exist, continue checking
                }
              }

              // If at least one file matches, consider it a match
              if (matches === 0 && sampleFiles.length > 0) {
                continue; // Try next candidate
              }
            }

            // Found matching directory
            res.json({
              success: true,
              path: candidatePath,
            });
            return;
          }
        } catch {
          // Directory doesn't exist at this location, continue searching
          continue;
        }
      }

      // Directory not found
      res.status(404).json({
        success: false,
        error: `Directory "${directoryName}" not found in common locations. Please ensure the directory exists.`,
      });
    } catch (error) {
      logError(error, 'Resolve directory failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
