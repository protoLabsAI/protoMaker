/**
 * Codex Model Definitions
 *
 * Official Codex CLI models as documented at https://developers.openai.com/codex/models/
 */

import { CODEX_MODEL_MAP } from '@protolabsai/types';
import type { ModelDefinition } from './types.js';

const CONTEXT_WINDOW_256K = 256000;
const CONTEXT_WINDOW_128K = 128000;
const MAX_OUTPUT_32K = 32000;
const MAX_OUTPUT_16K = 16000;

/**
 * All available Codex models with their specifications
 * Based on https://developers.openai.com/codex/models/
 */
export const CODEX_MODELS: ModelDefinition[] = [
  // ========== Flagship + Professional ==========
  {
    id: CODEX_MODEL_MAP.gpt55,
    name: 'GPT-5.5',
    modelString: CODEX_MODEL_MAP.gpt55,
    provider: 'openai',
    description:
      'Flagship for complex coding, computer use, knowledge work, and research workflows.',
    contextWindow: CONTEXT_WINDOW_256K,
    maxOutputTokens: MAX_OUTPUT_32K,
    supportsVision: true,
    supportsTools: true,
    tier: 'premium' as const,
    default: true,
    hasReasoning: true,
  },
  {
    id: CODEX_MODEL_MAP.gpt54,
    name: 'GPT-5.4',
    modelString: CODEX_MODEL_MAP.gpt54,
    provider: 'openai',
    description: 'Professional coding with stronger reasoning and agentic capabilities.',
    contextWindow: CONTEXT_WINDOW_256K,
    maxOutputTokens: MAX_OUTPUT_32K,
    supportsVision: true,
    supportsTools: true,
    tier: 'premium' as const,
    hasReasoning: true,
  },
  {
    id: CODEX_MODEL_MAP.gpt54Mini,
    name: 'GPT-5.4-mini',
    modelString: CODEX_MODEL_MAP.gpt54Mini,
    provider: 'openai',
    description: 'Fast, lightweight tasks and subagent operations.',
    contextWindow: CONTEXT_WINDOW_128K,
    maxOutputTokens: MAX_OUTPUT_16K,
    supportsVision: false,
    supportsTools: true,
    tier: 'basic' as const,
    hasReasoning: false,
  },

  // ========== Codex-Tuned ==========
  {
    id: CODEX_MODEL_MAP.gpt53Codex,
    name: 'GPT-5.3-Codex',
    modelString: CODEX_MODEL_MAP.gpt53Codex,
    provider: 'openai',
    description:
      'Codex-tuned: industry-leading coding performance for complex software engineering.',
    contextWindow: CONTEXT_WINDOW_256K,
    maxOutputTokens: MAX_OUTPUT_32K,
    supportsVision: false,
    supportsTools: true,
    tier: 'standard' as const,
    hasReasoning: false,
  },
  {
    id: CODEX_MODEL_MAP.gpt53CodexSpark,
    name: 'GPT-5.3-Codex-Spark',
    modelString: CODEX_MODEL_MAP.gpt53CodexSpark,
    provider: 'openai',
    description: 'Near-instant real-time iteration (ChatGPT Pro research preview).',
    contextWindow: CONTEXT_WINDOW_128K,
    maxOutputTokens: MAX_OUTPUT_16K,
    supportsVision: false,
    supportsTools: true,
    tier: 'basic' as const,
    hasReasoning: false,
  },

  // ========== Legacy ==========
  {
    id: CODEX_MODEL_MAP.gpt52,
    name: 'GPT-5.2 (legacy)',
    modelString: CODEX_MODEL_MAP.gpt52,
    provider: 'openai',
    description: 'Legacy general-purpose model for debugging tasks requiring deeper analysis.',
    contextWindow: CONTEXT_WINDOW_256K,
    maxOutputTokens: MAX_OUTPUT_32K,
    supportsVision: false,
    supportsTools: true,
    tier: 'standard' as const,
    hasReasoning: false,
  },
];

/**
 * Get model definition by ID
 */
export function getCodexModelById(modelId: string): ModelDefinition | undefined {
  return CODEX_MODELS.find((m) => m.id === modelId || m.modelString === modelId);
}

/**
 * Get all models that support reasoning
 */
export function getReasoningModels(): ModelDefinition[] {
  return CODEX_MODELS.filter((m) => m.hasReasoning);
}

/**
 * Get models by tier
 */
export function getModelsByTier(tier: 'premium' | 'standard' | 'basic'): ModelDefinition[] {
  return CODEX_MODELS.filter((m) => m.tier === tier);
}
