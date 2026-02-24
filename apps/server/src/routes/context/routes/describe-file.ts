/**
 * POST /context/describe-file endpoint - Generate description for a text file
 *
 * Uses AI to analyze a text file and generate a concise description
 * suitable for context file metadata. Model is configurable via
 * phaseModels.fileDescriptionModel in settings (defaults to Haiku).
 *
 * SECURITY: This endpoint validates file paths against ALLOWED_ROOT_DIRECTORY
 * and reads file content directly (not via Claude's Read tool) to prevent
 * arbitrary file reads and prompt injection attacks.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { PathNotAllowedError } from '@protolabs-ai/platform';
import { resolvePhaseModel } from '@protolabs-ai/model-resolver';
import { simpleQuery } from '../../../providers/simple-query-service.js';
import * as secureFs from '../../../lib/secure-fs.js';
import * as path from 'path';
import type { SettingsService } from '../../../services/settings-service.js';
import {
  getAutoLoadClaudeMdSetting,
  getPromptCustomization,
  getPhaseModelWithOverrides,
} from '../../../lib/settings-helpers.js';

const logger = createLogger('DescribeFile');

/**
 * Request body for the describe-file endpoint
 */
interface DescribeFileRequestBody {
  /** Path to the file */
  filePath: string;
}

/**
 * Success response from the describe-file endpoint
 */
interface DescribeFileSuccessResponse {
  success: true;
  description: string;
}

/**
 * Error response from the describe-file endpoint
 */
interface DescribeFileErrorResponse {
  success: false;
  error: string;
}

/**
 * Create the describe-file request handler
 *
 * @param settingsService - Optional settings service for loading autoLoadClaudeMd setting
 * @returns Express request handler for file description
 */
export function createDescribeFileHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as DescribeFileRequestBody;

      // Validate required fields
      if (!filePath || typeof filePath !== 'string') {
        const response: DescribeFileErrorResponse = {
          success: false,
          error: 'filePath is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      logger.info(`Starting description generation for: ${filePath}`);

      // Resolve the path for logging and cwd derivation
      const resolvedPath = secureFs.resolvePath(filePath);

      // Read file content using secureFs (validates path against ALLOWED_ROOT_DIRECTORY)
      // This prevents arbitrary file reads (e.g., /etc/passwd, ~/.ssh/id_rsa)
      // and prompt injection attacks where malicious filePath values could inject instructions
      let fileContent: string;
      try {
        const content = await secureFs.readFile(resolvedPath, 'utf-8');
        fileContent = typeof content === 'string' ? content : content.toString('utf-8');
      } catch (readError) {
        // Path not allowed - return 403 Forbidden
        if (readError instanceof PathNotAllowedError) {
          logger.warn(`Path not allowed: ${filePath}`);
          const response: DescribeFileErrorResponse = {
            success: false,
            error: 'File path is not within the allowed directory',
          };
          res.status(403).json(response);
          return;
        }

        // File not found
        if (
          readError !== null &&
          typeof readError === 'object' &&
          'code' in readError &&
          readError.code === 'ENOENT'
        ) {
          logger.warn(`File not found: ${resolvedPath}`);
          const response: DescribeFileErrorResponse = {
            success: false,
            error: `File not found: ${filePath}`,
          };
          res.status(404).json(response);
          return;
        }

        const errorMessage = readError instanceof Error ? readError.message : 'Unknown error';
        logger.error(`Failed to read file: ${errorMessage}`);
        const response: DescribeFileErrorResponse = {
          success: false,
          error: `Failed to read file: ${errorMessage}`,
        };
        res.status(500).json(response);
        return;
      }

      // Truncate very large files to avoid token limits
      const MAX_CONTENT_LENGTH = 50000;
      const truncated = fileContent.length > MAX_CONTENT_LENGTH;
      const contentToAnalyze = truncated
        ? fileContent.substring(0, MAX_CONTENT_LENGTH)
        : fileContent;

      // Get the filename for context
      const fileName = path.basename(resolvedPath);

      // Get customized prompts from settings
      const prompts = await getPromptCustomization(settingsService, '[DescribeFile]');

      // Build prompt with file content passed as structured data
      // The file content is included directly, not via tool invocation
      const prompt = `${prompts.contextDescription.describeFilePrompt}

File: ${fileName}${truncated ? ' (truncated)' : ''}

--- FILE CONTENT ---
${contentToAnalyze}`;

      // Use the file's directory as the working directory
      const cwd = path.dirname(resolvedPath);

      // Load autoLoadClaudeMd setting
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        cwd,
        settingsService,
        '[DescribeFile]'
      );

      // Get model from phase settings with provider info
      const {
        phaseModel: phaseModelEntry,
        provider,
        credentials,
      } = await getPhaseModelWithOverrides(
        'fileDescriptionModel',
        settingsService,
        cwd,
        '[DescribeFile]'
      );
      const { model, thinkingLevel } = resolvePhaseModel(phaseModelEntry);

      logger.info(
        `Resolved model: ${model}, thinkingLevel: ${thinkingLevel}`,
        provider ? `via provider: ${provider.name}` : 'direct API'
      );

      // Use simpleQuery - provider abstraction handles routing to correct provider
      const result = await simpleQuery({
        prompt,
        model,
        cwd,
        maxTurns: 1,
        allowedTools: [],
        thinkingLevel,
        readOnly: true, // File description only reads, doesn't write
        settingSources: autoLoadClaudeMd ? ['user', 'project', 'local'] : undefined,
        claudeCompatibleProvider: provider, // Pass provider for alternative endpoint configuration
        credentials, // Pass credentials for resolving 'credentials' apiKeySource
      });

      const description = result.text;

      if (!description || description.trim().length === 0) {
        logger.warn('Received empty response from Claude');
        const response: DescribeFileErrorResponse = {
          success: false,
          error: 'Failed to generate description - empty response',
        };
        res.status(500).json(response);
        return;
      }

      logger.info(`Description generated, length: ${description.length} chars`);

      const response: DescribeFileSuccessResponse = {
        success: true,
        description: description.trim(),
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('File description failed:', errorMessage);

      const response: DescribeFileErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
