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
 * Canonical Claude model map - maps prefixed IDs to full model strings
 * Use these IDs for internal storage and routing.
 */
export const CLAUDE_CANONICAL_MAP: Record<ClaudeCanonicalId, string> = {
  'claude-haiku': 'claude-haiku-4-5-20251001',
  'claude-sonnet': 'claude-sonnet-4-6',
  'claude-opus': 'claude-opus-4-6',
} as const;

/**
 * Legacy Claude model aliases (short names) for backward compatibility
 * These map to the same full model strings as the canonical map.
 * @deprecated Use CLAUDE_CANONICAL_MAP for new code
 */
export const CLAUDE_MODEL_MAP: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
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
   * Default for agent orchestration / planning.
   * Historically pointed at `claude-opus-4-6`; now routed through the protoLabs
   * gateway via the proto SDK. Existing callers that key off
   * `DEFAULT_MODELS.claude` continue to compile — only the resolved model id
   * changes. The field name is intentionally NOT renamed in this PR to keep
   * the diff focused; PR 3 (final SDK rip-out) will rename it to `proto`.
   */
  claude: 'protolabs/smart',
  /** Default for auto-mode feature implementation - sonnet for ticket work */
  autoMode: 'claude-sonnet-4-6',
  /** Default for trivial/quick tasks - haiku */
  trivial: 'claude-haiku-4-5-20251001',
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
