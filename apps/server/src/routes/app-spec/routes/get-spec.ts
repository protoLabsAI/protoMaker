/**
 * POST /api/app-spec/get endpoint - Read the project spec
 *
 * Reads the contents of .automaker/spec.md for the given project.
 *
 * Request body: `{ projectPath: string }`
 * Response: `{ "success": true, "content": string }`
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import { getAutomakerDir } from '@protolabsai/platform';
import * as secureFs from '../../../lib/secure-fs.js';
import * as path from 'path';

const logger = createLogger('AppSpecGet');

interface GetSpecRequestBody {
  projectPath: string;
}

export function createGetSpecHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as GetSpecRequestBody;

      if (!projectPath || typeof projectPath !== 'string') {
        res
          .status(400)
          .json({ success: false, error: 'projectPath is required and must be a string' });
        return;
      }

      const specPath = path.join(getAutomakerDir(projectPath), 'spec.md');

      let content: string;
      try {
        const buffer = await secureFs.readFile(specPath);
        content = typeof buffer === 'string' ? buffer : buffer.toString('utf-8');
      } catch (readErr) {
        if (
          readErr !== null &&
          typeof readErr === 'object' &&
          'code' in readErr &&
          readErr.code === 'ENOENT'
        ) {
          res.status(404).json({ success: false, error: 'Project spec not found' });
          return;
        }

        const errorMessage = readErr instanceof Error ? readErr.message : 'Unknown error';
        logger.error(`Failed to read spec: ${errorMessage}`);
        res.status(500).json({ success: false, error: `Failed to read spec: ${errorMessage}` });
        return;
      }

      res.json({ success: true, content });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Get spec failed:', errorMessage);
      res.status(500).json({ success: false, error: errorMessage });
    }
  };
}
