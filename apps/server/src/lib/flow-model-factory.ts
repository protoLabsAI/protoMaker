/**
 * Flow Model Factory
 *
 * Creates LangChain BaseChatModel instances for use in LangGraph flows.
 * Reads model configuration from settings via getPhaseModelWithOverrides,
 * supporting Claude (Anthropic), Groq, and OpenAI-compatible providers.
 *
 * Usage:
 *   const model = await createFlowModel('specGenerationModel', projectPath, services);
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';
import { createLogger } from '@protolabs-ai/utils';
import { resolvePhaseModel } from '@protolabs-ai/model-resolver';
import type { PhaseModelKey, ClaudeCompatibleProvider, Credentials } from '@protolabs-ai/types';
import { getPhaseModelWithOverrides } from './settings-helpers.js';
import type { SettingsService } from '../services/settings-service.js';

const logger = createLogger('FlowModelFactory');

/**
 * Groq model patterns — these model IDs are served via Groq's fast inference API.
 * Matches llama-*, mixtral-*, gemma-* prefixes and the groq/ explicit prefix.
 */
const GROQ_MODEL_PREFIXES = ['llama-', 'mixtral-', 'gemma-'];

function isGroqModel(model: string): boolean {
  return (
    model.startsWith('groq/') || GROQ_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix))
  );
}

/**
 * Resolve the API key for a ClaudeCompatibleProvider based on its apiKeySource strategy.
 */
function resolveProviderApiKey(
  provider: ClaudeCompatibleProvider,
  credentials: Credentials | undefined
): string | undefined {
  switch (provider.apiKeySource) {
    case 'inline':
      return provider.apiKey;
    case 'env':
      return process.env.ANTHROPIC_API_KEY;
    case 'credentials':
      return credentials?.apiKeys?.anthropic || undefined;
    default:
      return undefined;
  }
}

/**
 * Create a LangChain BaseChatModel for a given phase, resolved from settings.
 *
 * Resolution order:
 * 1. Project-level phase model override (if projectPath provided)
 * 2. Global phase model setting
 * 3. Default phase model (from DEFAULT_PHASE_MODELS)
 *
 * Model routing:
 * - claude-* models → ChatAnthropic (with optional provider baseURL/apiKey)
 * - llama-*, mixtral-*, gemma-*, groq/* → ChatGroq
 * - All other models with a provider → ChatOpenAI (OpenAI-compatible)
 * - Unknown/no-provider fallback → ChatAnthropic with claude-sonnet
 *
 * @param phase - The phase key (e.g., 'specGenerationModel', 'fileDescriptionModel')
 * @param projectPath - Optional project path for project-level overrides
 * @param services - Services container providing settingsService
 * @returns Resolved BaseChatModel instance
 */
export async function createFlowModel(
  phase: PhaseModelKey,
  projectPath: string | undefined,
  services: { settingsService: SettingsService | null | undefined }
): Promise<BaseChatModel> {
  const { phaseModel, provider, credentials } = await getPhaseModelWithOverrides(
    phase,
    services.settingsService,
    projectPath
  );

  const { model: resolvedModel } = resolvePhaseModel(phaseModel);

  logger.debug(
    `createFlowModel: phase=${phase}, resolvedModel=${resolvedModel}, provider=${provider?.name ?? 'none'}`
  );

  // Claude models (claude-* prefix) — use ChatAnthropic
  if (resolvedModel.startsWith('claude-') || resolvedModel.startsWith('claude')) {
    const config: {
      model: string;
      apiKey?: string;
      anthropicApiUrl?: string;
    } = { model: resolvedModel };

    if (provider) {
      const apiKey = resolveProviderApiKey(provider, credentials);
      if (apiKey) {
        config.apiKey = apiKey;
      }
      if (provider.baseUrl) {
        config.anthropicApiUrl = provider.baseUrl;
      }
    }

    logger.debug(`createFlowModel: using ChatAnthropic for model=${resolvedModel}`);
    return new ChatAnthropic(config) as unknown as BaseChatModel;
  }

  // Groq models (llama-*, mixtral-*, gemma-*, groq/*) — use ChatGroq
  if (isGroqModel(resolvedModel)) {
    try {
      const { ChatGroq } = await import('@langchain/groq');
      const apiKey = process.env.GROQ_API_KEY;
      logger.debug(`createFlowModel: using ChatGroq for model=${resolvedModel}`);
      return new ChatGroq({ model: resolvedModel, apiKey }) as unknown as BaseChatModel;
    } catch {
      logger.warn(
        `createFlowModel: @langchain/groq not available, falling back to ChatAnthropic for model=${resolvedModel}`
      );
    }
  }

  // OpenAI-compatible models (non-claude, non-groq) — use ChatOpenAI when provider is set
  if (provider) {
    try {
      const { ChatOpenAI } = await import('@langchain/openai');
      const apiKey = resolveProviderApiKey(provider, credentials);
      logger.debug(
        `createFlowModel: using ChatOpenAI for model=${resolvedModel}, baseURL=${provider.baseUrl}`
      );
      return new ChatOpenAI({
        model: resolvedModel,
        openAIApiKey: apiKey,
        configuration: {
          baseURL: provider.baseUrl,
          apiKey: apiKey,
        },
      }) as unknown as BaseChatModel;
    } catch {
      logger.warn(
        `createFlowModel: @langchain/openai not available, falling back to ChatAnthropic for model=${resolvedModel}`
      );
    }
  }

  // Fallback: use Claude Sonnet via ChatAnthropic
  const fallbackModel = 'claude-sonnet-4-5-20250929';
  logger.warn(
    `createFlowModel: unknown model "${resolvedModel}" for phase "${phase}", falling back to ${fallbackModel}`
  );
  return new ChatAnthropic({ model: fallbackModel }) as unknown as BaseChatModel;
}
