/**
 * POST /api/context/list endpoint - List all context files in a project
 *
 * Lists all context files (.md and .txt) in the .automaker/context/ directory.
 * These files are injected into agent prompts during feature execution.
 *
 * Request body: `{ projectPath: string }`
 * Response: `{ "success": true, "files": Array<{ name: string, size: number }> }`
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { getContextDir } from '@protolabs-ai/platform';
import * as secureFs from '../../../lib/secure-fs.js';
import * as path from 'path';

const logger = createLogger('ContextList');

/**
 * Request body for the list endpoint
 */
interface ListContextFilesRequestBody {
  /** Path to the project directory */
  projectPath: string;
}

/**
 * Response for successful listing
 */
interface ListContextFilesSuccessResponse {
  success: true;
  files: Array<{ name: string; size: number }>;
}

/**
 * Response for errors
 */
interface ListContextFilesErrorResponse {
  success: false;
  error: string;
}

/**
 * Validate filename to prevent path traversal
 * - No `..` allowed
 * - Must end in `.md` or `.txt`
 */
function isValidContextFilename(filename: string): boolean {
  if (filename.includes('..')) {
    return false;
  }
  return filename.endsWith('.md') || filename.endsWith('.txt');
}

/**
 * Create the list context files request handler
 *
 * @returns Express request handler for listing context files
 */
export function createListContextFilesHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as ListContextFilesRequestBody;

      if (!projectPath || typeof projectPath !== 'string') {
        const response: ListContextFilesErrorResponse = {
          success: false,
          error: 'projectPath is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      const contextDir = getContextDir(projectPath);

      // Check if context directory exists
      if (!secureFs.existsSync(contextDir)) {
        logger.info(`Context directory does not exist: ${contextDir}`);
        const response: ListContextFilesSuccessResponse = {
          success: true,
          files: [],
        };
        res.json(response);
        return;
      }

      // Read directory contents
      const entries = await secureFs.readdir(contextDir, { withFileTypes: true });

      // Filter for markdown and text files
      const files: Array<{ name: string; size: number }> = [];

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        const filename = entry.name;

        // Validate filename
        if (!isValidContextFilename(filename)) {
          logger.warn(`Skipping invalid context filename: ${filename}`);
          continue;
        }

        // Get file size
        const filePath = path.join(contextDir, filename);
        try {
          const stat = await secureFs.stat(filePath);
          files.push({
            name: filename,
            size: Number(stat.size),
          });
        } catch (statErr) {
          logger.warn(`Failed to stat context file ${filename}: ${String(statErr)}`);
        }
      }

      const response: ListContextFilesSuccessResponse = {
        success: true,
        files,
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('List context files failed:', errorMessage);

      const response: ListContextFilesErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
