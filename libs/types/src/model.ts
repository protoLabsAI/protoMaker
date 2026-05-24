/**
 * Model alias mapping for Claude models
 */
import type { CursorModelId } from './cursor-models.js';
import type { OpencodeModelId } from './opencode-models.js';

/**
 * Canonical Claude model IDs with provider prefix
 * Used for internal storage and consistent provider routing.
 */
export type ClaudeCanonicalId = 'claude-haiku' | 'claude-sonnet' | 'claude-opus';

/**
 * Canonical Claude model map - maps prefixed IDs to gateway tier IDs.
 *
 * All Claude routing goes through the protoLabs gateway — the gateway-issued
 * API key is the only credential the product expects. The three "claude-*"
 * aliases below are the public symbols app code uses; resolving them yields
 * a `protolabs/*` tier name that the gateway accepts.
 *
 * If you need to call the Anthropic API directly (which the product no longer
 * supports), wire that path through a dedicated provider, not this map.
 */
export const CLAUDE_CANONICAL_MAP: Record<ClaudeCanonicalId, string> = {
  'claude-haiku': 'protolabs/fast',
  'claude-sonnet': 'protolabs/smart',
  'claude-opus': 'protolabs/reasoning',
} as const;

/**
 * Short-name Claude model aliases. Resolves to the same gateway tiers as
 * CLAUDE_CANONICAL_MAP. Kept as a distinct map because settings storage and
 * older config blobs use the bare short names.
 */
export const CLAUDE_MODEL_MAP: Record<string, string> = {
  haiku: 'protolabs/fast',
  sonnet: 'protolabs/smart',
  opus: 'protolabs/reasoning',
} as const;

/**
 * Full versioned Claude model strings that may appear in persisted settings
 * from before the gateway cutover. Migrated to gateway tiers via
 * `migrateModelId`. Any new entry that arrives via a settings reload or an
 * API call still routes through the gateway.
 */
export const LEGACY_CLAUDE_FULL_MODEL_MAP: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'protolabs/fast',
  'claude-haiku-4-5': 'protolabs/fast',
  'claude-sonnet-4-6': 'protolabs/smart',
  'claude-sonnet-4-5-20250929': 'protolabs/smart',
  'claude-sonnet-4-5': 'protolabs/smart',
  'claude-opus-4-6': 'protolabs/reasoning',
  'claude-opus-4-5': 'protolabs/reasoning',
} as const;

/**
 * Map from legacy aliases to canonical IDs
 */
export const LEGACY_CLAUDE_ALIAS_MAP: Record<string, ClaudeCanonicalId> = {
  haiku: 'claude-haiku',
  sonnet: 'claude-sonnet',
  opus: 'claude-opus',
} as const;

/**
 * Codex/OpenAI model identifiers
 * Based on OpenAI Codex CLI official models
 * See: https://developers.openai.com/codex/models/
 *
 * IMPORTANT: All Codex models use 'codex-' prefix to distinguish from Cursor CLI models
 */
export const CODEX_MODEL_MAP = {
  // Flagship: complex coding, computer use, knowledge work, and research workflows
  gpt55: 'codex-gpt-5.5',
  // Professional coding combined with stronger reasoning + agentic capabilities
  gpt54: 'codex-gpt-5.4',
  // Fast, lightweight tasks and subagent operations (limited reasoning/vision)
  gpt54Mini: 'codex-gpt-5.4-mini',
  // Codex-tuned: industry-leading coding performance for complex software engineering
  gpt53Codex: 'codex-gpt-5.3-codex',
  // Codex-tuned, near-instant real-time iteration (ChatGPT Pro research preview)
  gpt53CodexSpark: 'codex-gpt-5.3-codex-spark',
  // Legacy general-purpose, kept for users who pinned it before the 5.5 release
  gpt52: 'codex-gpt-5.2',
} as const;

export const CODEX_MODEL_IDS = Object.values(CODEX_MODEL_MAP);

/**
 * Models that support reasoning effort configuration
 * These models can use reasoning.effort parameter
 *
 * Per the OpenAI Codex docs (https://developers.openai.com/codex/models/), the
 * 5.5 / 5.4 line exposes reasoning effort; the 5.4-mini, 5.3-codex line, and
 * the 5.2 legacy model do not.
 */
export const REASONING_CAPABLE_MODELS = new Set([CODEX_MODEL_MAP.gpt55, CODEX_MODEL_MAP.gpt54]);

/**
 * Check if a model supports reasoning effort configuration
 */
export function supportsReasoningEffort(modelId: string): boolean {
  return REASONING_CAPABLE_MODELS.has(modelId as any);
}

/**
 * Get all Codex model IDs as an array
 */
export function getAllCodexModelIds(): CodexModelId[] {
  return CODEX_MODEL_IDS as CodexModelId[];
}

/**
 * Default models per provider and use case
 * Uses canonical prefixed IDs for consistent routing.
 *
 * Model hierarchy:
 * - opus: Orchestration, planning, complex reasoning
 * - sonnet: Feature implementation, ticket work (best balance of capability/cost)
 * - haiku: Trivial tasks, quick operations
 */
export const DEFAULT_MODELS = {
  /**
   * Default for agent orchestration / planning + escalation-to-strongest path.
   * Routed through the protoLabs gateway via the proto SDK. This is the tier
   * used for architectural features, 2+ failure retries, and the reasoning
   * path in the lead engineer.
   */
  claude: 'protolabs/reasoning',
  /** Default for auto-mode feature implementation — smart tier for ticket work. */
  autoMode: 'protolabs/smart',
  /** Default for trivial / quick tasks — fast tier for speed and cost. */
  trivial: 'protolabs/fast',
  cursor: 'cursor-auto', // Cursor's recommended default (with prefix)
  codex: CODEX_MODEL_MAP.gpt55, // GPT-5.5 is the current flagship Codex model
} as const;

export type ModelAlias = keyof typeof CLAUDE_MODEL_MAP;
export type CodexModelId = (typeof CODEX_MODEL_MAP)[keyof typeof CODEX_MODEL_MAP];

/**
 * AgentModel - Alias for ModelAlias for backward compatibility
 * Represents available models across providers
 */
export type AgentModel = ModelAlias | CodexModelId;

/**
 * Dynamic provider model IDs discovered at runtime (provider/model format)
 */
export type DynamicModelId = `${string}/${string}`;

/**
 * Provider-prefixed model IDs used for routing
 */
export type PrefixedCursorModelId = `cursor-${string}`;
export type PrefixedOpencodeModelId = `opencode-${string}`;

/**
 * ModelId - Unified model identifier across providers
 */
export type ModelId =
  | ModelAlias
  | CodexModelId
  | CursorModelId
  | OpencodeModelId
  | DynamicModelId
  | PrefixedCursorModelId
  | PrefixedOpencodeModelId;
