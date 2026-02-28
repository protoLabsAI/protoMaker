/**
 * OpenAI-Compatible Provider - Executes queries using the OpenAI API format
 *
 * Supports any provider that implements the OpenAI Chat Completions API,
 * including Ollama, LM Studio, Together AI, and other compatible endpoints.
 * Configuration is read from global settings (openaiCompatibleProviders array).
 */

import OpenAI from 'openai';
import { BaseProvider } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';
import type { OpenAICompatibleConfig } from '@protolabs-ai/types';
import { SettingsService } from '../services/settings-service.js';
import { getDataDirectory } from '@protolabs-ai/platform';

/** Prefix used to identify OpenAI-compatible models in the routing system */
const OPENAI_COMPAT_PREFIX = 'openai-compat/';

/**
 * Check if a model string represents an OpenAI-compatible model
 *
 * @param model - Model string to check
 * @returns true if the model is handled by the OpenAI-compatible provider
 */
export function isOpenAICompatibleModel(model: string | undefined | null): boolean {
  if (!model || typeof model !== 'string') return false;
  return model.startsWith(OPENAI_COMPAT_PREFIX);
}

/**
 * Strip the provider prefix from an OpenAI-compatible model string
 * to get the bare model ID used in API calls.
 *
 * @param model - Model string (e.g., "openai-compat/llama3.2")
 * @returns Bare model ID (e.g., "llama3.2")
 */
function stripPrefix(model: string): string {
  return model.startsWith(OPENAI_COMPAT_PREFIX) ? model.slice(OPENAI_COMPAT_PREFIX.length) : model;
}

/**
 * Create a SettingsService instance using the configured data directory
 */
function createSettingsService(): SettingsService {
  const dataDir = getDataDirectory() ?? process.env.DATA_DIR ?? process.cwd();
  return new SettingsService(dataDir);
}

/**
 * Get all enabled OpenAI-compatible provider configurations from global settings
 */
async function getEnabledProviders(): Promise<OpenAICompatibleConfig[]> {
  const settingsService = createSettingsService();
  const settings = await settingsService.getGlobalSettings();
  return (settings.openaiCompatibleProviders ?? []).filter((p) => p.enabled !== false);
}

/**
 * Find the provider config that has a given model ID configured
 *
 * @param modelId - Bare model ID (without prefix)
 * @param providers - List of enabled provider configs to search
 * @returns The first matching provider config, or undefined
 */
function findProviderForModel(
  modelId: string,
  providers: OpenAICompatibleConfig[]
): OpenAICompatibleConfig | undefined {
  return providers.find((p) => p.models.some((m) => m.id === modelId));
}

export class OpenAICompatibleProvider extends BaseProvider {
  getName(): string {
    return 'openai-compatible';
  }

  /**
   * Execute a query using the OpenAI-compatible streaming API
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const { model } = options;

    // Strip the prefix to get the actual model ID used in API calls
    const bareModel = stripPrefix(model);

    // Load all enabled providers from settings
    const enabledProviders = await getEnabledProviders();

    // Find the provider config that has this model
    const providerConfig = findProviderForModel(bareModel, enabledProviders);

    if (!providerConfig) {
      throw new Error(
        `No enabled OpenAI-compatible provider found for model "${bareModel}". ` +
          `Configure a provider with this model in Settings > Providers > OpenAI Compatible.`
      );
    }

    // Resolve the API key
    let apiKey: string | undefined;
    const source = providerConfig.apiKeySource ?? 'inline';

    if (source === 'inline') {
      apiKey = providerConfig.apiKey;
    } else if (source === 'env') {
      apiKey = process.env.OPENAI_API_KEY;
    } else if (source === 'credentials') {
      const settingsService = createSettingsService();
      const credentials = await settingsService.getCredentials();
      apiKey = credentials.apiKeys.openai;
    }

    // Some providers (like Ollama) don't require an API key - use a placeholder
    const resolvedApiKey = apiKey || 'no-api-key-required';

    // Create the OpenAI client with configurable baseURL
    const client = new OpenAI({
      apiKey: resolvedApiKey,
      baseURL: providerConfig.baseUrl,
      timeout: providerConfig.timeoutMs ?? 300000,
    });

    // Build the messages array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Add system prompt if present
    if (options.systemPrompt && typeof options.systemPrompt === 'string') {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    // Add conversation history if present
    if (options.conversationHistory && options.conversationHistory.length > 0) {
      for (const msg of options.conversationHistory) {
        messages.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    }

    // Build the prompt text
    const promptText = Array.isArray(options.prompt)
      ? options.prompt
          .map((p) => (p.type === 'text' && p.text ? p.text : ''))
          .filter(Boolean)
          .join('\n')
      : options.prompt;

    // Add the user message
    messages.push({ role: 'user', content: promptText });

    // Create the streaming chat completion
    const stream = await client.chat.completions.create({
      model: bareModel,
      messages,
      stream: true,
    });

    let hasContent = false;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        hasContent = true;
        const text = delta.content;

        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text }],
          },
        } satisfies ProviderMessage;
      }
    }

    // Yield a final success result message
    yield {
      type: 'result',
      subtype: 'success',
      result: hasContent ? 'Query completed successfully' : '',
    } satisfies ProviderMessage;
  }

  /**
   * Detect installation: checks if any OpenAI-compatible providers are configured and enabled
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const enabledProviders = await getEnabledProviders();
    const hasEnabledProviders = enabledProviders.length > 0;

    return {
      installed: true, // The package is always available
      method: 'sdk',
      hasApiKey: hasEnabledProviders,
      authenticated: hasEnabledProviders,
    };
  }

  /**
   * Get available models from all enabled OpenAI-compatible provider configs
   */
  getAvailableModels(): ModelDefinition[] {
    // Note: This method is synchronous but we need settings.
    // We return an empty array here — the async version is available via getAvailableModelsAsync().
    // The models are registered in the UI from the settings directly.
    return [];
  }

  /**
   * Get available models asynchronously from all enabled provider configs
   */
  async getAvailableModelsAsync(): Promise<ModelDefinition[]> {
    const enabledProviders = await getEnabledProviders();
    const models: ModelDefinition[] = [];

    for (const provider of enabledProviders) {
      for (const model of provider.models) {
        models.push({
          id: `${OPENAI_COMPAT_PREFIX}${model.id}`,
          name: model.displayName,
          modelString: model.id,
          provider: 'openai-compatible',
          description: `${model.displayName} via ${provider.name}`,
          supportsVision: model.capabilities?.supportsVision ?? false,
          supportsTools: false,
          tier: 'standard',
        });
      }
    }

    return models;
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['text'];
    return supportedFeatures.includes(feature);
  }
}
