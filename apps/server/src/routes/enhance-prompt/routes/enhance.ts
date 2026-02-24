/**
 * POST /enhance-prompt endpoint - Enhance user input text
 *
 * Uses the provider abstraction to enhance text based on the specified
 * enhancement mode. Works with any configured provider (Claude, Cursor, etc.).
 * Supports modes: improve, technical, simplify, acceptance, ux-reviewer
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { resolveModelString } from '@protolabs-ai/model-resolver';
import { CLAUDE_MODEL_MAP, type ThinkingLevel } from '@protolabs-ai/types';
import { simpleQuery } from '../../../providers/simple-query-service.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { getPromptCustomization, getProviderByModelId } from '../../../lib/settings-helpers.js';
import {
  buildUserPrompt,
  isValidEnhancementMode,
  type EnhancementMode,
} from '../../../lib/enhancement-prompts.js';

const logger = createLogger('EnhancePrompt');

/**
 * Request body for the enhance endpoint
 */
interface EnhanceRequestBody {
  /** The original text to enhance */
  originalText: string;
  /** The enhancement mode to apply */
  enhancementMode: string;
  /** Optional model override */
  model?: string;
  /** Optional thinking level for Claude models */
  thinkingLevel?: ThinkingLevel;
  /** Optional project path for per-project Claude API profile */
  projectPath?: string;
}

/**
 * Success response from the enhance endpoint
 */
interface EnhanceSuccessResponse {
  success: true;
  enhancedText: string;
}

/**
 * Error response from the enhance endpoint
 */
interface EnhanceErrorResponse {
  success: false;
  error: string;
}

/**
 * Create the enhance request handler
 *
 * @param settingsService - Optional settings service for loading custom prompts
 * @returns Express request handler for text enhancement
 */
export function createEnhanceHandler(
  settingsService?: SettingsService
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        originalText,
        enhancementMode,
        model,
        thinkingLevel,
        projectPath: _projectPath,
      } = req.body as EnhanceRequestBody;

      // Validate required fields
      if (!originalText || typeof originalText !== 'string') {
        const response: EnhanceErrorResponse = {
          success: false,
          error: 'originalText is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      if (!enhancementMode || typeof enhancementMode !== 'string') {
        const response: EnhanceErrorResponse = {
          success: false,
          error: 'enhancementMode is required and must be a string',
        };
        res.status(400).json(response);
        return;
      }

      // Validate text is not empty
      const trimmedText = originalText.trim();
      if (trimmedText.length === 0) {
        const response: EnhanceErrorResponse = {
          success: false,
          error: 'originalText cannot be empty',
        };
        res.status(400).json(response);
        return;
      }

      // Validate and normalize enhancement mode
      const normalizedMode = enhancementMode.toLowerCase();
      const validMode: EnhancementMode = isValidEnhancementMode(normalizedMode)
        ? normalizedMode
        : 'improve';

      logger.info(`Enhancing text with mode: ${validMode}, length: ${trimmedText.length} chars`);

      // Load enhancement prompts from settings (merges custom + defaults)
      const prompts = await getPromptCustomization(settingsService, '[EnhancePrompt]');

      // Get the system prompt for this mode from merged prompts
      const systemPromptMap: Record<EnhancementMode, string> = {
        improve: prompts.enhancement.improveSystemPrompt,
        technical: prompts.enhancement.technicalSystemPrompt,
        simplify: prompts.enhancement.simplifySystemPrompt,
        acceptance: prompts.enhancement.acceptanceSystemPrompt,
        'ux-reviewer': prompts.enhancement.uxReviewerSystemPrompt,
      };
      const systemPrompt = systemPromptMap[validMode];

      logger.debug(`Using ${validMode} system prompt (length: ${systemPrompt.length} chars)`);

      // Build the user prompt with few-shot examples
      const userPrompt = buildUserPrompt(validMode, trimmedText, true);

      // Check if the model is a provider model (like "GLM-4.5-Air")
      // If so, get the provider config and resolved Claude model
      let claudeCompatibleProvider:
        | import('@protolabs-ai/types').ClaudeCompatibleProvider
        | undefined;
      let providerResolvedModel: string | undefined;
      let credentials = await settingsService?.getCredentials();

      if (model && settingsService) {
        const providerResult = await getProviderByModelId(
          model,
          settingsService,
          '[EnhancePrompt]'
        );
        if (providerResult.provider) {
          claudeCompatibleProvider = providerResult.provider;
          providerResolvedModel = providerResult.resolvedModel;
          credentials = providerResult.credentials;
          logger.info(
            `Using provider "${providerResult.provider.name}" for model "${model}"` +
              (providerResolvedModel ? ` -> resolved to "${providerResolvedModel}"` : '')
          );
        }
      }

      // Resolve the model - use provider resolved model, passed model, or default to sonnet
      const resolvedModel =
        providerResolvedModel || resolveModelString(model, CLAUDE_MODEL_MAP.sonnet);

      logger.debug(`Using model: ${resolvedModel}`);

      // Use simpleQuery - provider abstraction handles routing to correct provider
      // The system prompt is combined with user prompt since some providers
      // don't have a separate system prompt concept
      const result = await simpleQuery({
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        model: resolvedModel,
        cwd: process.cwd(), // Enhancement doesn't need a specific working directory
        maxTurns: 1,
        allowedTools: [],
        thinkingLevel,
        readOnly: true, // Prompt enhancement only generates text, doesn't write files
        credentials, // Pass credentials for resolving 'credentials' apiKeySource
        claudeCompatibleProvider, // Pass provider for alternative endpoint configuration
      });

      const enhancedText = result.text;

      if (!enhancedText || enhancedText.trim().length === 0) {
        logger.warn('Received empty response from AI');
        const response: EnhanceErrorResponse = {
          success: false,
          error: 'Failed to generate enhanced text - empty response',
        };
        res.status(500).json(response);
        return;
      }

      logger.info(`Enhancement complete, output length: ${enhancedText.length} chars`);

      const response: EnhanceSuccessResponse = {
        success: true,
        enhancedText: enhancedText.trim(),
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Enhancement failed:', errorMessage);

      const response: EnhanceErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
