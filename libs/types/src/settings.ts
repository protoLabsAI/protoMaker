/**
 * Settings Types - Shared types for file-based settings storage
 *
 * Defines the structure for global settings, credentials, and per-project settings
 * that are persisted to disk in JSON format. These types are used by both the server
 * (for file I/O via SettingsService) and the UI (for state management and sync).
 */

import type { ModelAlias, ModelId } from './model.js';
import type { CursorModelId } from './cursor-models.js';
import { CURSOR_MODEL_MAP, getAllCursorModelIds } from './cursor-models.js';
import type { OpencodeModelId } from './opencode-models.js';
import { getAllOpencodeModelIds, DEFAULT_OPENCODE_MODEL } from './opencode-models.js';
import type { PromptCustomization } from './prompts.js';
import type { CodexSandboxMode, CodexApprovalPolicy } from './codex.js';
import type { ReasoningEffort } from './provider.js';
import type { PolicyConfig } from './policy.js';

// Re-export ModelAlias for convenience
export type { ModelAlias };

/**
 * ThemeMode - Available color themes for the UI
 *
 * Includes system theme and multiple color schemes organized by dark/light:
 * - System: Respects OS dark/light mode preference
 * - Dark themes (16): dark, retro, dracula, nord, monokai, tokyonight, solarized,
 *   gruvbox, catppuccin, onedark, synthwave, red, sunset, gray, forest, ocean
 * - Light themes (16): light, cream, solarizedlight, github, paper, rose, mint,
 *   lavender, sand, sky, peach, snow, sepia, gruvboxlight, nordlight, blossom
 */
export type ThemeMode =
  | 'system'
  // Dark themes (16)
  | 'dark'
  | 'retro'
  | 'dracula'
  | 'nord'
  | 'monokai'
  | 'tokyonight'
  | 'solarized'
  | 'gruvbox'
  | 'catppuccin'
  | 'onedark'
  | 'synthwave'
  | 'red'
  | 'sunset'
  | 'gray'
  | 'forest'
  | 'ocean'
  // Light themes (16)
  | 'light'
  | 'cream'
  | 'solarizedlight'
  | 'github'
  | 'paper'
  | 'rose'
  | 'mint'
  | 'lavender'
  | 'sand'
  | 'sky'
  | 'peach'
  | 'snow'
  | 'sepia'
  | 'gruvboxlight'
  | 'nordlight'
  | 'blossom';

/** PlanningMode - Planning levels for feature generation workflows */
export type PlanningMode = 'skip' | 'lite' | 'spec' | 'full';

/** ServerLogLevel - Log verbosity level for the API server */
export type ServerLogLevel = 'error' | 'warn' | 'info' | 'debug';

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

/** ModelProvider - AI model provider for credentials and API key management */
export type ModelProvider = 'claude' | 'cursor' | 'codex' | 'opencode';

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
// Claude-Compatible Providers - Configuration for Claude-compatible API endpoints
// ============================================================================

/**
 * ApiKeySource - Strategy for sourcing API keys
 *
 * - 'inline': API key stored directly in the profile (legacy/default behavior)
 * - 'env': Use ANTHROPIC_API_KEY environment variable
 * - 'credentials': Use the Anthropic key from Settings → API Keys (credentials.json)
 */
export type ApiKeySource = 'inline' | 'env' | 'credentials';

/**
 * ClaudeCompatibleProviderType - Type of Claude-compatible provider
 *
 * Used to determine provider-specific UI screens and default configurations.
 */
export type ClaudeCompatibleProviderType =
  | 'anthropic' // Direct Anthropic API (built-in)
  | 'glm' // z.AI GLM
  | 'minimax' // MiniMax
  | 'openrouter' // OpenRouter proxy
  | 'custom'; // User-defined custom provider

/**
 * ClaudeModelAlias - The three main Claude model aliases for mapping
 */
export type ClaudeModelAlias = 'haiku' | 'sonnet' | 'opus';

/**
 * ProviderModel - A model exposed by a Claude-compatible provider
 *
 * Each provider configuration can expose multiple models that will appear
 * in all model dropdowns throughout the app. Models map directly to a
 * Claude model (haiku, sonnet, opus) for bulk replace and display.
 */
export interface ProviderModel {
  /** Model ID sent to the API (e.g., "GLM-4.7", "MiniMax-M2.1") */
  id: string;
  /** Display name shown in UI (e.g., "GLM 4.7", "MiniMax M2.1") */
  displayName: string;
  /** Which Claude model this maps to (for bulk replace and display) */
  mapsToClaudeModel?: ClaudeModelAlias;
  /** Model capabilities */
  capabilities?: {
    /** Whether model supports vision/image inputs */
    supportsVision?: boolean;
    /** Whether model supports extended thinking */
    supportsThinking?: boolean;
    /** Maximum thinking level if thinking is supported */
    maxThinkingLevel?: ThinkingLevel;
  };
}

/**
 * ClaudeCompatibleProvider - Configuration for a Claude-compatible API endpoint
 *
 * Providers expose their models to all model dropdowns in the app.
 * Each provider has its own API configuration (endpoint, credentials, etc.)
 */
export interface ClaudeCompatibleProvider {
  /** Unique identifier (uuid) */
  id: string;
  /** Display name (e.g., "z.AI GLM (Work)", "MiniMax") */
  name: string;
  /** Provider type determines UI screen and default settings */
  providerType: ClaudeCompatibleProviderType;
  /** Whether this provider is enabled (models appear in dropdowns) */
  enabled?: boolean;

  // Connection settings
  /** ANTHROPIC_BASE_URL - custom API endpoint */
  baseUrl: string;
  /** API key sourcing strategy */
  apiKeySource: ApiKeySource;
  /** API key value (only required when apiKeySource = 'inline') */
  apiKey?: string;
  /** If true, use ANTHROPIC_AUTH_TOKEN instead of ANTHROPIC_API_KEY */
  useAuthToken?: boolean;
  /** API_TIMEOUT_MS override in milliseconds */
  timeoutMs?: number;
  /** Set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 */
  disableNonessentialTraffic?: boolean;

  /** Models exposed by this provider (appear in all dropdowns) */
  models: ProviderModel[];

  /** Provider-specific settings for future extensibility */
  providerSettings?: Record<string, unknown>;
}

/**
 * ClaudeApiProfile - Configuration for a Claude-compatible API endpoint
 *
 * @deprecated Use ClaudeCompatibleProvider instead. This type is kept for
 * backward compatibility during migration.
 */
export interface ClaudeApiProfile {
  /** Unique identifier (uuid) */
  id: string;
  /** Display name (e.g., "z.AI GLM", "AWS Bedrock") */
  name: string;
  /** ANTHROPIC_BASE_URL - custom API endpoint */
  baseUrl: string;
  /**
   * API key sourcing strategy (default: 'inline' for backwards compatibility)
   * - 'inline': Use apiKey field value
   * - 'env': Use ANTHROPIC_API_KEY environment variable
   * - 'credentials': Use the Anthropic key from credentials.json
   */
  apiKeySource?: ApiKeySource;
  /** API key value (only required when apiKeySource = 'inline' or undefined) */
  apiKey?: string;
  /** If true, use ANTHROPIC_AUTH_TOKEN instead of ANTHROPIC_API_KEY */
  useAuthToken?: boolean;
  /** API_TIMEOUT_MS override in milliseconds */
  timeoutMs?: number;
  /** Optional model name mappings (deprecated - use ClaudeCompatibleProvider.models instead) */
  modelMappings?: {
    /** Maps to ANTHROPIC_DEFAULT_HAIKU_MODEL */
    haiku?: string;
    /** Maps to ANTHROPIC_DEFAULT_SONNET_MODEL */
    sonnet?: string;
    /** Maps to ANTHROPIC_DEFAULT_OPUS_MODEL */
    opus?: string;
  };
  /** Set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 */
  disableNonessentialTraffic?: boolean;
}

/**
 * ClaudeCompatibleProviderTemplate - Template for quick provider setup
 *
 * Contains pre-configured settings for known Claude-compatible providers.
 */
export interface ClaudeCompatibleProviderTemplate {
  /** Template identifier for matching */
  templateId: ClaudeCompatibleProviderType;
  /** Display name for the template */
  name: string;
  /** Provider type */
  providerType: ClaudeCompatibleProviderType;
  /** API base URL */
  baseUrl: string;
  /** Default API key source for this template */
  defaultApiKeySource: ApiKeySource;
  /** Use auth token instead of API key */
  useAuthToken: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Disable non-essential traffic */
  disableNonessentialTraffic?: boolean;
  /** Description shown in UI */
  description: string;
  /** URL to get API key */
  apiKeyUrl?: string;
  /** Default models for this provider */
  defaultModels: ProviderModel[];
}

/** Predefined templates for known Claude-compatible providers */
export const CLAUDE_PROVIDER_TEMPLATES: ClaudeCompatibleProviderTemplate[] = [
  {
    templateId: 'anthropic',
    name: 'Direct Anthropic',
    providerType: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultApiKeySource: 'credentials',
    useAuthToken: false,
    description: 'Standard Anthropic API with your API key',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModels: [
      { id: 'claude-haiku', displayName: 'Claude Haiku', mapsToClaudeModel: 'haiku' },
      { id: 'claude-sonnet', displayName: 'Claude Sonnet', mapsToClaudeModel: 'sonnet' },
      { id: 'claude-opus', displayName: 'Claude Opus', mapsToClaudeModel: 'opus' },
    ],
  },
  {
    templateId: 'openrouter',
    name: 'OpenRouter',
    providerType: 'openrouter',
    baseUrl: 'https://openrouter.ai/api',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    description: 'Access Claude and 300+ models via OpenRouter',
    apiKeyUrl: 'https://openrouter.ai/keys',
    defaultModels: [
      // OpenRouter users manually add model IDs
      {
        id: 'anthropic/claude-3.5-haiku',
        displayName: 'Claude 3.5 Haiku',
        mapsToClaudeModel: 'haiku',
      },
      {
        id: 'anthropic/claude-3.5-sonnet',
        displayName: 'Claude 3.5 Sonnet',
        mapsToClaudeModel: 'sonnet',
      },
      { id: 'anthropic/claude-3-opus', displayName: 'Claude 3 Opus', mapsToClaudeModel: 'opus' },
    ],
  },
  {
    templateId: 'glm',
    name: 'z.AI GLM',
    providerType: 'glm',
    baseUrl: 'https://api.z.ai/api/anthropic',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    timeoutMs: 3000000,
    disableNonessentialTraffic: true,
    description: '3× usage at fraction of cost via GLM Coding Plan',
    apiKeyUrl: 'https://z.ai/manage-apikey/apikey-list',
    defaultModels: [
      { id: 'GLM-4.5-Air', displayName: 'GLM 4.5 Air', mapsToClaudeModel: 'haiku' },
      { id: 'GLM-4.7', displayName: 'GLM 4.7', mapsToClaudeModel: 'sonnet' },
      { id: 'GLM-4.7', displayName: 'GLM 4.7', mapsToClaudeModel: 'opus' },
    ],
  },
  {
    templateId: 'minimax',
    name: 'MiniMax',
    providerType: 'minimax',
    baseUrl: 'https://api.minimax.io/anthropic',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    timeoutMs: 3000000,
    disableNonessentialTraffic: true,
    description: 'MiniMax M2.1 coding model with extended context',
    apiKeyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    defaultModels: [
      { id: 'MiniMax-M2.1', displayName: 'MiniMax M2.1', mapsToClaudeModel: 'haiku' },
      { id: 'MiniMax-M2.1', displayName: 'MiniMax M2.1', mapsToClaudeModel: 'sonnet' },
      { id: 'MiniMax-M2.1', displayName: 'MiniMax M2.1', mapsToClaudeModel: 'opus' },
    ],
  },
  {
    templateId: 'minimax',
    name: 'MiniMax (China)',
    providerType: 'minimax',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    timeoutMs: 3000000,
    disableNonessentialTraffic: true,
    description: 'MiniMax M2.1 for users in China',
    apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    defaultModels: [
      { id: 'MiniMax-M2.1', displayName: 'MiniMax M2.1', mapsToClaudeModel: 'haiku' },
      { id: 'MiniMax-M2.1', displayName: 'MiniMax M2.1', mapsToClaudeModel: 'sonnet' },
      { id: 'MiniMax-M2.1', displayName: 'MiniMax M2.1', mapsToClaudeModel: 'opus' },
    ],
  },
];

/**
 * @deprecated Use ClaudeCompatibleProviderTemplate instead
 */
export interface ClaudeApiProfileTemplate {
  name: string;
  baseUrl: string;
  defaultApiKeySource?: ApiKeySource;
  useAuthToken: boolean;
  timeoutMs?: number;
  modelMappings?: ClaudeApiProfile['modelMappings'];
  disableNonessentialTraffic?: boolean;
  description: string;
  apiKeyUrl?: string;
}

/**
 * @deprecated Use CLAUDE_PROVIDER_TEMPLATES instead
 */
export const CLAUDE_API_PROFILE_TEMPLATES: ClaudeApiProfileTemplate[] = [
  {
    name: 'Direct Anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultApiKeySource: 'credentials',
    useAuthToken: false,
    description: 'Standard Anthropic API with your API key',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    description: 'Access Claude and 300+ models via OpenRouter',
    apiKeyUrl: 'https://openrouter.ai/keys',
  },
  {
    name: 'z.AI GLM',
    baseUrl: 'https://api.z.ai/api/anthropic',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    timeoutMs: 3000000,
    modelMappings: {
      haiku: 'GLM-4.5-Air',
      sonnet: 'GLM-4.7',
      opus: 'GLM-4.7',
    },
    disableNonessentialTraffic: true,
    description: '3× usage at fraction of cost via GLM Coding Plan',
    apiKeyUrl: 'https://z.ai/manage-apikey/apikey-list',
  },
  {
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.io/anthropic',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    timeoutMs: 3000000,
    modelMappings: {
      haiku: 'MiniMax-M2.1',
      sonnet: 'MiniMax-M2.1',
      opus: 'MiniMax-M2.1',
    },
    disableNonessentialTraffic: true,
    description: 'MiniMax M2.1 coding model with extended context',
    apiKeyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
  },
  {
    name: 'MiniMax (China)',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    defaultApiKeySource: 'inline',
    useAuthToken: true,
    timeoutMs: 3000000,
    modelMappings: {
      haiku: 'MiniMax-M2.1',
      sonnet: 'MiniMax-M2.1',
      opus: 'MiniMax-M2.1',
    },
    disableNonessentialTraffic: true,
    description: 'MiniMax M2.1 for users in China',
    apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  },
];

// ============================================================================
// Webhook Settings - Re-export from webhook.ts for convenience
// ============================================================================

export type { WebhookSettings } from './webhook.js';
export { DEFAULT_WEBHOOK_SETTINGS } from './webhook.js';

// ============================================================================
// Discord Integration Settings - Configuration for Discord bot and notifications
// ============================================================================

/**
 * DiscordUserDMConfig - Configuration for user-specific Discord DM functionality
 *
 * Maps a human user to their Discord username for agent DM capabilities.
 * Agents can send DMs to their assigned human using this configuration.
 */
export interface DiscordUserDMConfig {
  /** Human's identifier/email/name (used internally) */
  userId: string;
  /** Discord username to send DMs to */
  discordUsername: string;
  /** Whether this user has opted in to receive DMs from agents */
  dmEnabled: boolean;
}

/**
 * DiscordSettings - Configuration for Discord MCP integration
 *
 * Supports Discord bot integration via the discord-mcp server for:
 * - Sending progress notifications to channels
 * - Announcing feature completion
 * - Headsdown mode status updates
 * - Team communication automation
 * - Direct messages between agents and their assigned humans
 */
export interface DiscordSettings {
  /** Whether Discord integration is enabled */
  enabled: boolean;
  /** Discord bot token (stored in credentials.json for security) */
  tokenConfigured?: boolean; // Just a flag, actual token in credentials
  /** Discord server/guild ID */
  guildId?: string;
  /** Default channel ID for progress notifications */
  notificationChannelId?: string;
  /** Default channel name for display purposes */
  notificationChannelName?: string;
  /** Enable automatic progress updates during auto-mode */
  autoNotify?: boolean;
  /** Notify on feature start */
  notifyOnFeatureStart?: boolean;
  /** Notify on feature completion */
  notifyOnFeatureComplete?: boolean;
  /** Notify on milestone completion */
  notifyOnMilestoneComplete?: boolean;
  /** Notify on project completion */
  notifyOnProjectComplete?: boolean;
  /** Notify on agent errors/failures */
  notifyOnError?: boolean;
  /** User DM configurations (maps users to Discord usernames) */
  userDMConfig?: DiscordUserDMConfig[];
}

/**
 * Default Discord settings - disabled by default
 */
export const DEFAULT_DISCORD_SETTINGS: DiscordSettings = {
  enabled: false,
  tokenConfigured: false,
  guildId: undefined,
  notificationChannelId: undefined,
  notificationChannelName: undefined,
  autoNotify: false,
  notifyOnFeatureStart: false,
  notifyOnFeatureComplete: true,
  notifyOnMilestoneComplete: true,
  notifyOnProjectComplete: true,
  notifyOnError: true,
};

// ============================================================================
// Event Hooks - Custom actions triggered by system events
// ============================================================================

/**
 * EventHookTrigger - Event types that can trigger custom hooks
 *
 * - feature_created: A new feature was created
 * - feature_success: Feature completed successfully
 * - feature_error: Feature failed with an error
 * - feature_retry: Feature is being retried after a failure
 * - feature_recovery: A recovery action was taken for a feature
 * - auto_mode_complete: Auto mode finished processing all features
 * - auto_mode_error: Auto mode encountered a critical error and paused
 * - auto_mode_health_check: Periodic health status check
 * - skill_created: An agent created a new reusable skill
 * - memory_learning: A new learning was recorded from agent execution
 * - pr_feedback_received: Pull request received feedback that needs addressing
 * - project_scaffolded: A project was scaffolded and features were created
 * - project_deleted: A project was deleted
 * - health_check_critical: Health check detected critical or degraded status
 */
export type EventHookTrigger =
  | 'feature_created'
  | 'feature_success'
  | 'feature_error'
  | 'feature_retry'
  | 'feature_recovery'
  | 'auto_mode_complete'
  | 'auto_mode_error'
  | 'auto_mode_health_check'
  | 'skill_created'
  | 'memory_learning'
  | 'pr_feedback_received'
  | 'project_scaffolded'
  | 'project_deleted'
  | 'milestone_completed'
  | 'project_completed'
  | 'health_check_critical';

// ============================================================================
// Git Workflow Settings - Auto commit/push/PR after feature completion
// ============================================================================

/**
 * PR merge strategy for auto-merge
 * - merge: Create a merge commit (preserves all commits)
 * - squash: Squash all commits into a single commit
 * - rebase: Rebase and merge (creates a linear history)
 */
export type PRMergeStrategy = 'merge' | 'squash' | 'rebase';

/**
 * GitWorkflowSettings - Configuration for automatic git operations after feature completion
 *
 * When an agent successfully completes a feature, these settings control whether
 * to automatically commit changes, push to remote, create a pull request, and merge it.
 */
export interface GitWorkflowSettings {
  /** Auto-commit changes when feature reaches verified status (default: true) */
  autoCommit?: boolean;
  /** Auto-push to remote after commit - requires autoCommit (default: true) */
  autoPush?: boolean;
  /** Auto-create PR after push - requires autoPush (default: true) */
  autoCreatePR?: boolean;
  /** Auto-merge PR after creation - requires autoCreatePR (default: false) */
  autoMergePR?: boolean;
  /** PR merge strategy: merge, squash, or rebase (default: 'squash') */
  prMergeStrategy?: PRMergeStrategy;
  /** Wait for CI checks to pass before merging (default: true) */
  waitForCI?: boolean;
  /** Base branch for PR creation (default: 'main') */
  prBaseBranch?: string;
}

// ============================================================================
// Graphite CLI Integration - Stack-aware PR management
// ============================================================================

/**
 * GraphiteSettings - Configuration for Graphite CLI integration
 *
 * Graphite provides stack-aware PR management, making it easier to work with
 * feature branches that stack on epic branches. When enabled, Automaker uses
 * Graphite CLI commands instead of raw git/gh commands for better stack handling.
 *
 * @see https://graphite.dev/docs/graphite-cli
 */
export interface GraphiteSettings {
  /** Enable Graphite CLI integration (default: false) */
  enabled: boolean;
  /** Use gt commit instead of git commit (default: false) */
  useGraphiteCommit?: boolean;
  /** Auto-track epic branches as stack parents (default: true) */
  autoTrackEpics?: boolean;
  /** Use gt stack submit for bulk PR creation (default: false) */
  useStackSubmit?: boolean;
}

/**
 * Default Graphite settings - disabled by default for backward compatibility
 */
export const DEFAULT_GRAPHITE_SETTINGS: GraphiteSettings = {
  enabled: false,
  useGraphiteCommit: false,
  autoTrackEpics: true,
  useStackSubmit: false,
};

/**
 * Default git workflow settings - commit/push/PR/auto-merge enabled by default
 */
export const DEFAULT_GIT_WORKFLOW_SETTINGS: Required<GitWorkflowSettings> = {
  autoCommit: true,
  autoPush: true,
  autoCreatePR: true,
  autoMergePR: true,
  prMergeStrategy: 'squash',
  waitForCI: true,
  prBaseBranch: 'main',
};

/**
 * GitWorkflowResult - Result of running the git workflow after feature completion
 */
export interface GitWorkflowResult {
  /** Commit hash if changes were committed (null if no changes or commit disabled) */
  commitHash: string | null;
  /** Whether the branch was pushed to remote */
  pushed: boolean;
  /** URL of created PR (null if PR creation disabled or failed) */
  prUrl: string | null;
  /** PR number if created */
  prNumber?: number;
  /** Whether a PR already existed for this branch */
  prAlreadyExisted?: boolean;
  /** Whether the PR was merged (null if auto-merge disabled or failed) */
  merged?: boolean;
  /** Commit SHA of the merge commit (if merged) */
  mergeCommitSha?: string;
  /** Timestamp when the PR was created (ISO 8601) */
  prCreatedAt?: string;
  /** Timestamp when the PR was merged (ISO 8601) */
  prMergedAt?: string;
  /** Error message if any step failed (workflow continues best-effort) */
  error?: string;
}

/** HTTP methods supported for webhook requests */
export type EventHookHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH';

/**
 * EventHookShellAction - Configuration for executing a shell command
 *
 * Shell commands are executed in the server's working directory.
 * Supports variable substitution using {{variableName}} syntax.
 */
export interface EventHookShellAction {
  type: 'shell';
  /** Shell command to execute. Supports {{variable}} substitution. */
  command: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * EventHookHttpAction - Configuration for making an HTTP webhook request
 *
 * Supports variable substitution in URL, headers, and body.
 */
export interface EventHookHttpAction {
  type: 'http';
  /** URL to send the request to. Supports {{variable}} substitution. */
  url: string;
  /** HTTP method to use */
  method: EventHookHttpMethod;
  /** Optional headers to include. Values support {{variable}} substitution. */
  headers?: Record<string, string>;
  /** Optional request body (JSON string). Supports {{variable}} substitution. */
  body?: string;
}

/**
 * EventHookDiscordAction - Configuration for sending a Discord message via MCP
 *
 * Sends notifications to Discord channels using the Discord MCP server.
 * Supports variable substitution in all string fields.
 */
export interface EventHookDiscordAction {
  type: 'discord';
  /** Discord channel ID or name to send message to. Supports {{variable}} substitution. */
  channelId: string;
  /** Message content to send. Supports {{variable}} substitution and Discord markdown. */
  message: string;
  /** Optional username override for the webhook (if using webhook method) */
  username?: string;
  /** Optional avatar URL override for the webhook (if using webhook method) */
  avatarUrl?: string;
}

/** Union type for all hook action configurations */
export type EventHookAction = EventHookShellAction | EventHookHttpAction | EventHookDiscordAction;

/**
 * EventHook - Configuration for a single event hook
 *
 * Event hooks allow users to execute custom shell commands or HTTP requests
 * when specific events occur in the system.
 *
 * Available variables for substitution:
 * - {{featureId}} - ID of the feature (if applicable)
 * - {{featureName}} - Name of the feature (if applicable)
 * - {{projectPath}} - Absolute path to the project
 * - {{projectName}} - Name of the project
 * - {{projectSlug}} - Project slug (project events)
 * - {{projectTitle}} - Project title (project events)
 * - {{milestoneCount}} - Milestone count (project_scaffolded)
 * - {{featuresCreated}} - Features created (project_scaffolded)
 * - {{error}} - Error message (for error events)
 * - {{timestamp}} - ISO timestamp of the event
 * - {{eventType}} - The event type that triggered the hook
 */
export interface EventHook {
  /** Unique identifier for this hook */
  id: string;
  /** Which event type triggers this hook */
  trigger: EventHookTrigger;
  /** Whether this hook is currently enabled */
  enabled: boolean;
  /** The action to execute when triggered */
  action: EventHookAction;
  /** Optional friendly name for display */
  name?: string;
}

/** Human-readable labels for event hook triggers */
export const EVENT_HOOK_TRIGGER_LABELS: Record<EventHookTrigger, string> = {
  feature_created: 'Feature created',
  feature_success: 'Feature completed successfully',
  feature_error: 'Feature failed with error',
  feature_retry: 'Feature retry initiated',
  feature_recovery: 'Feature recovery action taken',
  auto_mode_complete: 'Auto mode completed all features',
  auto_mode_error: 'Auto mode paused due to error',
  auto_mode_health_check: 'Auto mode health check',
  skill_created: 'New skill created by agent',
  memory_learning: 'New learning recorded',
  pr_feedback_received: 'PR feedback received',
  project_scaffolded: 'Project scaffolded with features',
  project_deleted: 'Project deleted',
  milestone_completed: 'Milestone completed',
  project_completed: 'Project completed',
  health_check_critical: 'Health check critical',
};

const DEFAULT_CODEX_AUTO_LOAD_AGENTS = false;
const DEFAULT_CODEX_SANDBOX_MODE: CodexSandboxMode = 'workspace-write';
const DEFAULT_CODEX_APPROVAL_POLICY: CodexApprovalPolicy = 'on-request';
const DEFAULT_CODEX_ENABLE_WEB_SEARCH = false;
const DEFAULT_CODEX_ENABLE_IMAGES = true;
const DEFAULT_CODEX_ADDITIONAL_DIRS: string[] = [];

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
  /** Model configuration for generating retrospectives */
  retroModel?: PhaseModelEntry;
}

/**
 * DEFAULT_CEREMONY_SETTINGS - Default ceremony configuration
 */
export const DEFAULT_CEREMONY_SETTINGS: CeremonySettings = {
  enabled: false,
  enableEpicKickoff: true,
  enableStandups: true,
  enableMilestoneUpdates: true,
  enableEpicDelivery: true,
  enableProjectRetros: true,
  enableContentBriefs: true,
};

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
}

/** Keys of PhaseModelConfig for type-safe access */
export type PhaseModelKey = keyof PhaseModelConfig;

/**
 * WindowBounds - Electron window position and size for persistence
 *
 * Stored in global settings to restore window state across sessions.
 * Includes position (x, y), dimensions (width, height), and maximized state.
 */
export interface WindowBounds {
  /** Window X position on screen */
  x: number;
  /** Window Y position on screen */
  y: number;
  /** Window width in pixels */
  width: number;
  /** Window height in pixels */
  height: number;
  /** Whether window was maximized when closed */
  isMaximized: boolean;
}

/**
 * KeyboardShortcuts - User-configurable keyboard bindings for common actions
 *
 * Each property maps an action to a keyboard shortcut string
 * (e.g., "Ctrl+K", "Alt+N", "Shift+P")
 */
export interface KeyboardShortcuts {
  /** Open board view */
  board: string;
  /** Open agent panel */
  agent: string;
  /** Open feature spec editor */
  spec: string;
  /** Open context files panel */
  context: string;
  /** Open settings */
  settings: string;
  /** Open project settings */
  projectSettings: string;
  /** Open terminal */
  terminal: string;
  /** Open notifications */
  notifications: string;
  /** Toggle sidebar visibility */
  toggleSidebar: string;
  /** Add new feature */
  addFeature: string;
  /** Add context file */
  addContextFile: string;
  /** Start next feature generation */
  startNext: string;
  /** Create new chat session */
  newSession: string;
  /** Open project picker */
  openProject: string;
  /** Open project picker (alternate) */
  projectPicker: string;
  /** Cycle to previous project */
  cyclePrevProject: string;
  /** Cycle to next project */
  cycleNextProject: string;
  /** Split terminal right */
  splitTerminalRight: string;
  /** Split terminal down */
  splitTerminalDown: string;
  /** Close current terminal */
  closeTerminal: string;
}

/**
 * MCPToolInfo - Information about a tool provided by an MCP server
 *
 * Contains the tool's name, description, and whether it's enabled for use.
 */
export interface MCPToolInfo {
  /** Tool name as exposed by the MCP server */
  name: string;
  /** Description of what the tool does */
  description?: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema?: Record<string, unknown>;
  /** Whether this tool is enabled for use (defaults to true) */
  enabled: boolean;
}

/**
 * MCPServerConfig - Configuration for an MCP (Model Context Protocol) server
 *
 * MCP servers provide additional tools and capabilities to AI agents.
 * Supports stdio (subprocess), SSE, and HTTP transport types.
 */
export interface MCPServerConfig {
  /** Unique identifier for the server config */
  id: string;
  /** Display name for the server */
  name: string;
  /** User-friendly description of what this server provides */
  description?: string;
  /** Transport type: stdio (default), sse, or http */
  type?: 'stdio' | 'sse' | 'http';
  /** For stdio: command to execute (e.g., 'node', 'python', 'npx') */
  command?: string;
  /** For stdio: arguments to pass to the command */
  args?: string[];
  /** For stdio: environment variables to set */
  env?: Record<string, string>;
  /** For sse/http: URL endpoint */
  url?: string;
  /** For sse/http: headers to include in requests */
  headers?: Record<string, string>;
  /** Whether this server is enabled */
  enabled?: boolean;
  /** Tools discovered from this server with their enabled states */
  tools?: MCPToolInfo[];
  /** Timestamp when tools were last fetched */
  toolsLastFetched?: string;
}

/**
 * ProjectRef - Minimal reference to a project stored in global settings
 *
 * Used for the projects list and project history. Full project data is loaded separately.
 */
export interface ProjectRef {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Absolute filesystem path to project directory */
  path: string;
  /** ISO timestamp of last time project was opened */
  lastOpened?: string;
  /** Project-specific theme override (or undefined to use global) */
  theme?: string;
  /** Project-specific UI/sans font override (or undefined to use global) */
  fontFamilySans?: string;
  /** Project-specific code/mono font override (or undefined to use global) */
  fontFamilyMono?: string;
  /** Whether project is pinned to favorites on dashboard */
  isFavorite?: boolean;
  /** Lucide icon name for project identification */
  icon?: string;
  /** Custom icon image path for project switcher */
  customIconPath?: string;
}

/**
 * TrashedProjectRef - Reference to a project in the trash/recycle bin
 *
 * Extends ProjectRef with deletion metadata. User can permanently delete or restore.
 */
export interface TrashedProjectRef extends ProjectRef {
  /** ISO timestamp when project was moved to trash */
  trashedAt: string;
  /** Whether project folder was deleted from disk */
  deletedFromDisk?: boolean;
}

/**
 * ChatSessionRef - Minimal reference to a chat session
 *
 * Used for session lists and history. Full session content is stored separately.
 */
export interface ChatSessionRef {
  /** Unique session identifier */
  id: string;
  /** User-given or AI-generated title */
  title: string;
  /** Project that session belongs to */
  projectId: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last message */
  updatedAt: string;
  /** Whether session is archived */
  archived: boolean;
}

/**
 * GlobalSettings - User preferences and state stored globally in {DATA_DIR}/settings.json
 *
 * This is the main settings file that persists user preferences across sessions.
 * Includes theme, UI state, feature defaults, keyboard shortcuts, and projects.
 * Format: JSON with version field for migration support.
 */
export interface GlobalSettings {
  /** Version number for schema migration */
  version: number;

  // Deployment Environment
  /**
   * Which environment this instance is running in.
   * Affects concurrency defaults, heap limits, model selection, and monitoring.
   * Auto-detected from AUTOMAKER_ENV env var, or defaults to 'development'.
   */
  environment?: DeploymentEnvironment;

  // Migration Tracking
  /** Whether localStorage settings have been migrated to API storage (prevents re-migration) */
  localStorageMigrated?: boolean;

  // Onboarding / Setup Wizard
  /** Whether the initial setup wizard has been completed */
  setupComplete: boolean;
  /** Whether this is the first run experience (used by UI onboarding) */
  isFirstRun: boolean;
  /** Whether Claude setup was skipped during onboarding */
  skipClaudeSetup: boolean;

  // Theme Configuration
  /** Currently selected theme */
  theme: ThemeMode;

  // Font Configuration
  /** Global UI/Sans font family (undefined = use default Geist Sans) */
  fontFamilySans?: string;
  /** Global Code/Mono font family (undefined = use default Geist Mono) */
  fontFamilyMono?: string;
  /** Terminal font family (undefined = use default Menlo/Monaco) */
  terminalFontFamily?: string;

  // Terminal Configuration
  /** How to open terminals from "Open in Terminal" worktree action */
  openTerminalMode?: 'newTab' | 'split';

  // UI State Preferences
  /** Whether sidebar is currently open */
  sidebarOpen: boolean;
  /** Whether chat history panel is open */
  chatHistoryOpen: boolean;

  // Feature Generation Defaults
  /** Max features to generate concurrently */
  maxConcurrency: number;
  /** Default: skip tests during feature generation */
  defaultSkipTests: boolean;
  /** Default: enable dependency blocking */
  enableDependencyBlocking: boolean;
  /** Skip verification requirement in auto-mode (treat 'completed' same as 'verified') */
  skipVerificationInAutoMode: boolean;
  /** Default: use git worktrees for feature branches */
  useWorktrees: boolean;
  /** Default: planning approach (skip/lite/spec/full) */
  defaultPlanningMode: PlanningMode;
  /** Default: require manual approval before generating */
  defaultRequirePlanApproval: boolean;
  /** Default model and thinking level for new feature cards */
  defaultFeatureModel: PhaseModelEntry;

  // Audio Preferences
  /** Mute completion notification sound */
  muteDoneSound: boolean;

  // Server Logging Preferences
  /** Log level for the API server (error, warn, info, debug). Default: info */
  serverLogLevel?: ServerLogLevel;
  /** Enable HTTP request logging (Morgan). Default: true */
  enableRequestLogging?: boolean;

  // AI Commit Message Generation
  /** Enable AI-generated commit messages when opening commit dialog (default: true) */
  enableAiCommitMessages: boolean;

  // AI Model Selection (per-phase configuration)
  /** Phase-specific AI model configuration */
  phaseModels: PhaseModelConfig;

  // Legacy AI Model Selection (deprecated - use phaseModels instead)
  /** @deprecated Use phaseModels.enhancementModel instead */
  enhancementModel: ModelAlias;
  /** @deprecated Use phaseModels.validationModel instead */
  validationModel: ModelAlias;

  // Cursor CLI Settings (global)
  /** Which Cursor models are available in feature modal (empty = all) */
  enabledCursorModels: CursorModelId[];
  /** Default Cursor model selection when switching to Cursor CLI */
  cursorDefaultModel: CursorModelId;

  // OpenCode CLI Settings (global)
  /** Which OpenCode models are available in feature modal (empty = all) */
  enabledOpencodeModels?: OpencodeModelId[];
  /** Default OpenCode model selection when switching to OpenCode CLI */
  opencodeDefaultModel?: OpencodeModelId;
  /** Which dynamic OpenCode models are enabled (empty = all discovered) */
  enabledDynamicModelIds?: string[];

  // Provider Visibility Settings
  /** Providers that are disabled and should not appear in model dropdowns */
  disabledProviders?: ModelProvider[];

  // Input Configuration
  /** User's keyboard shortcut bindings */
  keyboardShortcuts: KeyboardShortcuts;

  // Project Management
  /** List of active projects */
  projects: ProjectRef[];
  /** Projects in trash/recycle bin */
  trashedProjects: TrashedProjectRef[];
  /** ID of the currently open project (null if none) */
  currentProjectId: string | null;
  /** History of recently opened project IDs */
  projectHistory: string[];
  /** Current position in project history for navigation */
  projectHistoryIndex: number;

  // File Browser and UI Preferences
  /** Last directory opened in file picker */
  lastProjectDir?: string;
  /** Recently accessed folders for quick access */
  recentFolders: string[];
  /** Whether worktree panel is collapsed in current view */
  worktreePanelCollapsed: boolean;

  // Session Tracking
  /** Maps project path -> last selected session ID in that project */
  lastSelectedSessionByProject: Record<string, string>;

  // Window State (Electron only)
  /** Persisted window bounds for restoring position/size across sessions */
  windowBounds?: WindowBounds;

  // Claude Agent SDK Settings
  /** Auto-load CLAUDE.md files using SDK's settingSources option */
  autoLoadClaudeMd?: boolean;
  /** Skip the sandbox environment warning dialog on startup */
  skipSandboxWarning?: boolean;

  // Codex CLI Settings
  /** Auto-load .codex/AGENTS.md instructions into Codex prompts */
  codexAutoLoadAgents?: boolean;
  /** Sandbox mode for Codex CLI command execution */
  codexSandboxMode?: CodexSandboxMode;
  /** Approval policy for Codex CLI tool execution */
  codexApprovalPolicy?: CodexApprovalPolicy;
  /** Enable web search capability for Codex CLI (--search flag) */
  codexEnableWebSearch?: boolean;
  /** Enable image attachment support for Codex CLI (-i flag) */
  codexEnableImages?: boolean;
  /** Additional directories with write access (--add-dir flags) */
  codexAdditionalDirs?: string[];
  /** Last thread ID for session resumption */
  codexThreadId?: string;

  // MCP Server Configuration
  /** List of configured MCP servers for agent use */
  mcpServers: MCPServerConfig[];

  // Editor Configuration
  /** Default editor command for "Open In" action (null = auto-detect: Cursor > VS Code > first available) */
  defaultEditorCommand: string | null;

  // Terminal Configuration
  /** Default external terminal ID for "Open In Terminal" action (null = integrated terminal) */
  defaultTerminalId: string | null;

  // Prompt Customization
  /** Custom prompts for Auto Mode, Agent Runner, Backlog Planning, and Enhancements */
  promptCustomization?: PromptCustomization;

  // Skills Configuration
  /**
   * Enable Skills functionality (loads from .claude/skills/ directories)
   * @default true
   */
  enableSkills?: boolean;

  /**
   * Which directories to load Skills from
   * - 'user': ~/.claude/skills/ (personal skills)
   * - 'project': .claude/skills/ (project-specific skills)
   * @default ['user', 'project']
   */
  skillsSources?: Array<'user' | 'project'>;

  // Subagents Configuration
  /**
   * Enable Custom Subagents functionality (loads from .claude/agents/ directories)
   * @default true
   */
  enableSubagents?: boolean;

  /**
   * Which directories to load Subagents from
   * - 'user': ~/.claude/agents/ (personal agents)
   * - 'project': .claude/agents/ (project-specific agents)
   * @default ['user', 'project']
   */
  subagentsSources?: Array<'user' | 'project'>;

  /**
   * Custom subagent definitions for specialized task delegation (programmatic)
   * Key: agent name (e.g., 'code-reviewer', 'test-runner')
   * Value: agent configuration
   */
  customSubagents?: Record<string, import('./provider.js').AgentDefinition>;

  // Event Hooks Configuration
  /**
   * Event hooks for executing custom commands or HTTP requests on events
   * @see EventHook for configuration details
   */
  eventHooks?: EventHook[];

  // Claude-Compatible Providers Configuration
  /**
   * Claude-compatible provider configurations.
   * Each provider exposes its models to all model dropdowns in the app.
   * Models can be mixed across providers (e.g., use GLM for enhancements, Anthropic for generation).
   */
  claudeCompatibleProviders?: ClaudeCompatibleProvider[];

  // Deprecated Claude API Profiles (kept for migration)
  /**
   * @deprecated Use claudeCompatibleProviders instead.
   * Kept for backward compatibility during migration.
   */
  claudeApiProfiles?: ClaudeApiProfile[];

  /**
   * @deprecated No longer used. Models are selected per-phase via phaseModels.
   * Each PhaseModelEntry can specify a providerId for provider-specific models.
   */
  activeClaudeApiProfileId?: string | null;

  /**
   * Runtime overrides for agent exposure (CLI skills + Discord slash commands).
   * Key: agent template name (e.g., "ava", "jon").
   * Overrides the template's built-in exposure config.
   */
  agentExposure?: Record<
    string,
    {
      /** Override Discord slash command registration */
      discord?: boolean;
      /** Override allowed Discord users */
      allowedUsers?: string[];
    }
  >;

  /**
   * Per-worktree auto mode settings
   * Key: "${projectId}::${branchName ?? '__main__'}"
   */
  autoModeByWorktree?: Record<
    string,
    {
      maxConcurrency: number;
      branchName: string | null;
    }
  >;

  /**
   * Git workflow automation settings for auto-mode feature completion.
   * Controls whether to auto-commit, push, and create PRs after agent success.
   * @see GitWorkflowSettings
   */
  gitWorkflow?: GitWorkflowSettings;

  /**
   * Graphite CLI integration settings for stack-aware PR management.
   * When enabled, uses Graphite CLI commands instead of raw git/gh commands.
   * Provides better handling of stacked PRs (feature branches on epic branches).
   * @see GraphiteSettings
   */
  graphite?: GraphiteSettings;

  /**
   * GitHub webhook settings for automated feature status transitions.
   * When enabled, features automatically move to "done" when their PR is merged.
   *
   * Note: Webhook secret is stored separately in credentials.json for security.
   */
  githubWebhook?: {
    /** Whether GitHub webhook integration is enabled */
    enabled: boolean;
  };

  /**
   * Auto-mode always-on configuration.
   * When enabled, auto-mode automatically starts for configured projects on server startup.
   * This enables continuous autonomous feature execution without manual intervention.
   */
  autoModeAlwaysOn?: {
    /** Whether auto-mode always-on is enabled globally */
    enabled: boolean;
    /** Per-project auto-mode configuration */
    projects: Array<{
      /** Absolute path to the project directory */
      projectPath: string;
      /** Branch name for worktree scoping (null = main worktree) */
      branchName: string | null;
      /** Maximum concurrent features for this project (optional, falls back to global maxConcurrency) */
      maxConcurrency?: number;
    }>;
  };

  /**
   * Discord integration settings.
   * Configuration for Discord MCP server integration and notifications.
   * @see DiscordSettings
   */
  discord?: DiscordSettings;

  /**
   * Crew loop settings for unified team member scheduling.
   * Controls Ava, Frank, GTM, and future crew member check/escalation loops.
   * @see CrewLoopSettings
   */
  crewLoops?: CrewLoopSettings;

  /**
   * Trust boundary configuration for PRD approval gates.
   * Determines whether PRDs can be auto-approved or require human review.
   * @see TrustBoundaryConfig
   */
  trustBoundary?: TrustBoundaryConfig;
}

/**
 * Credentials - API keys stored in {DATA_DIR}/credentials.json
 *
 * Sensitive data stored separately from general settings.
 * Keys should never be exposed in UI or logs.
 */
export interface Credentials {
  /** Version number for schema migration */
  version: number;
  /** API keys for various providers */
  apiKeys: {
    /** Anthropic Claude API key */
    anthropic: string;
    /** Google API key (for embeddings or other services) */
    google: string;
    /** OpenAI API key (for compatibility or alternative providers) */
    openai: string;
  };
  /** Webhook secrets for external integrations */
  webhookSecrets?: {
    /** GitHub webhook secret for HMAC-SHA256 signature verification */
    github?: string;
  };
  /** Discord bot tokens for MCP integration */
  discordTokens?: {
    /** Discord bot token for the discord-mcp server */
    botToken?: string;
  };
}

/**
 * BoardBackgroundSettings - Kanban board appearance customization
 *
 * Controls background images, opacity, borders, and visual effects for the board.
 */
export interface BoardBackgroundSettings {
  /** Path to background image file (null = no image) */
  imagePath: string | null;
  /** Version/timestamp of image for cache busting */
  imageVersion?: number;
  /** Opacity of cards (0-1) */
  cardOpacity: number;
  /** Opacity of columns (0-1) */
  columnOpacity: number;
  /** Show border around columns */
  columnBorderEnabled: boolean;
  /** Apply glassmorphism effect to cards */
  cardGlassmorphism: boolean;
  /** Show border around cards */
  cardBorderEnabled: boolean;
  /** Opacity of card borders (0-1) */
  cardBorderOpacity: number;
  /** Hide scrollbar in board view */
  hideScrollbar: boolean;
}

/**
 * WorktreeInfo - Information about a git worktree
 *
 * Tracks worktree location, branch, and dirty state for project management.
 */
export interface WorktreeInfo {
  /** Absolute path to worktree directory */
  path: string;
  /** Branch checked out in this worktree */
  branch: string;
  /** Whether this is the main worktree */
  isMain: boolean;
  /** Whether worktree has uncommitted changes */
  hasChanges?: boolean;
  /** Number of files with changes */
  changedFilesCount?: number;
}

// ============================================================================
// Integration Settings - Per-project Linear, Discord, and external service configuration
// ============================================================================

/**
 * LinearIntegrationConfig - Configuration for Linear project management integration
 *
 * When enabled, ProtoMaker events (feature created, status changed, etc.) trigger
 * Linear MCP tools to sync planning state between ProtoMaker and Linear.
 */
export interface LinearIntegrationConfig {
  /** Enable Linear integration for this project */
  enabled: boolean;
  /** Linear workspace ID (optional - uses authenticated user's workspace if not specified) */
  workspaceId?: string;
  /** Linear team ID for creating issues */
  teamId?: string;
  /** Linear project ID to associate issues with */
  projectId?: string;
  /** Create Linear issue when ProtoMaker feature is created (default: true) */
  syncOnFeatureCreate?: boolean;
  /** Update Linear issue status when ProtoMaker feature status changes (default: true) */
  syncOnStatusChange?: boolean;
  /** Add Linear comment when agent completes feature (default: true) */
  commentOnCompletion?: boolean;
  /** Priority mapping: ProtoMaker complexity -> Linear priority (0=none, 1=urgent, 2=high, 3=normal, 4=low) */
  priorityMapping?: {
    small?: number;
    medium?: number;
    large?: number;
    architectural?: number;
  };
  /** Custom label to apply to all synced issues */
  labelName?: string;
  /** Enable bidirectional sync (default: false) */
  syncEnabled?: boolean;
  /** Conflict resolution strategy: 'linear' (Linear wins), 'automaker' (AutoMaker wins), 'manual' (require user input) */
  conflictResolution?: 'linear' | 'automaker' | 'manual';
  /** Workflow state names that indicate approval (default: ['Approved', 'Ready for Planning']) */
  approvalStates?: string[];
  /** Workflow state names that indicate changes requested (default: ['Changes Requested']) */
  changesRequestedStates?: string[];

  // Agent OAuth (actor=app) fields
  /** OAuth access token for agent (actor=app) */
  agentToken?: string;
  /** OAuth refresh token */
  refreshToken?: string;
  /** Token expiration timestamp (ISO 8601) */
  tokenExpiresAt?: string;
  /** Granted OAuth scopes */
  scopes?: string[];

  // Custom workflow state IDs (for HITL deepening)
  /** Custom workflow state IDs for human-in-the-loop escalation */
  customStateIds?: {
    /** "Needs Human Review" state ID */
    needsHumanReview?: string;
    /** "Escalated" state ID */
    escalated?: string;
    /** "Agent Denied" state ID */
    agentDenied?: string;
  };
}

/**
 * DiscordIntegrationConfig - Configuration for Discord communication integration
 *
 * When enabled, ProtoMaker events trigger Discord MCP tools to post updates,
 * create threads for agent work, and facilitate team communication.
 */
export interface DiscordIntegrationConfig {
  /** Enable Discord integration for this project */
  enabled: boolean;
  /** Discord server (guild) ID */
  serverId?: string;
  /** Discord channel ID for project updates */
  channelId?: string;
  /** Create Discord thread when agent starts working on feature (default: true) */
  createThreadsForAgents?: boolean;
  /** Post notification when feature completes successfully (default: true) */
  notifyOnCompletion?: boolean;
  /** Post notification when feature fails (default: true) */
  notifyOnError?: boolean;
  /** Post notification when auto-mode completes all features (default: true) */
  notifyOnAutoModeComplete?: boolean;
  /** Tag users/roles on critical events (e.g., "@team" or "<@123456>") */
  mentionOnError?: string;
  /** Use webhook for posting (faster, no bot required) */
  useWebhook?: boolean;
  /** Webhook ID (if useWebhook is true) */
  webhookId?: string;
  /** Webhook token (if useWebhook is true) */
  webhookToken?: string;
  /** User routing configuration - maps Discord usernames to agent types */
  userRouting?: Record<string, { agentType: string; enabled: boolean }>;
}

/**
 * ProjectIntegrations - Container for all per-project integration configurations
 *
 * Extensible structure for adding new integrations (Slack, Jira, etc.) in the future.
 * Each integration can be independently enabled/disabled per project.
 */
export interface ProjectIntegrations {
  /** Linear project management integration */
  linear?: LinearIntegrationConfig;
  /** Discord team communication integration */
  discord?: DiscordIntegrationConfig;
  // Future integrations can be added here:
  // slack?: SlackIntegrationConfig;
  // jira?: JiraIntegrationConfig;
  // etc.
}

/**
 * IntegrationEventMapping - Maps ProtoMaker events to integration actions
 *
 * Used by the integration service to determine which MCP tools to invoke
 * when specific events occur. This is the glue between EventHooks and MCP tools.
 */
export interface IntegrationEventMapping {
  /** Event that triggers this integration action */
  event: EventHookTrigger;
  /** Which integration to use (linear, discord, etc.) */
  integration: 'linear' | 'discord';
  /** Action to perform (maps to MCP tool) */
  action:
    | 'create_issue'
    | 'update_issue'
    | 'add_comment'
    | 'send_message'
    | 'create_thread'
    | 'add_reaction';
  /** Optional condition function to determine if action should execute */
  condition?: string;
}

/**
 * ProjectSettings - Project-specific overrides stored in {projectPath}/.automaker/settings.json
 *
 * Allows per-project customization without affecting global settings.
 * All fields are optional - missing values fall back to global settings.
 */
export interface ProjectSettings {
  /** Version number for schema migration */
  version: number;

  // Theme Configuration (project-specific override)
  /** Project theme (undefined = use global setting) */
  theme?: ThemeMode;

  // Font Configuration (project-specific override)
  /** UI/Sans font family override (undefined = use default Geist Sans) */
  fontFamilySans?: string;
  /** Code/Mono font family override (undefined = use default Geist Mono) */
  fontFamilyMono?: string;

  // Worktree Management
  /** Project-specific worktree preference override */
  useWorktrees?: boolean;
  /** Current worktree being used in this project */
  currentWorktree?: { path: string | null; branch: string };
  /** List of worktrees available in this project */
  worktrees?: WorktreeInfo[];

  // Board Customization
  /** Project-specific board background settings */
  boardBackground?: BoardBackgroundSettings;

  // Project Branding
  /** Custom icon image path for project switcher (relative to .automaker/) */
  customIconPath?: string;

  // UI Visibility
  /** Whether the worktree panel row is visible (default: true) */
  worktreePanelVisible?: boolean;
  /** Whether to show the init script indicator panel (default: true) */
  showInitScriptIndicator?: boolean;

  // Worktree Behavior
  /** Default value for "delete branch" checkbox when deleting a worktree (default: false) */
  defaultDeleteBranchWithWorktree?: boolean;
  /** Auto-dismiss init script indicator after completion (default: true) */
  autoDismissInitScriptIndicator?: boolean;

  // Session Tracking
  /** Last chat session selected in this project */
  lastSelectedSessionId?: string;

  // Claude Agent SDK Settings
  /** Auto-load CLAUDE.md files using SDK's settingSources option (project override) */
  autoLoadClaudeMd?: boolean;

  // Subagents Configuration
  /**
   * Project-specific custom subagent definitions for specialized task delegation
   * Merged with global customSubagents, project-level takes precedence
   * Key: agent name (e.g., 'code-reviewer', 'test-runner')
   * Value: agent configuration
   */
  customSubagents?: Record<string, import('./provider.js').AgentDefinition>;

  // Auto Mode Configuration (per-project)
  /** Whether auto mode is enabled for this project (backend-controlled loop) */
  automodeEnabled?: boolean;
  /** Maximum concurrent agents for this project (overrides global maxConcurrency) */
  maxConcurrentAgents?: number;

  // Phase Model Overrides (per-project)
  /**
   * Override phase model settings for this project.
   * Any phase not specified here falls back to global phaseModels setting.
   * Allows per-project customization of which models are used for each task.
   */
  phaseModelOverrides?: Partial<PhaseModelConfig>;

  // Webhook Settings (per-project)
  /**
   * Webhook configuration for receiving GitHub events.
   * Allows external services to trigger actions in this project.
   * @see WebhookSettings in webhook.js
   */
  webhookSettings?: import('./webhook.js').WebhookSettings;

  // Agentic System Configuration (per-project)
  /**
   * Headsdown autonomous agent configuration for this project.
   * Enables AI agents to monitor Discord/Linear/GitHub and autonomously
   * execute work following the headsdown pattern.
   *
   * Each project can customize:
   * - Which agent roles are enabled
   * - Model selection per role
   * - Turn limits and timeouts
   * - Monitoring sources (Discord channels, Linear projects)
   * - Planning parameters
   */
  agenticSystem?: import('./headsdown.js').HeadsdownConfig[];

  // Integration Settings (per-project)
  /**
   * Per-project integration configuration for Linear, Discord, and other external services.
   * Enables event-driven actions where ProtoMaker events trigger integration tools via MCP.
   */
  integrations?: ProjectIntegrations;

  // Authority System (per-project)
  /**
   * Policy and Trust Authority System configuration.
   * When enabled, agent actions are evaluated against trust-based policies
   * before execution. High-risk actions may require approval.
   * @see PolicyConfig in policy.ts
   */
  authoritySystem?: {
    /** Whether the authority system is enabled for this project */
    enabled: boolean;
    /** Custom policy configuration (falls back to DEFAULT_POLICY_CONFIG if not set) */
    policyConfig?: PolicyConfig;
  };

  // Deprecated Claude API Profile Override
  /**
   * @deprecated Use phaseModelOverrides instead.
   * Models are now selected per-phase via phaseModels/phaseModelOverrides.
   * Each PhaseModelEntry can specify a providerId for provider-specific models.
   */
  activeClaudeApiProfileId?: string | null;

  // Discord Integration (per-project override)
  /**
   * Project-specific Discord integration settings.
   * Overrides global Discord settings for this project.
   * @see DiscordSettings
   */
  discord?: DiscordSettings;

  // Ceremony Settings (per-project)
  /**
   * Project-specific ceremony configuration for milestone updates and retrospectives.
   * Overrides global ceremony settings for this project.
   * @see CeremonySettings
   */
  ceremonySettings?: CeremonySettings;
}

/**
 * Default values and constants
 */

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
};

/** Current version of the global settings schema */
export const SETTINGS_VERSION = 6;
/** Current version of the credentials schema */
export const CREDENTIALS_VERSION = 1;
/** Current version of the project settings schema */
export const PROJECT_SETTINGS_VERSION = 1;

/** Default maximum concurrent agents for auto mode */
export const DEFAULT_MAX_CONCURRENCY = 1;

/**
 * Get the effective maximum system concurrency from environment variable or default.
 *
 * - Reads AUTOMAKER_MAX_CONCURRENCY environment variable if set
 * - Validates value is between 1 and 20 (inclusive)
 * - Returns 2 as the hard limit by default (safe for dev environments)
 * - Logs validation errors and falls back to default
 *
 * @returns The effective maximum concurrent agents allowed
 */
export function getMaxSystemConcurrency(): number {
  // Guard against browser environments where process is undefined
  const envValue =
    typeof process !== 'undefined' && process.env
      ? process.env.AUTOMAKER_MAX_CONCURRENCY
      : undefined;

  if (!envValue) {
    return 2; // Default hard limit for safe operation
  }

  const parsed = parseInt(envValue, 10);

  // Validate the value
  if (isNaN(parsed)) {
    console.warn(
      `[AUTOMAKER_MAX_CONCURRENCY] Invalid value "${envValue}", expected a number. Using default of 2.`
    );
    return 2;
  }

  if (parsed < 1) {
    console.warn(
      `[AUTOMAKER_MAX_CONCURRENCY] Value ${parsed} is below minimum of 1. Using minimum of 1.`
    );
    return 1;
  }

  if (parsed > 20) {
    console.warn(
      `[AUTOMAKER_MAX_CONCURRENCY] Value ${parsed} exceeds maximum of 20. Using maximum of 20.`
    );
    return 20;
  }

  return parsed;
}

/** Hard system limit for maximum concurrent agents - prevents resource exhaustion */
export const MAX_SYSTEM_CONCURRENCY = getMaxSystemConcurrency();

/** Default keyboard shortcut bindings */
export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcuts = {
  board: 'K',
  agent: 'A',
  spec: 'D',
  context: 'C',
  settings: 'S',
  projectSettings: 'Shift+S',
  terminal: 'T',
  notifications: 'X',
  toggleSidebar: '`',
  addFeature: 'N',
  addContextFile: 'N',
  startNext: 'G',
  newSession: 'N',
  openProject: 'O',
  projectPicker: 'P',
  cyclePrevProject: 'Q',
  cycleNextProject: 'E',
  splitTerminalRight: 'Alt+D',
  splitTerminalDown: 'Alt+S',
  closeTerminal: 'Alt+W',
};

/** Default global settings used when no settings file exists */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  version: SETTINGS_VERSION,
  environment: 'development',
  setupComplete: false,
  isFirstRun: true,
  skipClaudeSetup: false,
  theme: 'dark',
  sidebarOpen: true,
  chatHistoryOpen: false,
  maxConcurrency: DEFAULT_MAX_CONCURRENCY,
  defaultSkipTests: true,
  enableDependencyBlocking: true,
  skipVerificationInAutoMode: false,
  useWorktrees: true,
  defaultPlanningMode: 'skip',
  defaultRequirePlanApproval: false,
  defaultFeatureModel: { model: 'claude-opus' }, // Use canonical ID
  muteDoneSound: false,
  serverLogLevel: 'info',
  enableRequestLogging: true,
  enableAiCommitMessages: true,
  phaseModels: DEFAULT_PHASE_MODELS,
  enhancementModel: 'sonnet', // Legacy alias still supported
  validationModel: 'opus', // Legacy alias still supported
  enabledCursorModels: getAllCursorModelIds(), // Returns prefixed IDs
  cursorDefaultModel: 'cursor-auto', // Use canonical prefixed ID
  enabledOpencodeModels: getAllOpencodeModelIds(), // Returns prefixed IDs
  opencodeDefaultModel: DEFAULT_OPENCODE_MODEL, // Already prefixed
  enabledDynamicModelIds: [],
  disabledProviders: [],
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
  projects: [],
  trashedProjects: [],
  currentProjectId: null,
  projectHistory: [],
  projectHistoryIndex: -1,
  lastProjectDir: undefined,
  recentFolders: [],
  worktreePanelCollapsed: false,
  lastSelectedSessionByProject: {},
  autoLoadClaudeMd: true,
  skipSandboxWarning: false,
  codexAutoLoadAgents: DEFAULT_CODEX_AUTO_LOAD_AGENTS,
  codexSandboxMode: DEFAULT_CODEX_SANDBOX_MODE,
  codexApprovalPolicy: DEFAULT_CODEX_APPROVAL_POLICY,
  codexEnableWebSearch: DEFAULT_CODEX_ENABLE_WEB_SEARCH,
  codexEnableImages: DEFAULT_CODEX_ENABLE_IMAGES,
  codexAdditionalDirs: DEFAULT_CODEX_ADDITIONAL_DIRS,
  codexThreadId: undefined,
  mcpServers: [],
  defaultEditorCommand: null,
  defaultTerminalId: null,
  enableSkills: true,
  skillsSources: ['user', 'project'],
  enableSubagents: true,
  subagentsSources: ['user', 'project'],
  // New provider system
  claudeCompatibleProviders: [],
  // Deprecated - kept for migration
  claudeApiProfiles: [],
  activeClaudeApiProfileId: null,
  autoModeByWorktree: {},
  // Git workflow automation (enabled by default)
  gitWorkflow: DEFAULT_GIT_WORKFLOW_SETTINGS,
  // Graphite CLI integration (disabled by default)
  graphite: DEFAULT_GRAPHITE_SETTINGS,
  // Auto-mode always-on (disabled by default)
  autoModeAlwaysOn: {
    enabled: false,
    projects: [],
  },
};

/** Default credentials (empty strings - user must provide API keys) */
export const DEFAULT_CREDENTIALS: Credentials = {
  version: CREDENTIALS_VERSION,
  apiKeys: {
    anthropic: '',
    google: '',
    openai: '',
  },
};

/** Default Linear integration settings - disabled by default */
export const DEFAULT_LINEAR_INTEGRATION: LinearIntegrationConfig = {
  enabled: false,
  syncOnFeatureCreate: true,
  syncOnStatusChange: true,
  commentOnCompletion: true,
  priorityMapping: {
    small: 4, // Low priority
    medium: 3, // Normal priority
    large: 2, // High priority
    architectural: 1, // Urgent priority
  },
};

/** Default Discord integration settings - disabled by default */
export const DEFAULT_DISCORD_INTEGRATION: DiscordIntegrationConfig = {
  enabled: false,
  createThreadsForAgents: true,
  notifyOnCompletion: true,
  notifyOnError: true,
  notifyOnAutoModeComplete: true,
  useWebhook: false,
  userRouting: {
    chukz: { agentType: 'ava', enabled: true },
    abdelly: { agentType: 'jon', enabled: true },
  },
};

// ============================================================================
// Trust Boundary Settings - PRD Approval Gate Configuration
// ============================================================================

/**
 * PRD Category - Type/purpose of a PRD
 */
export type PRDCategory = 'ops' | 'improvement' | 'bug' | 'feature' | 'idea' | 'architectural';

/**
 * PRD Complexity - Estimated scope and risk of a PRD
 */
export type PRDComplexity = 'small' | 'medium' | 'large' | 'architectural';

/**
 * AutoApproveRule - Criteria for automatically approving a PRD without review
 *
 * Conservative defaults: only small ops/bug PRDs auto-approve.
 * All conditions must match (AND logic) for auto-approval.
 */
export interface AutoApproveRule {
  /** Maximum complexity level that can be auto-approved (default: 'small') */
  maxComplexity?: PRDComplexity;
  /** Categories that are eligible for auto-approval (default: ['ops', 'improvement', 'bug']) */
  categories?: PRDCategory[];
  /** Maximum estimated cost in dollars (default: undefined = no limit) */
  maxEstimatedCost?: number;
}

/**
 * RequireReviewRule - Criteria for requiring human review before proceeding
 *
 * Any condition that matches (OR logic) triggers review requirement.
 */
export interface RequireReviewRule {
  /** Categories that always require review (default: ['idea', 'architectural']) */
  categories?: PRDCategory[];
  /** Minimum complexity level that requires review (default: 'large') */
  minComplexity?: PRDComplexity;
  /** Minimum estimated cost that requires review in dollars (default: undefined = no limit) */
  minEstimatedCost?: number;
}

/**
 * TrustBoundaryConfig - Trust boundary configuration for PRD approval gates
 *
 * Determines whether a PRD can be auto-approved or requires human review.
 * Conservative defaults: when in doubt, require review.
 */
export interface TrustBoundaryConfig {
  /** Whether trust boundary evaluation is enabled (default: true) */
  enabled: boolean;
  /** Auto-approval rules (all conditions must match) */
  autoApprove: AutoApproveRule;
  /** Review requirement rules (any condition triggers review) */
  requireReview: RequireReviewRule;
}

/**
 * Default trust boundary configuration - conservative defaults
 *
 * Only auto-approves:
 * - Small complexity
 * - ops/improvement/bug categories
 * - No cost limit
 *
 * Always requires review:
 * - idea/architectural categories
 * - large or architectural complexity
 */
export const DEFAULT_TRUST_BOUNDARY_CONFIG: TrustBoundaryConfig = {
  enabled: true,
  autoApprove: {
    maxComplexity: 'small',
    categories: ['ops', 'improvement', 'bug'],
    maxEstimatedCost: undefined,
  },
  requireReview: {
    categories: ['idea', 'architectural'],
    minComplexity: 'large',
    minEstimatedCost: undefined,
  },
};

// ============================================================================
// Crew Loop Settings - Unified crew member scheduling and escalation
// ============================================================================

/**
 * CrewMemberConfig - Per-member runtime configuration overrides
 *
 * Stored in global settings to allow enable/disable and schedule overrides
 * without modifying code. Each crew member has a default configuration
 * defined in its CrewMemberDefinition; these settings override those defaults.
 */
export interface CrewMemberConfig {
  /** Whether this crew member is enabled */
  enabled: boolean;
  /** Cron schedule override (undefined = use member's defaultSchedule) */
  schedule?: string;
}

/**
 * CrewLoopSettings - Global configuration for the crew loop system
 *
 * Controls whether the crew loop system is active and provides
 * per-member configuration overrides.
 */
export interface CrewLoopSettings {
  /** Whether the crew loop system is enabled globally */
  enabled: boolean;
  /** Per-member configuration overrides (key = member id) */
  members: Record<string, CrewMemberConfig>;
}

/**
 * DEFAULT_CREW_LOOP_SETTINGS - Crew loops enabled by default with no member overrides
 */
export const DEFAULT_CREW_LOOP_SETTINGS: CrewLoopSettings = {
  enabled: true,
  members: {},
};

/** Default project settings (empty - all settings are optional and fall back to global) */
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  version: PROJECT_SETTINGS_VERSION,
};
