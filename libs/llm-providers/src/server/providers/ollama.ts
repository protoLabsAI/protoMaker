/**
 * Ollama Provider - Local LLM inference
 *
 * Supports running open-source models locally via Ollama.
 */

import { Ollama } from 'ollama';
import { BaseProvider } from './base-provider.js';
import { createLogger } from '@protolabs-ai/utils';
import type {
  ProviderConfig,
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ValidationResult,
} from '@protolabs-ai/types';

const logger = createLogger('OllamaProvider');

/**
 * Ollama-specific configuration
 */
export interface OllamaConfig extends ProviderConfig {
  host?: string;
  defaultModel?: string;
  /** Default temperature for generations (0-1). Default: 0.7 */
  temperature?: number;
  /** Default max tokens to predict. Default: 4096 */
  numPredict?: number;
}

/**
 * Ollama provider implementation for local model inference
 */
export class OllamaProvider extends BaseProvider {
  private client: Ollama;
  private ollamaConfig: OllamaConfig;

  constructor(config: OllamaConfig = {}) {
    super(config);
    this.ollamaConfig = config;
    const host = config.host || process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.client = new Ollama({ host });
  }

  getName(): string {
    return 'ollama';
  }

  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const model = options.model || this.ollamaConfig.defaultModel || 'llama3.2';
    const messages = this.buildMessages(options);

    try {
      const stream = await this.client.chat({
        model,
        messages: messages as any,
        stream: true,
        options: {
          temperature: this.ollamaConfig.temperature ?? 0.7,
          num_predict: this.ollamaConfig.numPredict ?? 4096,
        },
      });

      let fullText = '';
      for await (const chunk of stream) {
        if (chunk.message?.content) {
          fullText += chunk.message.content;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: chunk.message.content }],
            },
          };
        }
      }

      yield {
        type: 'result',
        subtype: 'success',
        result: fullText,
      };
    } catch (error) {
      logger.error('Ollama query failed:', error);
      yield {
        type: 'error',
        subtype: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async detectInstallation(): Promise<InstallationStatus> {
    try {
      // Try to list models to check if Ollama is running
      await this.client.list();
      return {
        installed: true,
        version: 'running',
        method: 'cli',
        authenticated: true,
      };
    } catch (error) {
      return {
        installed: false,
        method: 'cli',
        error: 'Ollama is not running. Install from https://ollama.ai and run `ollama serve`',
      };
    }
  }

  getAvailableModels(): ModelDefinition[] {
    // Return default models - can be overridden by calling getInstalledModels()
    return this.getDefaultModels();
  }

  /**
   * Get models currently installed in Ollama
   */
  async getInstalledModels(): Promise<ModelDefinition[]> {
    try {
      const response = await this.client.list();
      return response.models.map((model) => ({
        id: model.name,
        name: model.name,
        modelString: model.name,
        provider: 'ollama',
        description: `Local Ollama model: ${model.name}`,
        contextWindow: 4096, // Default, varies by model
        supportsTools: true,
        supportsVision: false,
      }));
    } catch (error) {
      logger.warn('Failed to fetch Ollama models:', error);
      return this.getDefaultModels();
    }
  }

  private getDefaultModels(): ModelDefinition[] {
    return [
      {
        id: 'llama3.2',
        name: 'Llama 3.2',
        modelString: 'llama3.2',
        provider: 'ollama',
        description: 'Meta Llama 3.2 - General purpose model',
        contextWindow: 4096,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: 'llama3.1',
        name: 'Llama 3.1',
        modelString: 'llama3.1',
        provider: 'ollama',
        description: 'Meta Llama 3.1 - Advanced general purpose model',
        contextWindow: 8192,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: 'codellama',
        name: 'Code Llama',
        modelString: 'codellama',
        provider: 'ollama',
        description: 'Meta Code Llama - Specialized for code generation',
        contextWindow: 4096,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: 'mistral',
        name: 'Mistral',
        modelString: 'mistral',
        provider: 'ollama',
        description: 'Mistral AI - Efficient general purpose model',
        contextWindow: 8192,
        supportsTools: false,
        supportsVision: false,
      },
      {
        id: 'phi3',
        name: 'Phi-3',
        modelString: 'phi3',
        provider: 'ollama',
        description: 'Microsoft Phi-3 - Small efficient model',
        contextWindow: 4096,
        supportsTools: false,
        supportsVision: false,
      },
    ];
  }

  validateConfig(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const host = this.ollamaConfig.host || process.env.OLLAMA_HOST || 'http://localhost:11434';
    if (!host.startsWith('http://') && !host.startsWith('https://')) {
      warnings.push('Ollama host should start with http:// or https://');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['text', 'tools', 'streaming', 'local'];
    return supportedFeatures.includes(feature);
  }

  private buildMessages(options: ExecuteOptions): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // Add system prompt if provided
    if (options.systemPrompt && typeof options.systemPrompt === 'string') {
      messages.push({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    // Add conversation history if provided
    if (options.conversationHistory) {
      for (const msg of options.conversationHistory) {
        messages.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    }

    // Add the current prompt
    messages.push({
      role: 'user',
      content: typeof options.prompt === 'string' ? options.prompt : JSON.stringify(options.prompt),
    });

    return messages;
  }
}
