import type { ModelProvider, ThinkingLevel, ReasoningEffort } from '@protolabsai/types';
import {
  CURSOR_MODEL_MAP,
  CODEX_MODEL_MAP,
  OPENCODE_MODELS as OPENCODE_MODEL_CONFIGS,
} from '@protolabsai/types';
import { Brain, Zap, Scale, Cpu, Rocket, Sparkles } from 'lucide-react';
import {
  AnthropicIcon,
  CursorIcon,
  OpenAIIcon,
  OpenCodeIcon,
} from '@/components/shared/provider-icon';

export type ModelOption = {
  id: string; // All model IDs use canonical prefixed format (e.g., "claude-sonnet", "cursor-auto")
  label: string;
  description: string;
  badge?: string;
  provider: ModelProvider;
  hasThinking?: boolean;
};

/**
 * Claude models with canonical prefixed IDs
 * UI displays short labels but stores full canonical IDs
 */
export const CLAUDE_MODELS: ModelOption[] = [
  {
    id: 'claude-haiku', // Canonical prefixed ID
    label: 'Claude Haiku',
    description: 'Fast and efficient for simple tasks.',
    badge: 'Speed',
    provider: 'claude',
  },
  {
    id: 'claude-sonnet', // Canonical prefixed ID
    label: 'Claude Sonnet',
    description: 'Balanced performance with strong reasoning.',
    badge: 'Balanced',
    provider: 'claude',
  },
  {
    id: 'claude-opus', // Canonical prefixed ID
    label: 'Claude Opus',
    description: 'Most capable model for complex work.',
    badge: 'Premium',
    provider: 'claude',
  },
];

/**
 * Cursor models derived from CURSOR_MODEL_MAP
 * IDs already have 'cursor-' prefix in the canonical format
 */
export const CURSOR_MODELS: ModelOption[] = Object.entries(CURSOR_MODEL_MAP).map(
  ([id, config]) => ({
    id, // Already prefixed in canonical format
    label: config.label,
    description: config.description,
    provider: 'cursor' as ModelProvider,
    hasThinking: config.hasThinking,
  })
);

/**
 * Codex/OpenAI models
 * Official models from https://developers.openai.com/codex/models/
 */
export const CODEX_MODELS: ModelOption[] = [
  {
    id: CODEX_MODEL_MAP.gpt55,
    label: 'GPT-5.5',
    description: 'Flagship for complex coding, computer use, knowledge work, and research.',
    badge: 'Premium',
    provider: 'codex',
    hasThinking: true,
  },
  {
    id: CODEX_MODEL_MAP.gpt54,
    label: 'GPT-5.4',
    description: 'Professional coding with stronger reasoning and agentic capabilities.',
    badge: 'Premium',
    provider: 'codex',
    hasThinking: true,
  },
  {
    id: CODEX_MODEL_MAP.gpt54Mini,
    label: 'GPT-5.4-mini',
    description: 'Fast, lightweight tasks and subagent operations.',
    badge: 'Speed',
    provider: 'codex',
    hasThinking: false,
  },
  {
    id: CODEX_MODEL_MAP.gpt53Codex,
    label: 'GPT-5.3-Codex',
    description:
      'Codex-tuned: industry-leading coding performance for complex software engineering.',
    badge: 'Balanced',
    provider: 'codex',
    hasThinking: false,
  },
  {
    id: CODEX_MODEL_MAP.gpt53CodexSpark,
    label: 'GPT-5.3-Codex-Spark',
    description: 'Near-instant real-time iteration (ChatGPT Pro research preview).',
    badge: 'Speed',
    provider: 'codex',
    hasThinking: false,
  },
  {
    id: CODEX_MODEL_MAP.gpt52,
    label: 'GPT-5.2 (legacy)',
    description: 'Legacy general-purpose model for debugging tasks requiring deeper analysis.',
    badge: 'Balanced',
    provider: 'codex',
    hasThinking: false,
  },
];

/**
 * OpenCode models derived from OPENCODE_MODEL_CONFIGS
 */
export const OPENCODE_MODELS: ModelOption[] = OPENCODE_MODEL_CONFIGS.map((config) => ({
  id: config.id,
  label: config.label,
  description: config.description,
  badge: config.tier === 'free' ? 'Free' : config.tier === 'premium' ? 'Premium' : undefined,
  provider: config.provider as ModelProvider,
}));

/**
 * Groq models with canonical prefixed IDs
 * IDs use 'groq-' prefix matching the groq-provider getAvailableModels() output
 */
export const GROQ_MODELS: ModelOption[] = [
  {
    id: 'groq-llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B Versatile',
    description: "Meta's most capable Llama 3.3 model, great for complex reasoning.",
    badge: 'Balanced',
    provider: 'groq',
  },
  {
    id: 'groq-llama-3.1-8b-instant',
    label: 'Llama 3.1 8B Instant',
    description: 'Ultra-fast 8B model, ideal for low-latency tasks.',
    badge: 'Speed',
    provider: 'groq',
  },
  {
    id: 'groq-mixtral-8x7b-32768',
    label: 'Mixtral 8x7B',
    description: "Mistral's mixture-of-experts model with 32k context window.",
    badge: 'Balanced',
    provider: 'groq',
  },
  {
    id: 'groq-gemma2-9b-it',
    label: 'Gemma 2 9B IT',
    description: "Google's Gemma 2 instruction-tuned model.",
    badge: 'Speed',
    provider: 'groq',
  },
];

/**
 * All available models (Claude + Cursor + Codex + OpenCode + Groq)
 */
export const ALL_MODELS: ModelOption[] = [
  ...CLAUDE_MODELS,
  ...CURSOR_MODELS,
  ...CODEX_MODELS,
  ...OPENCODE_MODELS,
  ...GROQ_MODELS,
];

export const THINKING_LEVELS: ThinkingLevel[] = ['none', 'low', 'medium', 'high', 'ultrathink'];

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  ultrathink: 'Ultra',
};

/**
 * Reasoning effort levels for Codex/OpenAI models
 * All models support reasoning effort levels
 */
export const REASONING_EFFORT_LEVELS: ReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: 'None',
  minimal: 'Min',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  xhigh: 'XHigh',
};

// Profile icon mapping
export const PROFILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Brain,
  Zap,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
  Anthropic: AnthropicIcon,
  Cursor: CursorIcon,
  Codex: OpenAIIcon,
  OpenCode: OpenCodeIcon,
};
