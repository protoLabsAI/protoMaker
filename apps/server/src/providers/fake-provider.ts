/**
 * Fake Provider - Deterministic test provider for development and CI
 *
 * Implements a provider that returns configurable responses without requiring API keys.
 * This is useful for testing the provider abstraction layer and running CI/CD pipelines
 * without real API calls.
 */

import { BaseProvider } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderConfig,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('FakeProvider');

/**
 * Configuration for FakeProvider
 */
interface FakeProviderConfig {
  responses?: string | string[];
  delay?: number;
  currentResponseIndex?: number;
}

/**
 * FakeProvider - Returns deterministic responses for testing
 *
 * Features:
 * - No API keys required
 * - Configurable responses via config
 * - Support for single or multiple responses (deterministic multi-turn)
 * - Streaming support via chunks
 * - Lightweight and fast for CI/CD pipelines
 */
export class FakeProvider extends BaseProvider {
  private fakeConfig: FakeProviderConfig;
  private currentResponseIndex: number = 0;

  constructor(config: ProviderConfig & Partial<FakeProviderConfig> = {}) {
    super(config);
    this.fakeConfig = {
      responses: config.responses ?? 'This is a fake response from FakeProvider',
      delay: config.delay ?? 0,
      currentResponseIndex: 0,
    };
  }

  getName(): string {
    return 'fake';
  }

  /**
   * Execute a query using configured fake responses
   *
   * Streams responses back as ProviderMessage objects that match
   * the provider abstraction format, allowing seamless integration.
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    try {
      logger.debug('FakeProvider.executeQuery', {
        model: options.model,
        promptLength: typeof options.prompt === 'string' ? options.prompt.length : 'complex',
      });

      // Apply delay if configured
      if (this.fakeConfig.delay && this.fakeConfig.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.fakeConfig.delay));
      }

      // Get the response to return
      const response = this.getNextResponse();

      // Yield initial message start
      yield {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: response,
            },
          ],
        },
      };

      // Yield result to signal completion
      yield {
        type: 'result',
        result: 'success',
      };
    } catch (error) {
      logger.error('FakeProvider.executeQuery error', error);
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get the next response, cycling through configured responses if multiple are provided
   */
  private getNextResponse(): string {
    const responses = this.fakeConfig.responses;

    if (Array.isArray(responses)) {
      // Cycle through responses for multi-turn conversations
      const response = responses[this.currentResponseIndex % responses.length];
      this.currentResponseIndex++;
      return response ?? 'Fake response';
    }

    return responses as string;
  }

  /**
   * Detect if fake provider is available (always true - no installation required)
   */
  async detectInstallation(): Promise<InstallationStatus> {
    return {
      installed: true,
      method: 'sdk',
      authenticated: true,
      hasApiKey: false,
      hasOAuthToken: false,
    };
  }

  /**
   * Get available fake models
   */
  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'fake-chat',
        name: 'Fake Chat Model',
        modelString: 'fake-chat',
        provider: 'fake',
        description: 'Deterministic fake model for testing without API keys',
        contextWindow: 100000,
        maxOutputTokens: 50000,
        supportsVision: false,
        supportsTools: false,
        tier: 'basic',
        default: false,
      },
      {
        id: 'fake-list',
        name: 'Fake List Chat Model',
        modelString: 'fake-list',
        provider: 'fake',
        description: 'Deterministic fake model for multi-turn conversations with preset responses',
        contextWindow: 100000,
        maxOutputTokens: 50000,
        supportsVision: false,
        supportsTools: false,
        tier: 'basic',
        default: false,
      },
    ];
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    const errors: string[] = [];
    const warnings: string[] = [];

    // FakeProvider has minimal requirements
    if (!this.fakeConfig) {
      errors.push('FakeProvider config is missing');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check supported features
   */
  supportsFeature(feature: string): boolean {
    // Fake provider supports basic text features
    const supportedFeatures = ['text', 'streaming'];
    return supportedFeatures.includes(feature);
  }
}
