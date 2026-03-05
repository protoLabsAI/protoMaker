/**
 * Project Settings - Per-project overrides and project management types
 *
 * Covers worktree info, project references, chat sessions,
 * and the full ProjectSettings interface stored in .automaker/settings.json.
 */

import type { ThemeMode, BoardBackgroundSettings } from './ui-settings.js';
import type { PhaseModelConfig, CeremonySettings } from './agent-settings.js';
import type { ProjectIntegrations, DiscordSettings } from './integration-settings.js';
import type { WorkflowSettings } from './workflow-settings.js';
import type { AgentDefinition } from './provider.js';
import type { PolicyConfig } from './policy.js';

// ============================================================================
// Worktree Info - Git worktree management
// ============================================================================

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
// Project References - Project and session reference types
// ============================================================================

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

// ============================================================================
// Project Settings - Per-project configuration
// ============================================================================

/** Current version of the project settings schema */
export const PROJECT_SETTINGS_VERSION = 1;

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

  // Persona Scoping (per-project activation)
  /**
   * Agent template names that are enabled for this project.
   * When defined, only templates in this list are active for the project.
   * When undefined or empty, all registered templates are available (global default).
   * Tier-0 (built-in) templates appear in the list but can still be toggled per-project.
   */
  enabledPersonas?: string[];

  // Subagents Configuration
  /**
   * Project-specific custom subagent definitions for specialized task delegation
   * Merged with global customSubagents, project-level takes precedence
   * Key: agent name (e.g., 'code-reviewer', 'test-runner')
   * Value: agent configuration
   */
  customSubagents?: Record<string, AgentDefinition>;

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
   * Enables AI agents to monitor Discord/GitHub and autonomously
   * execute work following the headsdown pattern.
   *
   * Each project can customize:
   * - Which agent roles are enabled
   * - Model selection per role
   * - Turn limits and timeouts
   * - Monitoring sources (Discord channels, GitHub repos)
   * - Planning parameters
   */
  agenticSystem?: import('./headsdown.js').HeadsdownConfig[];

  // Integration Settings (per-project)
  /**
   * Per-project integration configuration for Discord, GitHub, and other external services.
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

  // Twitch Integration (per-project)
  /**
   * Project-specific Twitch chat integration settings.
   * Enables receiving suggestions from Twitch chat via !idea commands.
   * @see TwitchSettings
   */
  twitch?: import('./twitch.js').TwitchSettings;

  // Workflow Settings (per-project)
  /**
   * Pipeline hardening and workflow behavior settings.
   * Controls goal gates, checkpointing, loop detection, supervisor,
   * retro feedback, cleanup, and signal intake.
   * @see WorkflowSettings
   */
  workflow?: WorkflowSettings;
}

/** Default project settings (empty - all settings are optional and fall back to global) */
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  version: PROJECT_SETTINGS_VERSION,
};
