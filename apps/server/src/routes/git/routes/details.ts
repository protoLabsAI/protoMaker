/**
 * POST /api/git/details endpoint
 * Returns the last commit info for a specific file (hash, message, author, timestamp)
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

interface FileCommitDetails {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  timestamp: string;
  isoDate: string;
}

export function createFileDetailsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, filePath } = req.body as { projectPath: string; filePath: string };

      if (!projectPath || !filePath) {
        res.status(400).json({ success: false, error: 'projectPath and filePath required' });
        return;
      }

      try {
        const { stdout } = await execAsync(
          `git log -1 --format="%H%x00%h%x00%s%x00%an%x00%ai%x00%aI" -- "${filePath.replace(/"/g, '\\"')}"`,
          { cwd: projectPath }
        );

        if (!stdout.trim()) {
          res.json({ success: true, details: null });
          return;
        }

        const parts = stdout.trim().split('\0');
        const details: FileCommitDetails = {
          hash: parts[0] ?? '',
          shortHash: parts[1] ?? '',
          message: parts[2] ?? '',
          author: parts[3] ?? '',
          timestamp: parts[4] ?? '',
          isoDate: parts[5] ?? '',
        };

        res.json({ success: true, details });
      } catch (innerError) {
        logError(innerError, 'Git file details failed');
        res.json({ success: true, details: null });
      }
    } catch (error) {
      logError(error, 'File details failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
