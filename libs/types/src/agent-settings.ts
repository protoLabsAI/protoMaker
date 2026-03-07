/**
 * Agent Settings - AI model and agent configuration types
 *
 * Covers thinking levels, model providers, deployment environments,
 * phase model configuration, and ceremony settings.
 */

import type { ModelId } from './model.js';
import type { ReasoningEffort } from './provider.js';

// ============================================================================
// Thinking Level - Extended thinking for Claude models
// ============================================================================

/** ThinkingLevel - Extended thinking levels for Claude models (reasoning intensity) */
export type ThinkingLevel = 'none' | 'low' | 'medium' | 'high' | 'ultrathink';

/**
 * Thinking token budget mapping based on Claude SDK documentation.
 * @see https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
 *
 * - Minimum budget: 1,024 tokens
 * - Complex tasks starting point: 16,000+ tokens
 * - Above 32,000: Risk of timeouts (batch processing recommended)
 */
export const THINKING_TOKEN_BUDGET: Record<ThinkingLevel, number | undefined> = {
  none: undefined, // Thinking disabled
  low: 1024, // Minimum per docs
  medium: 10000, // Light reasoning
  high: 16000, // Complex tasks (recommended starting point)
  ultrathink: 32000, // Maximum safe (above this risks timeouts)
};

/**
 * Convert thinking level to SDK maxThinkingTokens value
 */
export function getThinkingTokenBudget(level: ThinkingLevel | undefined): number | undefined {
  if (!level || level === 'none') return undefined;
  return THINKING_TOKEN_BUDGET[level];
}

// ============================================================================
// Model Provider - AI provider selection
// ============================================================================

/** ModelProvider - AI model provider for credentials and API key management */
export type ModelProvider = 'claude' | 'cursor' | 'codex' | 'opencode' | 'groq';

// ============================================================================
// Deployment Environment - Runtime environment configuration
// ============================================================================

/**
 * DeploymentEnvironment - The runtime environment for this Automaker instance.
 *
 * Affects concurrency limits, heap thresholds, agent model defaults, and monitoring behavior.
 * - 'development': Local dev machine. Conservative limits (2-3 agents, 8GB heap).
 * - 'staging': LAN/VPN test rig. Higher limits (6-10 agents, 32GB+ heap). Used for load testing.
 * - 'production': Live deployment. Stable limits with full monitoring and alerting.
 */
export type DeploymentEnvironment = 'development' | 'staging' | 'production';

/**
 * Environment-specific capacity presets.
 * These serve as defaults — individual settings can override.
 */
export const ENVIRONMENT_PRESETS: Record<
  DeploymentEnvironment,
  {
    maxConcurrency: number;
    defaultModel: 'haiku' | 'sonnet' | 'opus';
    heapLimitMb: number;
    agentTimeoutMs: number;
    enableMetrics: boolean;
  }
> = {
  development: {
    maxConcurrency: 2,
    defaultModel: 'sonnet',
    heapLimitMb: 8192,
    agentTimeoutMs: 10 * 60 * 1000, // 10 min
    enableMetrics: false,
  },
  staging: {
    maxConcurrency: 6,
    defaultModel: 'sonnet',
    heapLimitMb: 32768,
    agentTimeoutMs: 20 * 60 * 1000, // 20 min
    enableMetrics: true,
  },
  production: {
    maxConcurrency: 4,
    defaultModel: 'sonnet',
    heapLimitMb: 16384,
    agentTimeoutMs: 15 * 60 * 1000, // 15 min
    enableMetrics: true,
  },
};

/**
 * Detect the deployment environment from AUTOMAKER_ENV or NODE_ENV.
 * Falls back to 'development' if not set or invalid.
 */
export function getDeploymentEnvironment(): DeploymentEnvironment {
  // Guard against browser environments
  const envValue =
    typeof process !== 'undefined' && process.env
      ? process.env.AUTOMAKER_ENV || process.env.NODE_ENV
      : undefined;

  if (!envValue) return 'development';

  // Normalize common values
  const normalized = envValue.toLowerCase().trim();
  if (normalized === 'production' || normalized === 'prod') return 'production';
  if (normalized === 'staging' || normalized === 'stage') return 'staging';
  if (normalized === 'development' || normalized === 'dev') return 'development';

  return 'development';
}

// ============================================================================
// Phase Model Configuration - Per-phase AI model selection
// ============================================================================

/**
 * PhaseModelEntry - Configuration for a single phase model
 *
 * Encapsulates the model selection and optional reasoning/thinking capabilities:
 * - Claude models: Use thinkingLevel for extended thinking
 * - Codex models: Use reasoningEffort for reasoning intensity
 * - Cursor models: Handle thinking internally
 *
 * For Claude-compatible provider models (GLM, MiniMax, OpenRouter, etc.),
 * the providerId field specifies which provider configuration to use.
 */
export interface PhaseModelEntry {
  /**
   * Provider ID for Claude-compatible provider models.
   * - undefined: Use native Anthropic API (no custom provider)
   * - string: Use the specified ClaudeCompatibleProvider by ID
   *
   * Only required when using models from a ClaudeCompatibleProvider.
   * Native Claude models (claude-haiku, claude-sonnet, claude-opus) and
   * other providers (Cursor, Codex, OpenCode) don't need this field.
   */
  providerId?: string;
  /** The model to use (supports Claude, Cursor, Codex, OpenCode, and dynamic provider IDs) */
  model: ModelId;
  /** Extended thinking level (only applies to Claude models, defaults to 'none') */
  thinkingLevel?: ThinkingLevel;
  /** Reasoning effort level (only applies to Codex models, defaults to 'none') */
  reasoningEffort?: ReasoningEffort;
}

/**
 * PhaseModelConfig - Configuration for AI models used in different application phases
 *
 * Allows users to choose which model (Claude or Cursor) to use for each distinct
 * operation in the application. This provides fine-grained control over cost,
 * speed, and quality tradeoffs.
 */
export interface PhaseModelConfig {
  // Quick tasks - recommend fast/cheap models (Haiku, Cursor auto)
  /** Model for enhancing feature names and descriptions */
  enhancementModel: PhaseModelEntry;
  /** Model for generating file context descriptions */
  fileDescriptionModel: PhaseModelEntry;
  /** Model for analyzing and describing context images */
  imageDescriptionModel: PhaseModelEntry;

  // Validation tasks - recommend smart models (Sonnet, Opus)
  /** Model for validating and improving GitHub issues */
  validationModel: PhaseModelEntry;

  // Generation tasks - recommend powerful models (Opus, Sonnet)
  /** Model for generating full application specifications */
  specGenerationModel: PhaseModelEntry;
  /** Model for creating features from specifications */
  featureGenerationModel: PhaseModelEntry;
  /** Model for reorganizing and prioritizing backlog */
  backlogPlanningModel: PhaseModelEntry;
  /** Model for analyzing project structure */
  projectAnalysisModel: PhaseModelEntry;
  /** Model for AI suggestions (feature, refactoring, security, performance) */
  suggestionsModel: PhaseModelEntry;

  // Memory tasks - for learning extraction and memory operations
  /** Model for extracting learnings from completed agent sessions */
  memoryExtractionModel: PhaseModelEntry;

  // Quick tasks - commit messages
  /** Model for generating git commit messages from diffs */
  commitMessageModel: PhaseModelEntry;

  // Ceremony tasks - retrospectives and milestone announcements
  /** Model for generating project retrospectives and ceremony content */
  ceremonyModel: PhaseModelEntry;

  // Agent execution - the model that implements features in worktrees
  /** Model for agent feature execution (auto-mode and manual agent launches) */
  agentExecutionModel: PhaseModelEntry;

  // Flow-specific models - per-flow model overrides for LangGraph flows
  /**
   * Per-flow model configuration for LangGraph flows.
   * Keys are flow IDs (e.g. 'content-creation', 'antagonistic-review', 'project-planning').
   * When a flow runs with a matching flowId, its model entry overrides the default.
   */
  flowModels?: Record<string, PhaseModelEntry>;
}

/**
 * Keys of PhaseModelConfig for type-safe access to individual phase model entries.
 * Excludes 'flowModels' which is a map of per-flow overrides, not a single PhaseModelEntry.
 */
export type PhaseModelKey = Exclude<keyof PhaseModelConfig, 'flowModels'>;

/** Default phase model configuration - sensible defaults for each task type
 * Uses canonical prefixed model IDs for consistent routing.
 */
export const DEFAULT_PHASE_MODELS: PhaseModelConfig = {
  // Quick tasks - use fast models for speed and cost
  enhancementModel: { model: 'claude-sonnet' },
  fileDescriptionModel: { model: 'claude-haiku' },
  imageDescriptionModel: { model: 'claude-haiku' },

  // Validation - use smart models for accuracy
  validationModel: { model: 'claude-sonnet' },

  // Generation - use powerful models for quality
  specGenerationModel: { model: 'claude-opus' },
  featureGenerationModel: { model: 'claude-sonnet' },
  backlogPlanningModel: { model: 'claude-sonnet' },
  projectAnalysisModel: { model: 'claude-sonnet' },
  suggestionsModel: { model: 'claude-sonnet' },

  // Memory - use fast model for learning extraction (cost-effective)
  memoryExtractionModel: { model: 'claude-haiku' },

  // Commit messages - use fast model for speed
  commitMessageModel: { model: 'claude-haiku' },

  // Ceremony - use capable model for retrospectives and announcements
  ceremonyModel: { model: 'claude-sonnet' },

  // Agent execution - default to sonnet for reliable feature implementation
  agentExecutionModel: { model: 'claude-sonnet' },
};

/**
 * DEFAULT_FLOW_MODELS - Default per-flow model configuration for LangGraph flows.
 *
 * Provides sensible defaults for each known flow ID. Users can override
 * individual flow models in their PhaseModelConfig.flowModels settings.
 * Follows the DEFAULT_FEATURE_FLAGS pattern — this is the single source of truth.
 */
export const DEFAULT_FLOW_MODELS: Record<string, PhaseModelEntry> = {
  'content-creation': { model: 'claude-sonnet' },
  'antagonistic-review': { model: 'claude-sonnet' },
  'project-planning': { model: 'claude-sonnet' },
};

// ============================================================================
// Ceremony Settings - Milestone and project ceremony configuration
// ============================================================================

/**
 * CeremonySettings - Configuration for milestone and project ceremony features
 *
 * Ceremonies are automated events that mark significant project progress:
 * - Epic kickoffs: Posted to Discord when an epic is created with planned scope and complexity
 * - Milestone standups: Posted to Discord when a milestone starts with planned scope
 * - Milestone retros: Sent to Discord when all features in a milestone are done
 * - Epic delivery announcements: Posted when all child features in an epic are complete
 * - Project retrospectives: AI-generated reflections when projects complete
 */
export interface CeremonySettings {
  /** Whether ceremony features are enabled for this project */
  enabled: boolean;
  /** Discord channel ID for ceremony announcements (overrides project default) */
  discordChannelId?: string;
  /** Enable epic kickoff announcements when created (default: true) */
  enableEpicKickoff?: boolean;
  /** Enable milestone standup announcements at start (default: true) */
  enableStandups?: boolean;
  /** Enable milestone completion announcements (default: true) */
  enableMilestoneUpdates?: boolean;
  /** Enable epic delivery announcements (default: true) */
  enableEpicDelivery?: boolean;
  /** Enable project retrospective generation (default: true) */
  enableProjectRetros?: boolean;
  /** Enable content brief generation on milestone completion (default: true) */
  enableContentBriefs?: boolean;
  /** Discord channel ID for content briefs (separate from ceremony channel) */
  contentBriefChannelId?: string;
  /** Enable automated documentation updates after project completion (default: true) */
  enablePostProjectDocs?: boolean;
  /** Model configuration for generating retrospectives */
  retroModel?: PhaseModelEntry;
}

/**
 * DEFAULT_CEREMONY_SETTINGS - Default ceremony configuration.
 *
 * `enabled` defaults to `true` — ceremonies are active out-of-the-box when a
 * `discordChannelId` is configured. Individual ceremony types can be toggled
 * independently. See docs/agents/ceremonies.md for the full reference.
 */
export const DEFAULT_CEREMONY_SETTINGS: CeremonySettings = {
  enabled: true,
  enableEpicKickoff: true,
  enableStandups: true,
  enableMilestoneUpdates: true,
  enableEpicDelivery: true,
  enableProjectRetros: true,
  enableContentBriefs: true,
  enablePostProjectDocs: true,
};
