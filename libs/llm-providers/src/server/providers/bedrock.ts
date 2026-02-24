/**
 * AWS Bedrock Provider - Enterprise LLM inference
 *
 * Supports Claude, Llama, and other models via AWS Bedrock.
 */

import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type ConverseStreamCommandInput,
  type Message,
  type ContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
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

const logger = createLogger('BedrockProvider');

/**
 * Bedrock-specific configuration
 */
export interface BedrockConfig extends ProviderConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  defaultModel?: string;
}

/**
 * AWS Bedrock provider implementation
 */
export class BedrockProvider extends BaseProvider {
  private client: BedrockRuntimeClient;
  private bedrockConfig: BedrockConfig;

  constructor(config: BedrockConfig = {}) {
    super(config);
    this.bedrockConfig = config;

    const region = config.region || process.env.AWS_REGION || 'us-east-1';
    const credentials =
      config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined;

    this.client = new BedrockRuntimeClient({
      region,
      credentials,
    });
  }

  getName(): string {
    return 'bedrock';
  }

  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const model =
      options.model ||
      this.bedrockConfig.defaultModel ||
      'anthropic.claude-3-5-sonnet-20241022-v2:0';
    const messages = this.buildMessages(options);

    const input: ConverseStreamCommandInput = {
      modelId: model,
      messages,
      inferenceConfig: {
        maxTokens: 4096,
        temperature: 0.7,
      },
    };

    if (options.systemPrompt && typeof options.systemPrompt === 'string') {
      input.system = [{ text: options.systemPrompt }];
    }

    try {
      const command = new ConverseStreamCommand(input);
      const response = await this.client.send(command);

      if (!response.stream) {
        throw new Error('No stream returned from Bedrock');
      }

      let fullText = '';
      for await (const event of response.stream) {
        if (event.contentBlockDelta?.delta?.text) {
          fullText += event.contentBlockDelta.delta.text;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: event.contentBlockDelta.delta.text }],
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
      logger.error('Bedrock query failed:', error);
      yield {
        type: 'error',
        subtype: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async detectInstallation(): Promise<InstallationStatus> {
    const region = this.bedrockConfig.region || process.env.AWS_REGION;
    const hasCredentials =
      (this.bedrockConfig.accessKeyId && this.bedrockConfig.secretAccessKey) ||
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

    if (!region || !hasCredentials) {
      return {
        installed: false,
        method: 'sdk',
        error:
          'AWS Bedrock requires AWS credentials. Set AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.',
      };
    }

    return {
      installed: true,
      version: 'configured',
      method: 'sdk',
      authenticated: true,
    };
  }

  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        name: 'Claude 3.5 Sonnet v2',
        modelString: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        provider: 'bedrock',
        description: 'Anthropic Claude 3.5 Sonnet v2 - Most capable Claude model',
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
      },
      {
        id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        name: 'Claude 3.5 Sonnet v1',
        modelString: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        provider: 'bedrock',
        description: 'Anthropic Claude 3.5 Sonnet v1 - Previous generation',
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
      },
      {
        id: 'anthropic.claude-3-opus-20240229-v1:0',
        name: 'Claude 3 Opus',
        modelString: 'anthropic.claude-3-opus-20240229-v1:0',
        provider: 'bedrock',
        description: 'Anthropic Claude 3 Opus - Most powerful Claude 3 model',
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
      },
      {
        id: 'anthropic.claude-3-sonnet-20240229-v1:0',
        name: 'Claude 3 Sonnet',
        modelString: 'anthropic.claude-3-sonnet-20240229-v1:0',
        provider: 'bedrock',
        description: 'Anthropic Claude 3 Sonnet - Balanced performance',
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
      },
      {
        id: 'anthropic.claude-3-haiku-20240307-v1:0',
        name: 'Claude 3 Haiku',
        modelString: 'anthropic.claude-3-haiku-20240307-v1:0',
        provider: 'bedrock',
        description: 'Anthropic Claude 3 Haiku - Fastest Claude model',
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
      },
      {
        id: 'meta.llama3-1-70b-instruct-v1:0',
        name: 'Llama 3.1 70B',
        modelString: 'meta.llama3-1-70b-instruct-v1:0',
        provider: 'bedrock',
        description: 'Meta Llama 3.1 70B - Open source large model',
        contextWindow: 128000,
        supportsVision: false,
        supportsTools: true,
      },
      {
        id: 'meta.llama3-1-8b-instruct-v1:0',
        name: 'Llama 3.1 8B',
        modelString: 'meta.llama3-1-8b-instruct-v1:0',
        provider: 'bedrock',
        description: 'Meta Llama 3.1 8B - Open source fast model',
        contextWindow: 128000,
        supportsVision: false,
        supportsTools: true,
      },
    ];
  }

  validateConfig(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const region = this.bedrockConfig.region || process.env.AWS_REGION;
    if (!region) {
      warnings.push(
        'AWS region not configured. Set AWS_REGION or provide in config. Defaulting to us-east-1.'
      );
    }

    const hasCredentials =
      (this.bedrockConfig.accessKeyId && this.bedrockConfig.secretAccessKey) ||
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

    if (!hasCredentials) {
      warnings.push(
        'No explicit AWS credentials found. AWS SDK will attempt to use instance profile, IAM role, or other default credential providers.'
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['text', 'vision', 'tools', 'streaming'];
    return supportedFeatures.includes(feature);
  }

  private buildMessages(options: ExecuteOptions): Message[] {
    const messages: Message[] = [];

    // Add conversation history if provided
    if (options.conversationHistory) {
      for (const msg of options.conversationHistory) {
        const content: ContentBlock[] = [
          {
            text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          },
        ];

        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content,
        });
      }
    }

    // Add the current prompt
    const promptContent: ContentBlock[] = [
      {
        text: typeof options.prompt === 'string' ? options.prompt : JSON.stringify(options.prompt),
      },
    ];

    messages.push({
      role: 'user',
      content: promptContent,
    });

    return messages;
  }
}
