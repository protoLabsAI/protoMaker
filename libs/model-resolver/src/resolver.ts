/**
 * Model resolution utilities for handling model string mapping
 *
 * Provides centralized model resolution logic:
 * - Maps Claude model aliases to full model strings
 * - Passes through Cursor models unchanged (handled by CursorProvider)
 * - Provides default models per provider
 * - Handles multiple model sources with priority
 *
 * With canonical model IDs:
 * - Cursor: cursor-auto, cursor-composer-1, cursor-gpt-5.2
 * - OpenCode: opencode-big-pickle, opencode-grok-code
 * - Claude: claude-haiku, claude-sonnet, claude-opus (also supports legacy aliases)
 */

import {
  CLAUDE_MODEL_MAP,
  CLAUDE_CANONICAL_MAP,
  CURSOR_MODEL_MAP,
  CODEX_MODEL_MAP,
  DEFAULT_MODELS,
  PROVIDER_PREFIXES,
  isCursorModel,
  isOpencodeModel,
  stripProviderPrefix,
  migrateModelId,
  type PhaseModelEntry,
  type ThinkingLevel,
} from '@protolabs-ai/types';

// Pattern definitions for Codex/OpenAI models
const CODEX_MODEL_PREFIXES = ['codex-', 'gpt-'];
const OPENAI_O_SERIES_PATTERN = /^o\d/;
const OPENAI_O_SERIES_ALLOWED_MODELS = new Set<string>();

/** Groq model aliases - short aliases that map to full Groq model IDs */
const GROQ_MODEL_ALIASES: Record<string, string> = {
  'llama-3.3-70b': 'llama-3.3-70b-versatile',
  mixtral: 'mixtral-8x7b-32768',
  'llama-3.1-8b': 'llama-3.1-8b-instant',
};

/** Known Groq model IDs (full form) */
const GROQ_MODEL_IDS = new Set([
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
]);

/**
 * Resolve a model key/alias to a full model string
 *
 * Handles both canonical prefixed IDs and legacy aliases:
 * - Canonical: cursor-auto, cursor-gpt-5.2, opencode-big-pickle, claude-sonnet
 * - Legacy: auto, composer-1, sonnet, opus
 *
 * @param modelKey - Model key (e.g., "claude-opus", "cursor-composer-1", "sonnet")
 * @param defaultModel - Fallback model if modelKey is undefined
 * @returns Full model string
 */
export function resolveModelString(
  modelKey?: string,
  defaultModel: string = DEFAULT_MODELS.claude
): string {
  // No model specified - use default
  if (!modelKey) {
    return defaultModel;
  }

  // First, migrate legacy IDs to canonical format
  const canonicalKey = migrateModelId(modelKey);

  // Cursor model with explicit prefix (e.g., "cursor-auto", "cursor-composer-1")
  // Pass through unchanged - provider will extract bare ID for CLI
  if (canonicalKey.startsWith(PROVIDER_PREFIXES.cursor)) {
    return canonicalKey;
  }

  // Codex model with explicit prefix (e.g., "codex-gpt-5.1-codex-max")
  if (canonicalKey.startsWith(PROVIDER_PREFIXES.codex)) {
    return canonicalKey;
  }

  // OpenCode model (static with opencode- prefix or dynamic with provider/model format)
  if (isOpencodeModel(canonicalKey)) {
    return canonicalKey;
  }

  // Claude canonical ID (claude-haiku, claude-sonnet, claude-opus)
  // Map to full model string
  if (canonicalKey in CLAUDE_CANONICAL_MAP) {
    return CLAUDE_CANONICAL_MAP[canonicalKey as keyof typeof CLAUDE_CANONICAL_MAP];
  }

  // Full Claude model string (e.g., claude-sonnet-4-5-20250929) - pass through
  if (canonicalKey.includes('claude-')) {
    return canonicalKey;
  }

  // Legacy Claude model alias (sonnet, opus, haiku) - support for backward compatibility
  const resolved = CLAUDE_MODEL_MAP[canonicalKey];
  if (resolved) {
    return resolved;
  }

  // OpenAI/Codex models - check for gpt- prefix
  if (
    CODEX_MODEL_PREFIXES.some((prefix) => canonicalKey.startsWith(prefix)) ||
    (OPENAI_O_SERIES_PATTERN.test(canonicalKey) && OPENAI_O_SERIES_ALLOWED_MODELS.has(canonicalKey))
  ) {
    return canonicalKey;
  }

  // Groq model aliases (e.g., 'llama-3.3-70b' → 'llama-3.3-70b-versatile')
  if (canonicalKey in GROQ_MODEL_ALIASES) {
    return GROQ_MODEL_ALIASES[canonicalKey];
  }

  // Known Groq model IDs - pass through unchanged
  if (GROQ_MODEL_IDS.has(canonicalKey)) {
    return canonicalKey;
  }

  // Groq model with explicit groq/ prefix - pass through
  if (canonicalKey.startsWith('groq/')) {
    return canonicalKey;
  }

  // Unknown model key - pass through as-is (could be a provider model like GLM-4.7, MiniMax-M2.1)
  // This allows ClaudeCompatibleProvider models to work without being registered here
  return canonicalKey;
}

/**
 * Get the effective model from multiple sources
 * Priority: explicit model > session model > default
 *
 * @param explicitModel - Explicitly provided model (highest priority)
 * @param sessionModel - Model from session (medium priority)
 * @param defaultModel - Fallback default model (lowest priority)
 * @returns Resolved model string
 */
export function getEffectiveModel(
  explicitModel?: string,
  sessionModel?: string,
  defaultModel?: string
): string {
  return resolveModelString(explicitModel || sessionModel, defaultModel);
}

/**
 * Result of resolving a phase model entry
 */
export interface ResolvedPhaseModel {
  /** Resolved model string (full model ID) */
  model: string;
  /** Optional thinking level for extended thinking */
  thinkingLevel?: ThinkingLevel;
  /** Provider ID if using a ClaudeCompatibleProvider */
  providerId?: string;
}

/**
 * Resolve a phase model entry to a model string and thinking level
 *
 * Handles both legacy format (string) and new format (PhaseModelEntry object).
 * This centralizes the pattern used across phase model routes.
 *
 * @param phaseModel - Phase model entry (string or PhaseModelEntry object)
 * @param defaultModel - Fallback model if resolution fails
 * @returns Resolved model string and optional thinking level
 *
 * @remarks
 * - For Cursor models, `thinkingLevel` is returned as `undefined` since Cursor
 *   handles thinking internally via model variants (e.g., 'claude-sonnet-4-thinking')
 * - Defensively handles null/undefined from corrupted settings JSON
 *
 * @example
 * ```ts
 * const phaseModel = settings?.phaseModels?.enhancementModel || DEFAULT_PHASE_MODELS.enhancementModel;
 * const { model, thinkingLevel } = resolvePhaseModel(phaseModel);
 * ```
 */
export function resolvePhaseModel(
  phaseModel: string | PhaseModelEntry | null | undefined,
  defaultModel: string = DEFAULT_MODELS.claude
): ResolvedPhaseModel {
  // Handle null/undefined (defensive against corrupted JSON)
  if (!phaseModel) {
    return {
      model: resolveModelString(undefined, defaultModel),
      thinkingLevel: undefined,
    };
  }

  // Handle legacy string format
  if (typeof phaseModel === 'string') {
    return {
      model: resolveModelString(phaseModel, defaultModel),
      thinkingLevel: undefined,
    };
  }

  // If providerId is set, pass through the model string unchanged
  // (it's a provider-specific model ID like "GLM-4.5-Air", not a Claude alias)
  if (phaseModel.providerId) {
    return {
      model: phaseModel.model, // Pass through unchanged
      thinkingLevel: phaseModel.thinkingLevel,
      providerId: phaseModel.providerId,
    };
  }

  // No providerId - resolve through normal Claude model mapping
  return {
    model: resolveModelString(phaseModel.model, defaultModel),
    thinkingLevel: phaseModel.thinkingLevel,
  };
}
