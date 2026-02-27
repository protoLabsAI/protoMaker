/**
 * Groq Provider - Executes queries using the Groq SDK
 *
 * Wraps the groq-sdk for seamless integration with the provider architecture.
 * Supports streaming completions from Groq's fast inference API.
 */

import Groq from 'groq-sdk';
import { BaseProvider } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';

/** Known Groq model IDs */
const GROQ_MODEL_IDS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
] as const;

export type GroqModelId = (typeof GROQ_MODEL_IDS)[number];

/**
 * Check if a model string represents a Groq model
 *
 * @param model - Model string to check
 * @returns true if the model is a Groq model
 */
export function isGroqModel(model: string | undefined | null): boolean {
  if (!model || typeof model !== 'string') return false;

  // Check for explicit groq/ prefix
  if (model.startsWith('groq/')) {
    return true;
  }

  // Check if it's a known Groq model ID
  return (GROQ_MODEL_IDS as readonly string[]).includes(model);
}

export class GroqProvider extends BaseProvider {
  getName(): string {
    return 'groq';
  }

  /**
   * Execute a query using the Groq streaming API
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const { prompt, model } = options;

    // Resolve the API key from env or config
    const apiKey = process.env.GROQ_API_KEY || this.config.apiKey;

    if (!apiKey) {
      throw new Error(
        'Groq API key not found. Set the GROQ_API_KEY environment variable or configure it in Settings.'
      );
    }

    const groq = new Groq({ apiKey });

    // Build the prompt string
    const promptText = Array.isArray(prompt)
      ? prompt
          .map((p) => (p.type === 'text' && p.text ? p.text : ''))
          .filter(Boolean)
          .join('\n')
      : prompt;

    // Build messages
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [];

    // Add conversation history if present
    if (options.conversationHistory && options.conversationHistory.length > 0) {
      for (const msg of options.conversationHistory) {
        messages.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    }

    // Add system prompt if present
    if (options.systemPrompt && typeof options.systemPrompt === 'string') {
      messages.unshift({ role: 'system', content: options.systemPrompt });
    }

    // Add the user message
    messages.push({ role: 'user', content: promptText });

    // Create streaming chat completion
    const stream = await groq.chat.completions.create({
      model,
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
   * Detect Groq SDK installation (checks for GROQ_API_KEY)
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const hasApiKey = !!process.env.GROQ_API_KEY || !!this.config.apiKey;

    return {
      installed: true,
      method: 'sdk',
      hasApiKey,
      authenticated: hasApiKey,
    };
  }

  /**
   * Get available Groq models
   */
  getAvailableModels(): ModelDefinition[] {
    const models: ModelDefinition[] = [
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B Versatile',
        modelString: 'llama-3.3-70b-versatile',
        provider: 'groq',
        description: 'Meta Llama 3.3 70B - fast and versatile (recommended)',
        contextWindow: 128000,
        maxOutputTokens: 32768,
        supportsVision: false,
        supportsTools: true,
        tier: 'premium',
        default: true,
      },
      {
        id: 'llama-3.1-70b-versatile',
        name: 'Llama 3.1 70B Versatile',
        modelString: 'llama-3.1-70b-versatile',
        provider: 'groq',
        description: 'Meta Llama 3.1 70B - high performance model',
        contextWindow: 128000,
        maxOutputTokens: 8000,
        supportsVision: false,
        supportsTools: true,
        tier: 'standard',
      },
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B Instant',
        modelString: 'llama-3.1-8b-instant',
        provider: 'groq',
        description: 'Meta Llama 3.1 8B - ultra-fast responses',
        contextWindow: 128000,
        maxOutputTokens: 8000,
        supportsVision: false,
        supportsTools: true,
        tier: 'basic',
      },
      {
        id: 'mixtral-8x7b-32768',
        name: 'Mixtral 8x7B',
        modelString: 'mixtral-8x7b-32768',
        provider: 'groq',
        description: 'Mistral Mixtral 8x7B MoE - large context window',
        contextWindow: 32768,
        maxOutputTokens: 32768,
        supportsVision: false,
        supportsTools: true,
        tier: 'standard',
      },
      {
        id: 'gemma2-9b-it',
        name: 'Gemma 2 9B IT',
        modelString: 'gemma2-9b-it',
        provider: 'groq',
        description: 'Google Gemma 2 9B - instruction-tuned model',
        contextWindow: 8192,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: false,
        tier: 'basic',
      },
    ];

    return models;
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text'];
    return supportedFeatures.includes(feature);
  }
}
