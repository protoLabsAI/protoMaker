import OpenAI from 'openai';
import { createLogger } from '@protolabs-ai/utils';
import {
  BaseProvider,
  type ProviderConfig,
  type ModelDefinition,
  type ProviderHealthStatus,
} from '../types.js';

const logger = createLogger('OpenAIProvider');

export class OpenAIProvider extends BaseProvider {
  private client?: OpenAI;
  private config?: ProviderConfig;

  constructor() {
    super('openai', ['fast', 'balanced', 'quality', 'reasoning']);
    this.initializeModels();
  }

  private initializeModels(): void {
    // Fast models
    this.registerModel('gpt-4o-mini', {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'openai',
      category: 'fast',
      contextWindow: 128000,
      maxOutput: 16384,
      pricing: {
        input: 0.15,
        output: 0.6,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: true,
      },
    });

    // Balanced models
    this.registerModel('gpt-4o', {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      category: 'balanced',
      contextWindow: 128000,
      maxOutput: 16384,
      pricing: {
        input: 2.5,
        output: 10,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: true,
      },
    });

    // Quality models
    this.registerModel('gpt-4-turbo', {
      id: 'gpt-4-turbo-preview',
      name: 'GPT-4 Turbo',
      provider: 'openai',
      category: 'quality',
      contextWindow: 128000,
      maxOutput: 4096,
      pricing: {
        input: 10,
        output: 30,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: true,
      },
    });

    // Reasoning models
    this.registerModel('o1', {
      id: 'o1',
      name: 'OpenAI o1',
      provider: 'openai',
      category: 'reasoning',
      contextWindow: 200000,
      maxOutput: 100000,
      pricing: {
        input: 15,
        output: 60,
      },
      capabilities: {
        streaming: false,
        functionCalling: false,
        vision: true,
      },
    });

    this.registerModel('o1-mini', {
      id: 'o1-mini',
      name: 'OpenAI o1 Mini',
      provider: 'openai',
      category: 'reasoning',
      contextWindow: 128000,
      maxOutput: 65536,
      pricing: {
        input: 3,
        output: 12,
      },
      capabilities: {
        streaming: false,
        functionCalling: false,
        vision: true,
      },
    });
  }

  async initialize(config: ProviderConfig): Promise<void> {
    try {
      this.config = config;
      this.client = new OpenAI({
        apiKey: config.apiKey || process.env.OPENAI_API_KEY,
        baseURL: config.baseURL,
        organization: config.organization,
        timeout: config.timeout || 60000,
        maxRetries: config.maxRetries || 3,
      });

      logger.info('OpenAI provider initialized');
    } catch (error) {
      logger.error('Failed to initialize OpenAI provider', error);
      throw error;
    }
  }

  async checkHealth(): Promise<ProviderHealthStatus> {
    const startTime = Date.now();

    try {
      if (!this.client) {
        return {
          provider: this.name,
          healthy: false,
          latency: 0,
          error: 'Provider not initialized',
          timestamp: new Date(),
        };
      }

      // Test with a minimal API call to check health
      await this.client.models.list();

      const latency = Date.now() - startTime;
      this.updateMetrics(true, latency);

      return {
        provider: this.name,
        healthy: true,
        latency,
        timestamp: new Date(),
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updateMetrics(false, latency);

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('OpenAI health check failed', error);

      return {
        provider: this.name,
        healthy: false,
        latency,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  getClient(): OpenAI | undefined {
    return this.client;
  }
}
