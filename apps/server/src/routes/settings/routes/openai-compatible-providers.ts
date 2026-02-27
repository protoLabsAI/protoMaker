/**
 * OpenAI-Compatible Provider Settings Routes
 *
 * CRUD endpoints for managing OpenAI-compatible provider configurations.
 * These providers support any endpoint implementing the OpenAI Chat Completions API.
 *
 * Endpoints:
 * - POST /api/settings/openai-compatible-providers/list   - List all configured providers
 * - POST /api/settings/openai-compatible-providers/create - Create a new provider
 * - POST /api/settings/openai-compatible-providers/update - Update an existing provider
 * - POST /api/settings/openai-compatible-providers/delete - Delete a provider
 */

import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { SettingsService } from '../../../services/settings-service.js';
import type { OpenAICompatibleConfig } from '../../../types/settings.js';
import { getErrorMessage, logError, logger } from '../common.js';

/**
 * POST /api/settings/openai-compatible-providers/list
 *
 * Returns all configured OpenAI-compatible providers.
 */
export function createListOpenAICompatibleProvidersHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const settings = await settingsService.getGlobalSettings();
      const providers = settings.openaiCompatibleProviders ?? [];

      res.json({
        success: true,
        providers,
      });
    } catch (error) {
      logError(error, 'List OpenAI-compatible providers failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * POST /api/settings/openai-compatible-providers/create
 *
 * Creates a new OpenAI-compatible provider configuration.
 * Assigns a new UUID if not provided in the request body.
 *
 * Request body: Omit<OpenAICompatibleConfig, 'id'> (id is auto-generated)
 * Response: { success: true, provider: OpenAICompatibleConfig }
 */
export function createCreateOpenAICompatibleProviderHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as Partial<OpenAICompatibleConfig>;

      if (!body || typeof body !== 'object') {
        res.status(400).json({ success: false, error: 'Invalid request body' });
        return;
      }

      if (!body.name || typeof body.name !== 'string') {
        res.status(400).json({ success: false, error: 'Missing required field: name' });
        return;
      }

      if (!body.baseUrl || typeof body.baseUrl !== 'string') {
        res.status(400).json({ success: false, error: 'Missing required field: baseUrl' });
        return;
      }

      // Create the new provider config with a generated UUID
      const newProvider: OpenAICompatibleConfig = {
        id: body.id ?? uuidv4(),
        name: body.name,
        enabled: body.enabled ?? true,
        baseUrl: body.baseUrl,
        apiKeySource: body.apiKeySource ?? 'inline',
        apiKey: body.apiKey,
        timeoutMs: body.timeoutMs,
        models: body.models ?? [],
      };

      const settings = await settingsService.getGlobalSettings();
      const existingProviders = settings.openaiCompatibleProviders ?? [];

      // Check for duplicate ID
      if (existingProviders.some((p) => p.id === newProvider.id)) {
        res.status(409).json({
          success: false,
          error: `Provider with id "${newProvider.id}" already exists`,
        });
        return;
      }

      const updatedProviders = [...existingProviders, newProvider];
      await settingsService.updateGlobalSettings({ openaiCompatibleProviders: updatedProviders });

      logger.info(`Created OpenAI-compatible provider: ${newProvider.name} (${newProvider.id})`);

      res.json({ success: true, provider: newProvider });
    } catch (error) {
      logError(error, 'Create OpenAI-compatible provider failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * POST /api/settings/openai-compatible-providers/update
 *
 * Updates an existing OpenAI-compatible provider configuration.
 *
 * Request body: OpenAICompatibleConfig (id is required to identify the provider)
 * Response: { success: true, provider: OpenAICompatibleConfig }
 */
export function createUpdateOpenAICompatibleProviderHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as Partial<OpenAICompatibleConfig>;

      if (!body || typeof body !== 'object') {
        res.status(400).json({ success: false, error: 'Invalid request body' });
        return;
      }

      if (!body.id || typeof body.id !== 'string') {
        res.status(400).json({ success: false, error: 'Missing required field: id' });
        return;
      }

      const settings = await settingsService.getGlobalSettings();
      const existingProviders = settings.openaiCompatibleProviders ?? [];

      const index = existingProviders.findIndex((p) => p.id === body.id);
      if (index === -1) {
        res.status(404).json({
          success: false,
          error: `Provider with id "${body.id}" not found`,
        });
        return;
      }

      // Merge the update with the existing provider
      const updatedProvider: OpenAICompatibleConfig = {
        ...existingProviders[index],
        ...body,
        id: existingProviders[index].id, // Ensure ID cannot be changed
      };

      const updatedProviders = [
        ...existingProviders.slice(0, index),
        updatedProvider,
        ...existingProviders.slice(index + 1),
      ];

      await settingsService.updateGlobalSettings({ openaiCompatibleProviders: updatedProviders });

      logger.info(
        `Updated OpenAI-compatible provider: ${updatedProvider.name} (${updatedProvider.id})`
      );

      res.json({ success: true, provider: updatedProvider });
    } catch (error) {
      logError(error, 'Update OpenAI-compatible provider failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * POST /api/settings/openai-compatible-providers/delete
 *
 * Deletes an OpenAI-compatible provider configuration by ID.
 *
 * Request body: { id: string }
 * Response: { success: true }
 */
export function createDeleteOpenAICompatibleProviderHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as { id?: string };

      if (!body || typeof body !== 'object') {
        res.status(400).json({ success: false, error: 'Invalid request body' });
        return;
      }

      if (!body.id || typeof body.id !== 'string') {
        res.status(400).json({ success: false, error: 'Missing required field: id' });
        return;
      }

      const settings = await settingsService.getGlobalSettings();
      const existingProviders = settings.openaiCompatibleProviders ?? [];

      const index = existingProviders.findIndex((p) => p.id === body.id);
      if (index === -1) {
        res.status(404).json({
          success: false,
          error: `Provider with id "${body.id}" not found`,
        });
        return;
      }

      const removedProvider = existingProviders[index];
      const updatedProviders = existingProviders.filter((p) => p.id !== body.id);

      await settingsService.updateGlobalSettings({ openaiCompatibleProviders: updatedProviders });

      logger.info(
        `Deleted OpenAI-compatible provider: ${removedProvider.name} (${removedProvider.id})`
      );

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete OpenAI-compatible provider failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
