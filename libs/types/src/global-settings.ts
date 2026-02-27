/**
 * Global Settings - Top-level user preferences and credentials
 *
 * Contains the GlobalSettings and Credentials interfaces (stored in DATA_DIR/settings.json
 * and DATA_DIR/credentials.json respectively), plus version constants and concurrency utilities.
 *
 * Related types in domain files:
 * - VoiceSettings, WhisperModelSize → ui-settings.ts
 * - MCPToolInfo, MCPServerConfig → provider-settings.ts
 * - ErrorTrackingSettings → integration-settings.ts
 */

import type { ModelAlias } from './model.js';
import type { CursorModelId } from './cursor-models.js';
import { getAllCursorModelIds } from './cursor-models.js';
import type { OpencodeModelId } from './opencode-models.js';
import { getAllOpencodeModelIds, DEFAULT_OPENCODE_MODEL } from './opencode-models.js';
import type { PromptCustomization } from './prompts.js';
import type { CodexSandboxMode, CodexApprovalPolicy } from './codex.js';
import type { UserProfile } from './user-profile.js';
import type { CustomPrompt } from './prompts.js';

// Domain file imports
import type {
  ThemeMode,
  PlanningMode,
  ServerLogLevel,
  WindowBounds,
  KeyboardShortcuts,
  VoiceSettings,
} from './ui-settings.js';
import { DEFAULT_KEYBOARD_SHORTCUTS } from './ui-settings.js';
import type {
  PhaseModelEntry,
  PhaseModelConfig,
  ModelProvider,
  DeploymentEnvironment,
} from './agent-settings.js';
import { DEFAULT_PHASE_MODELS } from './agent-settings.js';
import type { GitWorkflowSettings, GraphiteSettings } from './git-settings.js';
import { DEFAULT_GIT_WORKFLOW_SETTINGS, DEFAULT_GRAPHITE_SETTINGS } from './git-settings.js';
import type {
  ClaudeCompatibleProvider,
  ClaudeApiProfile,
  MCPServerConfig,
} from './provider-settings.js';
import type { EventHook } from './event-settings.js';
import type { DiscordSettings, ErrorTrackingSettings } from './integration-settings.js';
import type { MaintenanceSettings, ProjectRef, TrashedProjectRef } from './project-settings.js';
import type { TrustBoundaryConfig } from './workflow-settings.js';
import type { PromotionConfig } from './promotion.js';

// Re-export ModelAlias for convenience (settings.ts historically re-exported this)
export type { ModelAlias };

// ============================================================================
// Version Constants
// ============================================================================

/** Current version of the global settings schema */
export const SETTINGS_VERSION = 6;
/** Current version of the credentials schema */
export const CREDENTIALS_VERSION = 1;

// ============================================================================
// Concurrency Utilities
// ============================================================================

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

// ============================================================================
// Credentials - Sensitive API keys stored separately
// ============================================================================

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
    /** Groq API key for fast LLM inference */
    groq?: string;
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

/** Default credentials (empty strings - user must provide API keys) */
export const DEFAULT_CREDENTIALS: Credentials = {
  version: CREDENTIALS_VERSION,
  apiKeys: {
    anthropic: '',
    google: '',
    openai: '',
  },
};

// ============================================================================
// Global Settings - Main user preferences persisted globally
// ============================================================================

const DEFAULT_CODEX_AUTO_LOAD_AGENTS = false;
const DEFAULT_CODEX_SANDBOX_MODE: CodexSandboxMode = 'workspace-write';
const DEFAULT_CODEX_APPROVAL_POLICY: CodexApprovalPolicy = 'on-request';
const DEFAULT_CODEX_ENABLE_WEB_SEARCH = false;
const DEFAULT_CODEX_ENABLE_IMAGES = true;
const DEFAULT_CODEX_ADDITIONAL_DIRS: string[] = [];

/**
 * GlobalSettings - User preferences and state stored globally in {DATA_DIR}/settings.json
 *
 * This is the main settings file that persists user preferences across sessions.
 * Includes theme, UI state, feature defaults, keyboard shortcuts, and projects.
 * Format: JSON with version field for migration support.
 */

/**
 * Feature flags for toggling in-development UI features.
 * New features should start behind a flag until ready for general availability.
 */
export interface FeatureFlags {
  /** Calendar view in project sidebar */
  calendar: boolean;
  /** Designs/pen file viewer in project sidebar */
  designs: boolean;
  /** Docs view in project sidebar */
  docs: boolean;
  /** File Editor view in project sidebar (tabbed code editor) */
  fileEditor: boolean;
}

/** Default feature flags — all off by default, opt-in per environment */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  calendar: false,
  designs: false,
  docs: false,
  fileEditor: false,
};

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

  // Knowledge Store / Learning Settings
  /**
   * BM25 score threshold for deduplicating learnings before writing to memory files.
   * SQLite FTS5 BM25 returns negative values where lower (more negative) = more relevant.
   * Default: -0.5 (skip learning if top match score is below this threshold)
   * Set to -Infinity to disable deduplication.
   */
  knowledgeDedupThreshold?: number;

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
   * @see DiscordSettings
   */
  discord?: DiscordSettings;

  /**
   * Voice activation settings for offline wake word + speech-to-text.
   * @see VoiceSettings in ui-settings.ts
   */
  voice?: VoiceSettings;

  /**
   * Error tracking and monitoring settings with Sentry integration.
   * @see ErrorTrackingSettings in integration-settings.ts
   */
  errorTracking?: ErrorTrackingSettings;

  /**
   * Trust boundary configuration for PRD approval gates.
   * @see TrustBoundaryConfig in workflow-settings.ts
   */
  trustBoundary?: TrustBoundaryConfig;

  /**
   * Feature archival settings.
   * Automatically removes completed features from the board after a retention period.
   */
  archival?: {
    /** Whether automatic archival is enabled (default: true) */
    enabled: boolean;
    /** Hours to retain done/verified features before archival (default: 2) */
    retentionHours: number;
  };

  /**
   * Use LangGraph-based flows for antagonistic reviews instead of legacy DynamicAgentExecutor.
   * @default true
   */
  useGraphFlows?: boolean;

  /**
   * Enable the GTM (Go-To-Market) content creation pipeline.
   * @default false
   */
  gtmEnabled?: boolean;

  /**
   * Map Linear team IDs to Automaker project paths.
   * Webhooks from a mapped team create features in that repo's .automaker/.
   */
  linearTeamRoutes?: Record<string, string>;

  // Hivemind Configuration
  /**
   * Unique identifier for this Automaker instance in a hivemind mesh.
   * Also used for PR ownership watermarking to prevent multi-instance conflicts.
   * Auto-generated UUID on first call and persisted for subsequent calls.
   */
  instanceId?: string;

  /**
   * Team or organization identifier for grouping instances.
   * Used in PR ownership watermarks to identify which org created a PR.
   * Example: "proto-labs-ai"
   */
  teamId?: string;

  /**
   * Hours after which PR ownership is considered stale when both last commit age
   * and last activity age exceed this threshold. Stale PRs can be taken over by
   * other instances. Defaults to 24.
   */
  prOwnershipStaleTtlHours?: number;

  /**
   * Maintenance scheduler settings.
   * @see MaintenanceSettings in project-settings.ts
   */
  maintenance?: MaintenanceSettings;

  /**
   * Hivemind mesh configuration for multi-instance coordination.
   * @see HivemindConfig
   */
  hivemind?: import('./hivemind.js').HivemindConfig;

  /** User profile for agent personalization — replaces hardcoded values in persona prompts */
  userProfile?: UserProfile;

  /** User's name for assignment and display purposes (resolved from settings, env, or git) */
  userName?: string;

  /** Per-persona system prompt overrides, keyed by template name (e.g., 'ava', 'frank') */
  personaOverrides?: Record<string, CustomPrompt>;

  /**
   * Promotion pipeline configuration for staging/production candidate tracking.
   * Controls how features are detected as promotion candidates and batched for release.
   * @see PromotionConfig in promotion.ts
   */
  promotion?: PromotionConfig;

  /**
   * Feature flags for toggling in-development UI features.
   * Defaults to all enabled in development, disabled in staging/production.
   * Toggled per-installation via Settings > Developer > Feature Flags.
   */
  featureFlags?: FeatureFlags;
}

/** Default global settings used when no settings file exists */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  version: SETTINGS_VERSION,
  environment: 'development',
  setupComplete: false,
  isFirstRun: true,
  skipClaudeSetup: false,
  theme: 'dark',
  sidebarOpen: true,
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
  // Feature flags — all on in development by default
  featureFlags: DEFAULT_FEATURE_FLAGS,
};
