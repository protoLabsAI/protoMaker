/**
 * Default model configurations for Anthropic provider
 */

import type { ModelInfo } from '../base.js';

/**
 * Default Anthropic model configurations
 */
export const ANTHROPIC_MODELS: Record<string, ModelInfo> = {
  haiku: {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude 4.5 Haiku',
    tier: 'fast',
    contextWindow: 200000,
    maxOutputTokens: 8192,
  },
  sonnet: {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude 4.5 Sonnet',
    tier: 'smart',
    contextWindow: 200000,
    maxOutputTokens: 8192,
  },
  opus: {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude 4.5 Opus',
    tier: 'creative',
    contextWindow: 200000,
    maxOutputTokens: 8192,
  },
};

/**
 * Get model ID for a given tier
 */
export function getModelIdForTier(tier: 'fast' | 'smart' | 'creative'): string {
  const modelMap = {
    fast: ANTHROPIC_MODELS.haiku.id,
    smart: ANTHROPIC_MODELS.sonnet.id,
    creative: ANTHROPIC_MODELS.opus.id,
  };
  return modelMap[tier];
}
