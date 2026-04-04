/**
 * LiteLLM Gateway Service - Integration with LiteLLM proxy gateway
 *
 * Provides methods to test connectivity, fetch models, and sync configuration
 * with the LiteLLM proxy gateway (OpenAI-compatible API).
 */

import { createLogger } from '@protolabsai/utils';
import type { LiteLLMGatewayConfig } from '@protolabsai/types';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('LiteLLMGatewayService');

/** OpenAI-format model entry returned by the /models endpoint */
export interface LiteLLMModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}

/** Result of a connection test */
export interface LiteLLMConnectionResult {
  ok: boolean;
  error?: string;
  modelCount?: number;
}

export class LiteLLMGatewayService {
  /**
   * Build fetch headers for requests to the LiteLLM gateway.
   */
  private buildHeaders(config: LiteLLMGatewayConfig): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
    return headers;
  }

  /**
   * Test connectivity to the LiteLLM gateway by calling its /models endpoint.
   * Returns ok:true when the gateway responds with a valid models list.
   */
  async testConnection(config: LiteLLMGatewayConfig): Promise<LiteLLMConnectionResult> {
    try {
      const url = `${config.baseUrl.replace(/\/$/, '')}/models`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(config),
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `Gateway returned HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as { data?: LiteLLMModel[] };
      const modelCount = Array.isArray(data?.data) ? data.data.length : 0;

      logger.info(`LiteLLM gateway test ok — ${modelCount} models`);
      return { ok: true, modelCount };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`LiteLLM gateway test failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  /**
   * Fetch the list of models from the LiteLLM gateway's OpenAI-format /models endpoint.
   */
  async fetchModels(config: LiteLLMGatewayConfig): Promise<LiteLLMModel[]> {
    const url = `${config.baseUrl.replace(/\/$/, '')}/models`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders(config),
    });

    if (!response.ok) {
      throw new Error(`Gateway returned HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as { data?: LiteLLMModel[] };
    return Array.isArray(data?.data) ? data.data : [];
  }

  /**
   * Upsert the LiteLLM gateway configuration into global settings.
   * Merges the provided config with any existing litellmGateway settings.
   */
  async syncToSettings(
    config: LiteLLMGatewayConfig,
    settingsService: SettingsService
  ): Promise<void> {
    const settings = await settingsService.getGlobalSettings();
    const updated = { ...settings.litellmGateway, ...config };
    await settingsService.updateGlobalSettings({ litellmGateway: updated });
    logger.info('LiteLLM gateway config synced to settings');
  }
}

export const litellmGatewayService = new LiteLLMGatewayService();
