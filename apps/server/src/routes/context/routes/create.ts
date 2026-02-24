/**
 * POST /api/context/create endpoint - Create a new context file
 *
 * Creates a new context file in the .automaker/context/ directory.
 * Auto-creates the directory if it doesn't exist.
 *
 * Request body: `{ projectPath: string, filename: string, content: string }`
 * Response: `{ "success": true }`
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { getContextDir, ensureAutomakerDir } from '@protolabs-ai/platform';
import * as secureFs from '../../../lib/secure-fs.js';
import * as path from 'path';

const logger = createLogger('ContextCreate');

/**
 * Request body for the create endpoint
 */
interface CreateContextFileRequestBody {
  /** Path to the project directory */
  projectPath: string;
  /** Filename for the context file */
  filename: string;
  /** Content of the context file */
  content: string;
}

/**
 * Response for successful creation
 */
interface CreateContextFileSuccessResponse {
  success: true;
}

/**
 * Response for errors
 */
interface CreateContextFileErrorResponse {
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
 * Create the create context file request handler
 *
 * @returns Express request handler for creating context files
 */
export function createCreateContextFileHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, filename, content } = req.body as CreateContextFileRequestBody;

      if (!projectPath || typeof projectPath !== 'string') {
        const response: CreateContextFileErrorResponse = {
          success: false,
          error: 'projectPath is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      if (!filename || typeof filename !== 'string') {
        const response: CreateContextFileErrorResponse = {
          success: false,
          error: 'filename is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      if (content === undefined || typeof content !== 'string') {
        const response: CreateContextFileErrorResponse = {
          success: false,
          error: 'content is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      // Validate filename to prevent path traversal
      if (!isValidContextFilename(filename)) {
        logger.warn(`Invalid context filename: ${filename}`);
        const response: CreateContextFileErrorResponse = {
          success: false,
          error: 'Invalid filename - must end in .md or .txt and cannot contain ..',
        };
        res.status(400).json(response);
        return;
      }

      // Ensure .automaker directory exists
      await ensureAutomakerDir(projectPath);

      const contextDir = getContextDir(projectPath);

      // Create context directory if it doesn't exist
      if (!secureFs.existsSync(contextDir)) {
        logger.info(`Creating context directory: ${contextDir}`);
        await secureFs.mkdir(contextDir, { recursive: true });
      }

      const filePath = path.join(contextDir, filename);

      // Write the file
      try {
        await secureFs.writeFile(filePath, content, 'utf-8');
        logger.info(`Context file created: ${filePath}`);
      } catch (writeErr) {
        const errorMessage = writeErr instanceof Error ? writeErr.message : 'Unknown error';
        logger.error(`Failed to write context file: ${errorMessage}`);
        const response: CreateContextFileErrorResponse = {
          success: false,
          error: `Failed to write context file: ${errorMessage}`,
        };
        res.status(500).json(response);
        return;
      }

      const response: CreateContextFileSuccessResponse = {
        success: true,
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Create context file failed:', errorMessage);

      const response: CreateContextFileErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
