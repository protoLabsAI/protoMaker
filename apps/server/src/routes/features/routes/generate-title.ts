/**
 * POST /features/generate-title endpoint - Generate a concise title from description
 *
 * Uses the provider abstraction to generate a short, descriptive title
 * from a feature description. Works with any configured provider (Claude, Cursor, etc.).
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import { resolvePhaseModel } from '@protolabsai/model-resolver';
import { simpleQuery } from '../../../providers/simple-query-service.js';
import type { SettingsService } from '../../../services/settings-service.js';
import {
  getPromptCustomization,
  getPhaseModelWithOverrides,
} from '../../../lib/settings-helpers.js';
import { captureTrainingRow } from '../../../services/training-capture.js';

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

      // Get customized prompts from settings
      const prompts = await getPromptCustomization(settingsService, '[GenerateTitle]');
      const systemPrompt = prompts.titleGeneration.systemPrompt;

      const userPrompt = `Generate a concise title for this feature:\n\n${trimmedDescription}`;

      // Resolve model via phase-model settings (titleGenerationModel) —
      // defaults to protolabs/nano. Credentials are fetched alongside for the
      // provider abstraction.
      const credentials = await settingsService?.getCredentials();

      const { phaseModel } = await getPhaseModelWithOverrides(
        'titleGenerationModel',
        settingsService,
        projectPath,
        '[GenerateTitle]'
      );
      const { model } = resolvePhaseModel(phaseModel);

      // Use simpleQuery - provider abstraction handles all the streaming/extraction.
      const result = await simpleQuery({
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        model,
        cwd: process.cwd(),
        maxTurns: 1,
        allowedTools: [],
        credentials, // Pass credentials for resolving 'credentials' apiKeySource
      });

      const title = result.text;

      // Capture the input→output pair as training data (non-blocking; #3859).
      if (projectPath && title && title.trim().length > 0) {
        void captureTrainingRow(projectPath, {
          task: 'feature-title',
          model,
          input: { description: trimmedDescription.slice(0, 500) },
          output: title.trim(),
        });
      }

      if (!title || title.trim().length === 0) {
        logger.warn('Received empty response from AI');
        const response: GenerateTitleErrorResponse = {
          success: false,
          error: 'Failed to generate title - empty response',
        };
        res.status(500).json(response);
        return;
      }

      logger.info(`Generated title: ${title.trim()}`);

      const response: GenerateTitleSuccessResponse = {
        success: true,
        title: title.trim(),
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
