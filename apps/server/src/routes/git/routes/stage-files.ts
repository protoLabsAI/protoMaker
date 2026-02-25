/**
 * POST /api/git/stage-files endpoint
 * Stages specified files for the next commit (git add)
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

export function createStageFilesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, files } = req.body as { projectPath: string; files: string[] };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      if (!Array.isArray(files) || files.length === 0) {
        res
          .status(400)
          .json({ success: false, error: 'files array required and must be non-empty' });
        return;
      }

      // Quote each file path to handle spaces, then join
      const quotedFiles = files.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(' ');

      await execAsync(`git add -- ${quotedFiles}`, { cwd: projectPath });

      res.json({ success: true, stagedCount: files.length });
    } catch (error) {
      logError(error, 'Stage files failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
