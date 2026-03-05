/**
 * POST /api/app-spec/update endpoint - Update the project spec
 *
 * Writes content to .automaker/spec.md for the given project.
 * Creates the .automaker/ directory if it doesn't exist.
 *
 * Request body: `{ projectPath: string, content: string }`
 * Response: `{ "success": true }`
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import { getAutomakerDir, ensureAutomakerDir } from '@protolabsai/platform';
import * as secureFs from '../../../lib/secure-fs.js';
import * as path from 'path';

const logger = createLogger('AppSpecUpdate');

interface UpdateSpecRequestBody {
  projectPath: string;
  content: string;
}

export function createUpdateSpecHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, content } = req.body as UpdateSpecRequestBody;

      if (!projectPath || typeof projectPath !== 'string') {
        res
          .status(400)
          .json({ success: false, error: 'projectPath is required and must be a string' });
        return;
      }

      if (content === undefined || typeof content !== 'string') {
        res.status(400).json({ success: false, error: 'content is required and must be a string' });
        return;
      }

      await ensureAutomakerDir(projectPath);

      const specPath = path.join(getAutomakerDir(projectPath), 'spec.md');

      try {
        await secureFs.writeFile(specPath, content, 'utf-8');
        logger.info(`Spec updated: ${specPath}`);
      } catch (writeErr) {
        const errorMessage = writeErr instanceof Error ? writeErr.message : 'Unknown error';
        logger.error(`Failed to write spec: ${errorMessage}`);
        res.status(500).json({ success: false, error: `Failed to write spec: ${errorMessage}` });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Update spec failed:', errorMessage);
      res.status(500).json({ success: false, error: errorMessage });
    }
  };
}
