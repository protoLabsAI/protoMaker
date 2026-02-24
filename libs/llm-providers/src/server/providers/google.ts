import { GoogleGenerativeAI } from '@google/generative-ai';
import { createLogger } from '@protolabs-ai/utils';
import {
  BaseProvider,
  type ProviderConfig,
  type ModelDefinition,
  type ProviderHealthStatus,
} from '../types.js';

const logger = createLogger('GoogleProvider');

export class GoogleProvider extends BaseProvider {
  private client?: GoogleGenerativeAI;
  private config?: ProviderConfig;

  constructor() {
    super('google', ['fast', 'balanced', 'quality']);
    this.initializeModels();
  }

  private initializeModels(): void {
    // Fast models
    this.registerModel('gemini-2.0-flash', {
      id: 'gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash',
      provider: 'google',
      category: 'fast',
      contextWindow: 1000000,
      maxOutput: 8192,
      pricing: {
        input: 0,
        output: 0,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: true,
      },
    });

    this.registerModel('gemini-1.5-flash', {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      provider: 'google',
      category: 'fast',
      contextWindow: 1000000,
      maxOutput: 8192,
      pricing: {
        input: 0.075,
        output: 0.3,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: true,
      },
    });

    // Balanced models
    this.registerModel('gemini-1.5-pro', {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      provider: 'google',
      category: 'balanced',
      contextWindow: 2000000,
      maxOutput: 8192,
      pricing: {
        input: 1.25,
        output: 5,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: true,
      },
    });

    // Quality models
    this.registerModel('gemini-pro', {
      id: 'gemini-pro',
      name: 'Gemini Pro',
      provider: 'google',
      category: 'quality',
      contextWindow: 30720,
      maxOutput: 2048,
      pricing: {
        input: 0.5,
        output: 1.5,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: false,
      },
    });

    // Experimental models
    this.registerModel('gemini-2.0-flash-thinking', {
      id: 'gemini-2.0-flash-thinking-exp',
      name: 'Gemini 2.0 Flash Thinking',
      provider: 'google',
      category: 'quality',
      contextWindow: 32767,
      maxOutput: 8192,
      pricing: {
        input: 0,
        output: 0,
      },
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: true,
      },
    });
  }

  async initialize(config: ProviderConfig): Promise<void> {
    try {
      this.config = config;
      const apiKey = config.apiKey || process.env.GOOGLE_API_KEY;

      if (!apiKey) {
        throw new Error('Google API key is required');
      }

      this.client = new GoogleGenerativeAI(apiKey);

      logger.info('Google provider initialized');
    } catch (error) {
      logger.error('Failed to initialize Google provider', error);
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
      const model = this.client.getGenerativeModel({ model: 'gemini-1.5-flash' });
      await model.generateContent('test');

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
      logger.error('Google health check failed', error);

      return {
        provider: this.name,
        healthy: false,
        latency,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  getClient(): GoogleGenerativeAI | undefined {
    return this.client;
  }
}
