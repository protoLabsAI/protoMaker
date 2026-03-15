import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Alias types ──────────────────────────────────────────────────────────────

export type AnthropicAlias = 'haiku' | 'sonnet' | 'opus';
export type OpenAIAlias = 'gpt-4o' | 'gpt-4o-mini';
export type GeminiAlias = 'gemini-2.0-flash';
export type ModelAlias = AnthropicAlias | OpenAIAlias | GeminiAlias;

export type ProviderName = 'anthropic' | 'openai' | 'google';

// ─── Resolved model ───────────────────────────────────────────────────────────

export interface ResolvedModel {
  provider: ProviderName;
  modelId: string;
  alias: string;
}

// ─── Model ID maps ────────────────────────────────────────────────────────────

const ANTHROPIC_MODELS: Record<AnthropicAlias, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
};

const OPENAI_MODELS: Record<OpenAIAlias, string> = {
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
};

const GEMINI_MODELS: Record<GeminiAlias, string> = {
  'gemini-2.0-flash': 'gemini-2.0-flash',
};

// ─── Type guards ──────────────────────────────────────────────────────────────

function isAnthropicAlias(value: string): value is AnthropicAlias {
  return value in ANTHROPIC_MODELS;
}

function isOpenAIAlias(value: string): value is OpenAIAlias {
  return value in OPENAI_MODELS;
}

function isGeminiAlias(value: string): value is GeminiAlias {
  return value in GEMINI_MODELS;
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve a model alias or full model ID to a canonical provider + model ID.
 *
 * Alias mapping:
 *   - haiku / sonnet / opus  → Anthropic
 *   - gpt-4o / gpt-4o-mini  → OpenAI
 *   - gemini-2.0-flash       → Google
 *
 * Full model IDs are accepted as-is (prefix detection: claude-*, gpt-*, gemini-*).
 *
 * Falls back to the MODEL env var, then defaults to "opus".
 */
export function resolveModel(aliasOrModelId: string): ResolvedModel {
  if (isAnthropicAlias(aliasOrModelId)) {
    return {
      provider: 'anthropic',
      modelId: ANTHROPIC_MODELS[aliasOrModelId],
      alias: aliasOrModelId,
    };
  }

  if (isOpenAIAlias(aliasOrModelId)) {
    return {
      provider: 'openai',
      modelId: OPENAI_MODELS[aliasOrModelId],
      alias: aliasOrModelId,
    };
  }

  if (isGeminiAlias(aliasOrModelId)) {
    return {
      provider: 'google',
      modelId: GEMINI_MODELS[aliasOrModelId],
      alias: aliasOrModelId,
    };
  }

  // Accept full model IDs by prefix detection
  if (aliasOrModelId.startsWith('claude-')) {
    return {
      provider: 'anthropic',
      modelId: aliasOrModelId,
      alias: aliasOrModelId,
    };
  }
  if (aliasOrModelId.startsWith('gpt-')) {
    return {
      provider: 'openai',
      modelId: aliasOrModelId,
      alias: aliasOrModelId,
    };
  }
  if (aliasOrModelId.startsWith('gemini-')) {
    return {
      provider: 'google',
      modelId: aliasOrModelId,
      alias: aliasOrModelId,
    };
  }

  // Default: fall back to env var or "opus"
  return {
    provider: 'anthropic',
    modelId: ANTHROPIC_MODELS.opus,
    alias: 'opus',
  };
}

/**
 * Resolve the active model from the MODEL env var (default: "opus").
 */
export function getDefaultModel(): ResolvedModel {
  return resolveModel(process.env['MODEL'] ?? 'opus');
}

// ─── Provider clients ─────────────────────────────────────────────────────────

/** Union type of all supported provider client instances. */
export type ProviderClient = Anthropic | OpenAI | GoogleGenerativeAI;

let _anthropicClient: Anthropic | null = null;

/** Return a singleton Anthropic client (reads ANTHROPIC_API_KEY env var). */
export function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({
      apiKey: process.env['ANTHROPIC_API_KEY'],
    });
  }
  return _anthropicClient;
}

let _openaiClient: OpenAI | null = null;

/** Return a singleton OpenAI client (reads OPENAI_API_KEY env var). */
export function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    _openaiClient = new OpenAI({
      apiKey: process.env['OPENAI_API_KEY'],
    });
  }
  return _openaiClient;
}

let _googleClient: GoogleGenerativeAI | null = null;

/** Return a singleton Google Generative AI client (reads GOOGLE_API_KEY env var). */
export function getGoogleClient(): GoogleGenerativeAI {
  if (!_googleClient) {
    _googleClient = new GoogleGenerativeAI(process.env['GOOGLE_API_KEY'] ?? '');
  }
  return _googleClient;
}

/**
 * Return the provider client for a given provider name.
 * Provider is selected by the provider name; credentials are read from env vars:
 *   ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY
 */
export function getProviderClient(provider: ProviderName): ProviderClient {
  switch (provider) {
    case 'anthropic':
      return getAnthropicClient();
    case 'openai':
      return getOpenAIClient();
    case 'google':
      return getGoogleClient();
  }
}

/**
 * Convenience: resolve a model alias and return both the resolved model
 * descriptor and the matching provider client.
 */
export function resolveModelWithClient(aliasOrModelId: string): {
  model: ResolvedModel;
  client: ProviderClient;
} {
  const model = resolveModel(aliasOrModelId);
  const client = getProviderClient(model.provider);
  return { model, client };
}
