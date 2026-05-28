/**
 * POST /features/generate-title endpoint - Generate a concise title from description
 *
 * Delegates to the shared title-generator service so both this route and
 * the feature create handler use the same logic.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { SettingsService } from '../../../services/settings-service.js';
import { generateFeatureTitle } from '../../../services/title-generator.js';

const logger = createLogger('GenerateTitle');

interface GenerateTitleRequestBody {
  description: string;
  projectPath?: string;
}

interface GenerateTitleSuccessResponse {
  success: true;
  title: string;
}

interface GenerateTitleErrorResponse {
  success: false;
  error: string;
}

export function createGenerateTitleHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { description, projectPath } = req.body as GenerateTitleRequestBody;

      if (!description || typeof description !== 'string') {
        const response: GenerateTitleErrorResponse = {
          success: false,
          error: 'description is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      const trimmedDescription = description.trim();
      if (trimmedDescription.length === 0) {
        const response: GenerateTitleErrorResponse = {
          success: false,
          error: 'description cannot be empty',
        };
        res.status(400).json(response);
        return;
      }

      logger.info(`Generating title for description: ${trimmedDescription.substring(0, 50)}...`);

      const title = await generateFeatureTitle(trimmedDescription, settingsService, projectPath);

      if (!title) {
        logger.warn('Received empty response from AI');
        const response: GenerateTitleErrorResponse = {
          success: false,
          error: 'Failed to generate title - empty response',
        };
        res.status(500).json(response);
        return;
      }

      const response: GenerateTitleSuccessResponse = {
        success: true,
        title,
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Title generation failed:', errorMessage);

      const response: GenerateTitleErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
