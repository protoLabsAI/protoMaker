/**
 * Groq Provider - Fast LLM inference using Groq API
 *
 * Supports Llama, Mixtral, and Gemma models with ultra-low latency.
 */

import Groq from 'groq-sdk';
import { BaseProvider } from './base-provider.js';
import { createLogger } from '@protolabs-ai/utils';
import type {
  ProviderConfig,
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ValidationResult,
  ConversationMessage,
} from '@protolabs-ai/types';

const logger = createLogger('GroqProvider');

/**
 * Groq-specific configuration
 */
export interface GroqConfig extends ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
}

/**
 * Groq provider implementation
 */
export class GroqProvider extends BaseProvider {
  private client: Groq | null = null;
  private groqConfig: GroqConfig;

  constructor(config: GroqConfig = {}) {
    super(config);
    this.groqConfig = config;
    this.initializeClient();
  }

  private initializeClient(): void {
    const apiKey = this.groqConfig.apiKey || process.env.GROQ_API_KEY;
    if (!apiKey) {
      logger.warn('Groq API key not provided');
      return;
    }

    this.client = new Groq({
      apiKey,
      baseURL: this.groqConfig.baseURL,
    });
  }

  getName(): string {
    return 'groq';
  }

  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    if (!this.client) {
      throw new Error('Groq client not initialized. Please provide an API key.');
    }

    const model = options.model || this.groqConfig.defaultModel || 'llama-3.3-70b-versatile';
    const messages = this.buildMessages(options);

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages: messages as any,
        stream: true,
        max_tokens: 4096,
        temperature: 0.7,
      });

      let fullText = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullText += delta.content;
          // Stream each chunk
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: delta.content }],
            },
          };
        }
      }

      // Final result message
      yield {
        type: 'result',
        subtype: 'success',
        result: fullText,
      };
    } catch (error) {
      logger.error('Groq query failed:', error);
      yield {
        type: 'error',
        subtype: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async detectInstallation(): Promise<InstallationStatus> {
    const apiKey = this.groqConfig.apiKey || process.env.GROQ_API_KEY;

    return {
      installed: !!apiKey,
      version: apiKey ? 'configured' : undefined,
      hasApiKey: !!apiKey,
      method: 'sdk',
    };
  }

  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B',
        modelString: 'llama-3.3-70b-versatile',
        provider: 'groq',
        description: 'Meta Llama 3.3 70B - Versatile model for general tasks',
        contextWindow: 32768,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: 'llama-3.1-70b-versatile',
        name: 'Llama 3.1 70B',
        modelString: 'llama-3.1-70b-versatile',
        provider: 'groq',
        description: 'Meta Llama 3.1 70B - Versatile model',
        contextWindow: 32768,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B',
        modelString: 'llama-3.1-8b-instant',
        provider: 'groq',
        description: 'Meta Llama 3.1 8B - Fast instant responses',
        contextWindow: 8192,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: 'mixtral-8x7b-32768',
        name: 'Mixtral 8x7B',
        modelString: 'mixtral-8x7b-32768',
        provider: 'groq',
        description: 'Mistral Mixtral 8x7B - Mixture of experts model',
        contextWindow: 32768,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: 'gemma-7b-it',
        name: 'Gemma 7B',
        modelString: 'gemma-7b-it',
        provider: 'groq',
        description: 'Google Gemma 7B - Instruction tuned',
        contextWindow: 8192,
        supportsTools: false,
        supportsVision: false,
      },
    ];
  }

  validateConfig(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const apiKey = this.groqConfig.apiKey || process.env.GROQ_API_KEY;
    if (!apiKey) {
      errors.push('Groq API key is required. Set GROQ_API_KEY or provide in config.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['text', 'tools', 'streaming'];
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
