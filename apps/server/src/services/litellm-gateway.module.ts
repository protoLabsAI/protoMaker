/**
 * LiteLLM Gateway module — registers gateway models into openaiCompatibleProviders on startup.
 *
 * When litellmGateway.enabled is true, this module fetches the gateway's model list at startup
 * and upserts an OpenAICompatibleConfig entry (id: "litellm-gateway") so models appear in
 * every model dropdown throughout the app.
 *
 * The upsert is idempotent: existing "litellm-gateway" entries are replaced on each boot.
 * If the gateway is unreachable at startup, the module logs a warning and skips — models
 * will be absent from dropdowns until the server restarts with the gateway available.
 */

import { createLogger } from '@protolabsai/utils';
import type { ServiceContainer } from '../server/services.js';
import { litellmGatewayService } from './litellm-gateway-service.js';
import type { OpenAICompatibleConfig } from '@protolabsai/types';

const logger = createLogger('LiteLLMGateway:Module');

const LITELLM_PROVIDER_ID = 'litellm-gateway';

export function register(container: ServiceContainer): void {
  logger.info('LiteLLM gateway module registered');

  // Kick off async model sync without blocking server startup
  void syncModelsOnStartup(container);
}

async function syncModelsOnStartup(container: ServiceContainer): Promise<void> {
  try {
    const settings = await container.settingsService.getGlobalSettings();
    const config = settings.litellmGateway;

    if (!config?.enabled || !config.baseUrl) {
      logger.info('LiteLLM gateway disabled or not configured — skipping model sync');
      return;
    }

    logger.info(`Syncing LiteLLM gateway models from ${config.baseUrl}…`);
    const gatewayModels = await litellmGatewayService.fetchModels(config);

    if (gatewayModels.length === 0) {
      logger.warn('LiteLLM gateway returned 0 models — skipping model sync');
      return;
    }

    // Resolve API key at sync time so the stored entry always uses 'inline' source.
    // openai-compatible-provider only supports OPENAI_API_KEY for 'env' source, so we
    // resolve the gateway's custom envVar here and store the result as an inline key.
    let resolvedApiKey: string | undefined = config.apiKey;
    if (!resolvedApiKey && config.apiKeySource === 'env' && config.envVar) {
      resolvedApiKey = process.env[config.envVar];
    }

    const providerEntry: OpenAICompatibleConfig = {
      id: LITELLM_PROVIDER_ID,
      name: 'LiteLLM Gateway',
      enabled: true,
      baseUrl: config.baseUrl,
      apiKeySource: 'inline',
      ...(resolvedApiKey ? { apiKey: resolvedApiKey } : {}),
      models: gatewayModels.map((m) => ({
        id: m.id,
        displayName: m.id,
      })),
    };

    const current = await container.settingsService.getGlobalSettings();
    const existing = current.openaiCompatibleProviders ?? [];
    const updated = [...existing.filter((p) => p.id !== LITELLM_PROVIDER_ID), providerEntry];

    await container.settingsService.updateGlobalSettings({ openaiCompatibleProviders: updated });
    logger.info(
      `LiteLLM gateway: synced ${gatewayModels.length} models to openaiCompatibleProviders`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `LiteLLM gateway model sync failed at startup: ${message} — models will not appear in dropdowns`
    );
  }
}
