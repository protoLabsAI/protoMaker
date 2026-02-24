/**
 * POST /api/context/get endpoint - Read a context file
 *
 * Reads the contents of a specific context file from the .automaker/context/ directory.
 *
 * Request body: `{ projectPath: string, filename: string }`
 * Response: `{ "success": true, "content": string }`
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { getContextDir } from '@protolabs-ai/platform';
import * as secureFs from '../../../lib/secure-fs.js';
import * as path from 'path';

const logger = createLogger('ContextGet');

/**
 * Request body for the get endpoint
 */
interface GetContextFileRequestBody {
  /** Path to the project directory */
  projectPath: string;
  /** Filename of the context file */
  filename: string;
}

/**
 * Response for successful read
 */
interface GetContextFileSuccessResponse {
  success: true;
  content: string;
}

/**
 * Response for errors
 */
interface GetContextFileErrorResponse {
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
 * Create the get context file request handler
 *
 * @returns Express request handler for reading context files
 */
export function createGetContextFileHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, filename } = req.body as GetContextFileRequestBody;

      if (!projectPath || typeof projectPath !== 'string') {
        const response: GetContextFileErrorResponse = {
          success: false,
          error: 'projectPath is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      if (!filename || typeof filename !== 'string') {
        const response: GetContextFileErrorResponse = {
          success: false,
          error: 'filename is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      // Validate filename to prevent path traversal
      if (!isValidContextFilename(filename)) {
        logger.warn(`Invalid context filename: ${filename}`);
        const response: GetContextFileErrorResponse = {
          success: false,
          error: 'Invalid filename - must end in .md or .txt and cannot contain ..',
        };
        res.status(400).json(response);
        return;
      }

      const contextDir = getContextDir(projectPath);
      const filePath = path.join(contextDir, filename);

      // Read the file
      let content: string;
      try {
        const buffer = await secureFs.readFile(filePath);
        content = typeof buffer === 'string' ? buffer : buffer.toString('utf-8');
      } catch (readErr) {
        // File not found
        if (
          readErr !== null &&
          typeof readErr === 'object' &&
          'code' in readErr &&
          readErr.code === 'ENOENT'
        ) {
          logger.warn(`Context file not found: ${filePath}`);
          const response: GetContextFileErrorResponse = {
            success: false,
            error: `Context file not found: ${filename}`,
          };
          res.status(404).json(response);
          return;
        }

        const errorMessage = readErr instanceof Error ? readErr.message : 'Unknown error';
        logger.error(`Failed to read context file: ${errorMessage}`);
        const response: GetContextFileErrorResponse = {
          success: false,
          error: `Failed to read context file: ${errorMessage}`,
        };
        res.status(500).json(response);
        return;
      }

      const response: GetContextFileSuccessResponse = {
        success: true,
        content,
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Get context file failed:', errorMessage);

      const response: GetContextFileErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
