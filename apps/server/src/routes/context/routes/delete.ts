/**
 * POST /api/context/delete endpoint - Delete a context file
 *
 * Deletes a context file from the .automaker/context/ directory.
 *
 * Request body: `{ projectPath: string, filename: string }`
 * Response: `{ "success": true }`
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { getContextDir } from '@protolabs-ai/platform';
import * as secureFs from '../../../lib/secure-fs.js';
import * as path from 'path';

const logger = createLogger('ContextDelete');

/**
 * Request body for the delete endpoint
 */
interface DeleteContextFileRequestBody {
  /** Path to the project directory */
  projectPath: string;
  /** Filename of the context file to delete */
  filename: string;
}

/**
 * Response for successful deletion
 */
interface DeleteContextFileSuccessResponse {
  success: true;
}

/**
 * Response for errors
 */
interface DeleteContextFileErrorResponse {
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
 * Create the delete context file request handler
 *
 * @returns Express request handler for deleting context files
 */
export function createDeleteContextFileHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, filename } = req.body as DeleteContextFileRequestBody;

      if (!projectPath || typeof projectPath !== 'string') {
        const response: DeleteContextFileErrorResponse = {
          success: false,
          error: 'projectPath is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      if (!filename || typeof filename !== 'string') {
        const response: DeleteContextFileErrorResponse = {
          success: false,
          error: 'filename is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      // Validate filename to prevent path traversal
      if (!isValidContextFilename(filename)) {
        logger.warn(`Invalid context filename: ${filename}`);
        const response: DeleteContextFileErrorResponse = {
          success: false,
          error: 'Invalid filename - must end in .md or .txt and cannot contain ..',
        };
        res.status(400).json(response);
        return;
      }

      const contextDir = getContextDir(projectPath);
      const filePath = path.join(contextDir, filename);

      // Delete the file
      try {
        await secureFs.unlink(filePath);
        logger.info(`Context file deleted: ${filePath}`);
      } catch (unlinkErr) {
        // File not found
        if (
          unlinkErr !== null &&
          typeof unlinkErr === 'object' &&
          'code' in unlinkErr &&
          unlinkErr.code === 'ENOENT'
        ) {
          logger.warn(`Context file not found: ${filePath}`);
          const response: DeleteContextFileErrorResponse = {
            success: false,
            error: `Context file not found: ${filename}`,
          };
          res.status(404).json(response);
          return;
        }

        const errorMessage = unlinkErr instanceof Error ? unlinkErr.message : 'Unknown error';
        logger.error(`Failed to delete context file: ${errorMessage}`);
        const response: DeleteContextFileErrorResponse = {
          success: false,
          error: `Failed to delete context file: ${errorMessage}`,
        };
        res.status(500).json(response);
        return;
      }

      const response: DeleteContextFileSuccessResponse = {
        success: true,
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Delete context file failed:', errorMessage);

      const response: DeleteContextFileErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
