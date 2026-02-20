import { create } from 'zustand';
// Note: persist middleware removed - settings now sync via API (use-settings-sync.ts)
import type { Project, TrashedProject } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import { createLogger } from '@automaker/utils/logger';
import {
  UI_SANS_FONT_OPTIONS,
  UI_MONO_FONT_OPTIONS,
  DEFAULT_FONT_VALUE,
} from '@/config/ui-font-options';
import type {
  ModelAlias,
  PlanningMode,
  ModelProvider,
  CursorModelId,
  CodexModelId,
  OpencodeModelId,
  PhaseModelConfig,
  PhaseModelKey,
  PhaseModelEntry,
  MCPServerConfig,
  PipelineConfig,
  PipelineStep,
  PromptCustomization,
  ModelDefinition,
  ServerLogLevel,
  EventHook,
  ClaudeApiProfile,
  ClaudeCompatibleProvider,
} from '@automaker/types';
import {
  getAllCursorModelIds,
  getAllCodexModelIds,
  getAllOpencodeModelIds,
  DEFAULT_PHASE_MODELS,
  DEFAULT_OPENCODE_MODEL,
  DEFAULT_MAX_CONCURRENCY,
} from '@automaker/types';
import {
  getStoredTheme,
  getStoredFontSans,
  getStoredFontMono,
  DEFAULT_KEYBOARD_SHORTCUTS,
} from './types';
import type {
  ViewMode,
  ThemeMode,
  BoardViewMode,
  ApiKeys,
  KeyboardShortcuts,
  ChatMessage,
  ChatSession,
  Feature,
  ProjectAnalysis,
  TerminalPanelContent,
  TerminalTab,
  TerminalState,
  PersistedTerminalPanel,
  PersistedTerminalTab,
  PersistedTerminalState,
  InitScriptState,
  ClaudeUsage,
  CodexUsage,
  AutoModeActivity,
} from './types';

import { useTerminalStore } from './terminal-store';
import { useAIModelsStore } from './ai-models-store';
import { useWorktreeStore } from './worktree-store';
import { useThemeStore, getEffectiveFont, persistEffectiveThemeForProject } from './theme-store';

const logger = createLogger('AppStore');

// All types, interfaces, constants, and utility functions are defined in ./types.ts.
// Re-export everything for backward compatibility — existing consumers can keep
// importing from '@/store/app-store' without changes.
export * from './types';
export { useTerminalStore } from './terminal-store';
export { useAIModelsStore } from './ai-models-store';
export { useWorktreeStore } from './worktree-store';
export { useThemeStore } from './theme-store';

// Types re-exported from ./types.ts: ViewMode, ThemeMode, THEME_STORAGE_KEY,
// FONT_SANS_STORAGE_KEY, FONT_MONO_STORAGE_KEY, MAX_INIT_OUTPUT_LINES,
// getStoredTheme, getStoredFontSans, getStoredFontMono

// Helper functions (getEffectiveFont, saveThemeToStorage, saveFontSansToStorage,
// saveFontMonoToStorage, persistEffectiveThemeForProject) moved to ./theme-store.ts

// Types re-exported from ./types.ts: ShortcutKey, parseShortcut, formatShortcut,
// KeyboardShortcuts, DEFAULT_KEYBOARD_SHORTCUTS

// Types re-exported from ./types.ts: ImageAttachment, TextFileAttachment,
// ChatMessage, ChatSession

// Types re-exported from ./types.ts: FeatureImage, ClaudeModel, Feature,
// ParsedTask, PlanSpec, FileTreeNode, ProjectAnalysis

// Types re-exported from ./types.ts: TerminalPanelContent, TerminalTab,
// TerminalState, PersistedTerminalPanel, PersistedTerminalTab,
// PersistedTerminalState, PersistedTerminalSettings, InitScriptState

export interface AppState {
  // Project state
  projects: Project[];
  currentProject: Project | null;
  trashedProjects: TrashedProject[];
  projectHistory: string[]; // Array of project IDs in MRU order (most recent first)
  projectHistoryIndex: number; // Current position in project history for cycling

  // View state
  currentView: ViewMode;
  sidebarOpen: boolean;
  chatSidebarOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelActiveTab: string;
  mobileSidebarHidden: boolean; // Completely hides sidebar on mobile

  // Agent Session state (per-project, keyed by project path)
  lastSelectedSessionByProject: Record<string, string>; // projectPath -> sessionId

  // Theme
  theme: ThemeMode;

  // Fonts (global defaults)
  fontFamilySans: string | null; // null = use default Geist Sans
  fontFamilyMono: string | null; // null = use default Geist Mono

  // Features/Kanban
  features: Feature[];

  // App spec
  appSpec: string;

  // IPC status
  ipcConnected: boolean;

  // API Keys
  apiKeys: ApiKeys;

  // Chat Sessions
  chatSessions: ChatSession[];
  currentChatSession: ChatSession | null;
  chatHistoryOpen: boolean;

  // Auto Mode (per-worktree state, keyed by "${projectId}::${branchName ?? '__main__'}")
  autoModeByWorktree: Record<
    string,
    {
      isRunning: boolean;
      runningTasks: string[]; // Feature IDs being worked on
      branchName: string | null; // null = main worktree
      maxConcurrency?: number; // Maximum concurrent features for this worktree (defaults to 3)
    }
  >;
  autoModeActivityLog: AutoModeActivity[];
  maxConcurrency: number; // Legacy: Maximum number of concurrent agent tasks (deprecated, use per-worktree maxConcurrency)

  // Kanban Card Display Settings
  boardViewMode: BoardViewMode; // Whether to show kanban or dependency graph view

  // Feature Default Settings
  defaultSkipTests: boolean; // Default value for skip tests when creating new features
  enableDependencyBlocking: boolean; // When true, show blocked badges and warnings for features with incomplete dependencies (default: true)
  skipVerificationInAutoMode: boolean; // When true, auto-mode grabs features even if dependencies are not verified (only checks they're not running)
  enableAiCommitMessages: boolean; // When true, auto-generate commit messages using AI when opening commit dialog
  planUseSelectedWorktreeBranch: boolean; // When true, Plan dialog creates features on the currently selected worktree branch
  addFeatureUseSelectedWorktreeBranch: boolean; // When true, Add Feature dialog defaults to custom mode with selected worktree branch

  // Worktree Settings
  useWorktrees: boolean; // Whether to use git worktree isolation for features (default: true)

  // User-managed Worktrees (per-project)
  // projectPath -> { path: worktreePath or null for main, branch: branch name }
  currentWorktreeByProject: Record<string, { path: string | null; branch: string }>;
  worktreesByProject: Record<
    string,
    Array<{
      path: string;
      branch: string;
      isMain: boolean;
      hasChanges?: boolean;
      changedFilesCount?: number;
    }>
  >;
  // Track loading state for worktrees per project
  worktreesLoadingByProject: Record<string, boolean>;

  // Keyboard Shortcuts
  keyboardShortcuts: KeyboardShortcuts; // User-defined keyboard shortcuts

  // Audio Settings
  muteDoneSound: boolean; // When true, mute the notification sound when agents complete (default: false)

  // Server Log Level Settings
  serverLogLevel: ServerLogLevel; // Log level for the API server (error, warn, info, debug)
  enableRequestLogging: boolean; // Enable HTTP request logging (Morgan)

  // Enhancement Model Settings
  enhancementModel: ModelAlias; // Model used for feature enhancement (default: sonnet)

  // Validation Model Settings
  validationModel: ModelAlias; // Model used for GitHub issue validation (default: opus)

  // Phase Model Settings - per-phase AI model configuration
  phaseModels: PhaseModelConfig;
  favoriteModels: string[];

  // Cursor CLI Settings (global)
  enabledCursorModels: CursorModelId[]; // Which Cursor models are available in feature modal
  cursorDefaultModel: CursorModelId; // Default Cursor model selection

  // Codex CLI Settings (global)
  enabledCodexModels: CodexModelId[]; // Which Codex models are available in feature modal
  codexDefaultModel: CodexModelId; // Default Codex model selection
  codexAutoLoadAgents: boolean; // Auto-load .codex/AGENTS.md files
  codexSandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access'; // Sandbox policy
  codexApprovalPolicy: 'untrusted' | 'on-failure' | 'on-request' | 'never'; // Approval policy
  codexEnableWebSearch: boolean; // Enable web search capability
  codexEnableImages: boolean; // Enable image processing

  // OpenCode CLI Settings (global)
  // Static OpenCode settings are persisted via SETTINGS_FIELDS_TO_SYNC
  enabledOpencodeModels: OpencodeModelId[]; // Which static OpenCode models are available
  opencodeDefaultModel: OpencodeModelId; // Default OpenCode model selection
  // Dynamic models are session-only (not persisted) because they're discovered at runtime
  // from `opencode models` CLI and depend on current provider authentication state
  dynamicOpencodeModels: ModelDefinition[]; // Dynamically discovered models from OpenCode CLI
  enabledDynamicModelIds: string[]; // Which dynamic models are enabled
  cachedOpencodeProviders: Array<{
    id: string;
    name: string;
    authenticated: boolean;
    authMethod?: string;
  }>; // Cached providers
  opencodeModelsLoading: boolean; // Whether OpenCode models are being fetched
  opencodeModelsError: string | null; // Error message if fetch failed
  opencodeModelsLastFetched: number | null; // Timestamp of last successful fetch
  opencodeModelsLastFailedAt: number | null; // Timestamp of last failed fetch

  // Provider Visibility Settings
  disabledProviders: ModelProvider[]; // Providers that are disabled and hidden from dropdowns

  // Claude Agent SDK Settings
  autoLoadClaudeMd: boolean; // Auto-load CLAUDE.md files using SDK's settingSources option
  skipSandboxWarning: boolean; // Skip the sandbox environment warning dialog on startup

  // MCP Servers
  mcpServers: MCPServerConfig[]; // List of configured MCP servers for agent use

  // Editor Configuration
  defaultEditorCommand: string | null; // Default editor for "Open In" action

  // Terminal Configuration
  defaultTerminalId: string | null; // Default external terminal for "Open In Terminal" action (null = integrated)

  // Skills Configuration
  enableSkills: boolean; // Enable Skills functionality (loads from .claude/skills/ directories)
  skillsSources: Array<'user' | 'project'>; // Which directories to load Skills from

  // Subagents Configuration
  enableSubagents: boolean; // Enable Custom Subagents functionality (loads from .claude/agents/ directories)
  subagentsSources: Array<'user' | 'project'>; // Which directories to load Subagents from

  // Prompt Customization
  promptCustomization: PromptCustomization; // Custom prompts for Auto Mode, Agent, Backlog Plan, Enhancement

  // Event Hooks
  eventHooks: EventHook[]; // Event hooks for custom commands or webhooks

  // Claude-Compatible Providers (new system)
  claudeCompatibleProviders: ClaudeCompatibleProvider[]; // Providers that expose models to dropdowns

  // Claude API Profiles (deprecated - kept for backward compatibility)
  claudeApiProfiles: ClaudeApiProfile[]; // Claude-compatible API endpoint profiles
  activeClaudeApiProfileId: string | null; // Active profile ID (null = use direct Anthropic API)

  // Project Analysis
  projectAnalysis: ProjectAnalysis | null;
  isAnalyzing: boolean;

  // Board Background Settings (per-project, keyed by project path)
  boardBackgroundByProject: Record<
    string,
    {
      imagePath: string | null; // Path to background image in .automaker directory
      imageVersion?: number; // Timestamp to bust browser cache when image is updated
      cardOpacity: number; // Opacity of cards (0-100)
      columnOpacity: number; // Opacity of columns (0-100)
      columnBorderEnabled: boolean; // Whether to show column borders
      cardGlassmorphism: boolean; // Whether to use glassmorphism (backdrop-blur) on cards
      cardBorderEnabled: boolean; // Whether to show card borders
      cardBorderOpacity: number; // Opacity of card borders (0-100)
      hideScrollbar: boolean; // Whether to hide the board scrollbar
    }
  >;

  // Theme Preview (for hover preview in theme selectors)
  previewTheme: ThemeMode | null;

  // Terminal state
  terminalState: TerminalState;

  // Terminal layout persistence (per-project, keyed by project path)
  // Stores the tab/split structure so it can be restored when switching projects
  terminalLayoutByProject: Record<string, PersistedTerminalState>;

  // Spec Creation State (per-project, keyed by project path)
  // Tracks which project is currently having its spec generated
  specCreatingForProject: string | null;

  defaultPlanningMode: PlanningMode;
  defaultRequirePlanApproval: boolean;
  defaultFeatureModel: PhaseModelEntry;

  // Plan Approval State
  // When a plan requires user approval, this holds the pending approval details
  pendingPlanApproval: {
    featureId: string;
    projectPath: string;
    planContent: string;
    planningMode: 'lite' | 'spec' | 'full';
  } | null;

  // Claude Usage Tracking
  claudeRefreshInterval: number; // Refresh interval in seconds (default: 60)
  claudeUsage: ClaudeUsage | null;
  claudeUsageLastUpdated: number | null;

  // Codex Usage Tracking
  codexUsage: CodexUsage | null;
  codexUsageLastUpdated: number | null;

  // Codex Models (dynamically fetched)
  codexModels: Array<{
    id: string;
    label: string;
    description: string;
    hasThinking: boolean;
    supportsVision: boolean;
    tier: 'premium' | 'standard' | 'basic';
    isDefault: boolean;
  }>;
  codexModelsLoading: boolean;
  codexModelsError: string | null;
  codexModelsLastFetched: number | null;
  codexModelsLastFailedAt: number | null;

  // Pipeline Configuration (per-project, keyed by project path)
  pipelineConfigByProject: Record<string, PipelineConfig>;

  // Worktree Panel Visibility (per-project, keyed by project path)
  // Whether the worktree panel row is visible (default: true)
  worktreePanelVisibleByProject: Record<string, boolean>;

  // Init Script Indicator Visibility (per-project, keyed by project path)
  // Whether to show the floating init script indicator panel (default: true)
  showInitScriptIndicatorByProject: Record<string, boolean>;

  // Default Delete Branch With Worktree (per-project, keyed by project path)
  // Whether to default the "delete branch" checkbox when deleting a worktree (default: false)
  defaultDeleteBranchByProject: Record<string, boolean>;

  // Auto-dismiss Init Script Indicator (per-project, keyed by project path)
  // Whether to auto-dismiss the indicator after completion (default: true)
  autoDismissInitScriptIndicatorByProject: Record<string, boolean>;

  // Use Worktrees Override (per-project, keyed by project path)
  // undefined = use global setting, true/false = project-specific override
  useWorktreesByProject: Record<string, boolean | undefined>;

  // UI State (previously in localStorage, now synced via API)
  /** Whether worktree panel is collapsed in board view */
  worktreePanelCollapsed: boolean;
  /** Last directory opened in file picker */
  lastProjectDir: string;
  /** Recently accessed folders for quick access */
  recentFolders: string[];

  // Init Script State (keyed by "projectPath::branch" to support concurrent scripts)
  initScriptState: Record<string, InitScriptState>;
}

// Types re-exported from ./types.ts: ClaudeUsage, ClaudeUsageResponse,
// CodexPlanType, CodexRateLimitWindow, CodexUsage, CodexUsageResponse,
// isClaudeUsageAtLimit, defaultBackgroundSettings, AutoModeActivity

export interface AppActions {
  // Project actions
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  removeProject: (projectId: string) => void;
  moveProjectToTrash: (projectId: string) => void;
  restoreTrashedProject: (projectId: string) => void;
  deleteTrashedProject: (projectId: string) => void;
  emptyTrash: () => void;
  setCurrentProject: (project: Project | null) => void;
  upsertAndSetCurrentProject: (path: string, name: string, theme?: ThemeMode) => Project; // Upsert project by path and set as current
  reorderProjects: (oldIndex: number, newIndex: number) => void;
  cyclePrevProject: () => void; // Cycle back through project history (Q)
  cycleNextProject: () => void; // Cycle forward through project history (E)
  clearProjectHistory: () => void; // Clear history, keeping only current project
  toggleProjectFavorite: (projectId: string) => void; // Toggle project favorite status
  setProjectIcon: (projectId: string, icon: string | null) => void; // Set project icon (null to clear)
  setProjectCustomIcon: (projectId: string, customIconPath: string | null) => void; // Set custom project icon image path (null to clear)
  setProjectName: (projectId: string, name: string) => void; // Update project name

  // View actions
  setCurrentView: (view: ViewMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleChatSidebar: () => void;
  setChatSidebarOpen: (open: boolean) => void;
  toggleBottomPanel: () => void;
  setBottomPanelActiveTab: (tab: string) => void;
  toggleMobileSidebarHidden: () => void;
  setMobileSidebarHidden: (hidden: boolean) => void;

  // Theme actions
  setTheme: (theme: ThemeMode) => void;
  setProjectTheme: (projectId: string, theme: ThemeMode | null) => void; // Set per-project theme (null to clear)
  getEffectiveTheme: () => ThemeMode; // Get the effective theme (project, global, or preview if set)
  setPreviewTheme: (theme: ThemeMode | null) => void; // Set preview theme for hover preview (null to clear)

  // Font actions (global + per-project override)
  setFontSans: (fontFamily: string | null) => void; // Set global UI/sans font (null to clear)
  setFontMono: (fontFamily: string | null) => void; // Set global code/mono font (null to clear)
  setProjectFontSans: (projectId: string, fontFamily: string | null) => void; // Set per-project UI/sans font override (null = use global)
  setProjectFontMono: (projectId: string, fontFamily: string | null) => void; // Set per-project code/mono font override (null = use global)
  getEffectiveFontSans: () => string | null; // Get effective UI font (project override -> global -> null for default)
  getEffectiveFontMono: () => string | null; // Get effective code font (project override -> global -> null for default)

  // Claude API Profile actions (per-project override)
  /** @deprecated Use setProjectPhaseModelOverride instead */
  setProjectClaudeApiProfile: (projectId: string, profileId: string | null | undefined) => void; // Set per-project Claude API profile (undefined = use global, null = direct API, string = specific profile)

  // Project Phase Model Overrides
  setProjectPhaseModelOverride: (
    projectId: string,
    phase: import('@automaker/types').PhaseModelKey,
    entry: import('@automaker/types').PhaseModelEntry | null // null = use global
  ) => void;
  clearAllProjectPhaseModelOverrides: (projectId: string) => void;

  // Feature actions
  setFeatures: (features: Feature[]) => void;
  updateFeature: (id: string, updates: Partial<Feature>) => void;
  addFeature: (feature: Omit<Feature, 'id'> & Partial<Pick<Feature, 'id'>>) => Feature;
  removeFeature: (id: string) => void;
  moveFeature: (id: string, newStatus: Feature['status']) => void;

  // App spec actions
  setAppSpec: (spec: string) => void;

  // IPC actions
  setIpcConnected: (connected: boolean) => void;

  // API Keys actions
  setApiKeys: (keys: Partial<ApiKeys>) => void;

  // Chat Session actions
  createChatSession: (title?: string) => ChatSession;
  updateChatSession: (sessionId: string, updates: Partial<ChatSession>) => void;
  addMessageToSession: (sessionId: string, message: ChatMessage) => void;
  setCurrentChatSession: (session: ChatSession | null) => void;
  archiveChatSession: (sessionId: string) => void;
  unarchiveChatSession: (sessionId: string) => void;
  deleteChatSession: (sessionId: string) => void;
  setChatHistoryOpen: (open: boolean) => void;
  toggleChatHistory: () => void;

  // Auto Mode actions (per-worktree)
  setAutoModeRunning: (
    projectId: string,
    branchName: string | null,
    running: boolean,
    maxConcurrency?: number,
    runningTasks?: string[]
  ) => void;
  addRunningTask: (projectId: string, branchName: string | null, taskId: string) => void;
  removeRunningTask: (projectId: string, branchName: string | null, taskId: string) => void;
  clearRunningTasks: (projectId: string, branchName: string | null) => void;
  getAutoModeState: (
    projectId: string,
    branchName: string | null
  ) => {
    isRunning: boolean;
    runningTasks: string[];
    branchName: string | null;
    maxConcurrency?: number;
  };
  /** Helper to generate worktree key from projectId and branchName */
  getWorktreeKey: (projectId: string, branchName: string | null) => string;
  addAutoModeActivity: (activity: Omit<AutoModeActivity, 'id' | 'timestamp'>) => void;
  clearAutoModeActivity: () => void;
  setMaxConcurrency: (max: number) => void; // Legacy: kept for backward compatibility
  getMaxConcurrencyForWorktree: (projectId: string, branchName: string | null) => number;
  setMaxConcurrencyForWorktree: (
    projectId: string,
    branchName: string | null,
    maxConcurrency: number
  ) => void;

  // Kanban Card Settings actions
  setBoardViewMode: (mode: BoardViewMode) => void;

  // Feature Default Settings actions
  setDefaultSkipTests: (skip: boolean) => void;
  setEnableDependencyBlocking: (enabled: boolean) => void;
  setSkipVerificationInAutoMode: (enabled: boolean) => Promise<void>;
  setEnableAiCommitMessages: (enabled: boolean) => Promise<void>;
  setPlanUseSelectedWorktreeBranch: (enabled: boolean) => Promise<void>;
  setAddFeatureUseSelectedWorktreeBranch: (enabled: boolean) => Promise<void>;

  // Worktree Settings actions
  setUseWorktrees: (enabled: boolean) => void;
  setCurrentWorktree: (projectPath: string, worktreePath: string | null, branch: string) => void;
  setWorktrees: (
    projectPath: string,
    worktrees: Array<{
      path: string;
      branch: string;
      isMain: boolean;
      hasChanges?: boolean;
      changedFilesCount?: number;
    }>
  ) => void;
  setWorktreesLoading: (projectPath: string, isLoading: boolean) => void;
  getWorktreesLoading: (projectPath: string) => boolean;
  getCurrentWorktree: (projectPath: string) => { path: string | null; branch: string } | null;
  getWorktrees: (projectPath: string) => Array<{
    path: string;
    branch: string;
    isMain: boolean;
    hasChanges?: boolean;
    changedFilesCount?: number;
  }>;
  isPrimaryWorktreeBranch: (projectPath: string, branchName: string) => boolean;
  getPrimaryWorktreeBranch: (projectPath: string) => string | null;

  // Keyboard Shortcuts actions
  setKeyboardShortcut: (key: keyof KeyboardShortcuts, value: string) => void;
  setKeyboardShortcuts: (shortcuts: Partial<KeyboardShortcuts>) => void;
  resetKeyboardShortcuts: () => void;

  // Audio Settings actions
  setMuteDoneSound: (muted: boolean) => void;

  // Server Log Level actions
  setServerLogLevel: (level: ServerLogLevel) => void;
  setEnableRequestLogging: (enabled: boolean) => void;

  // Enhancement Model actions
  setEnhancementModel: (model: ModelAlias) => void;

  // Validation Model actions
  setValidationModel: (model: ModelAlias) => void;

  // Phase Model actions
  setPhaseModel: (phase: PhaseModelKey, entry: PhaseModelEntry) => Promise<void>;
  setPhaseModels: (models: Partial<PhaseModelConfig>) => Promise<void>;
  resetPhaseModels: () => Promise<void>;
  toggleFavoriteModel: (modelId: string) => void;

  // Cursor CLI Settings actions
  setEnabledCursorModels: (models: CursorModelId[]) => void;
  setCursorDefaultModel: (model: CursorModelId) => void;
  toggleCursorModel: (model: CursorModelId, enabled: boolean) => void;

  // Codex CLI Settings actions
  setEnabledCodexModels: (models: CodexModelId[]) => void;
  setCodexDefaultModel: (model: CodexModelId) => void;
  toggleCodexModel: (model: CodexModelId, enabled: boolean) => void;
  setCodexAutoLoadAgents: (enabled: boolean) => Promise<void>;
  setCodexSandboxMode: (
    mode: 'read-only' | 'workspace-write' | 'danger-full-access'
  ) => Promise<void>;
  setCodexApprovalPolicy: (
    policy: 'untrusted' | 'on-failure' | 'on-request' | 'never'
  ) => Promise<void>;
  setCodexEnableWebSearch: (enabled: boolean) => Promise<void>;
  setCodexEnableImages: (enabled: boolean) => Promise<void>;

  // OpenCode CLI Settings actions
  setEnabledOpencodeModels: (models: OpencodeModelId[]) => void;
  setOpencodeDefaultModel: (model: OpencodeModelId) => void;
  toggleOpencodeModel: (model: OpencodeModelId, enabled: boolean) => void;
  setDynamicOpencodeModels: (models: ModelDefinition[]) => void;
  setEnabledDynamicModelIds: (ids: string[]) => void;
  toggleDynamicModel: (modelId: string, enabled: boolean) => void;
  setCachedOpencodeProviders: (
    providers: Array<{ id: string; name: string; authenticated: boolean; authMethod?: string }>
  ) => void;

  // Provider Visibility Settings actions
  setDisabledProviders: (providers: ModelProvider[]) => void;
  toggleProviderDisabled: (provider: ModelProvider, disabled: boolean) => void;
  isProviderDisabled: (provider: ModelProvider) => boolean;

  // Claude Agent SDK Settings actions
  setAutoLoadClaudeMd: (enabled: boolean) => Promise<void>;
  setSkipSandboxWarning: (skip: boolean) => Promise<void>;

  // Editor Configuration actions
  setDefaultEditorCommand: (command: string | null) => void;

  // Terminal Configuration actions
  setDefaultTerminalId: (terminalId: string | null) => void;

  // Prompt Customization actions
  setPromptCustomization: (customization: PromptCustomization) => Promise<void>;

  // Event Hook actions
  setEventHooks: (hooks: EventHook[]) => void;

  // Claude-Compatible Provider actions (new system)
  addClaudeCompatibleProvider: (provider: ClaudeCompatibleProvider) => Promise<void>;
  updateClaudeCompatibleProvider: (
    id: string,
    updates: Partial<ClaudeCompatibleProvider>
  ) => Promise<void>;
  deleteClaudeCompatibleProvider: (id: string) => Promise<void>;
  setClaudeCompatibleProviders: (providers: ClaudeCompatibleProvider[]) => Promise<void>;
  toggleClaudeCompatibleProviderEnabled: (id: string) => Promise<void>;

  // Claude API Profile actions (deprecated - kept for backward compatibility)
  addClaudeApiProfile: (profile: ClaudeApiProfile) => Promise<void>;
  updateClaudeApiProfile: (id: string, updates: Partial<ClaudeApiProfile>) => Promise<void>;
  deleteClaudeApiProfile: (id: string) => Promise<void>;
  setActiveClaudeApiProfile: (id: string | null) => Promise<void>;
  setClaudeApiProfiles: (profiles: ClaudeApiProfile[]) => Promise<void>;

  // MCP Server actions
  addMCPServer: (server: Omit<MCPServerConfig, 'id'>) => void;
  updateMCPServer: (id: string, updates: Partial<MCPServerConfig>) => void;
  removeMCPServer: (id: string) => void;
  reorderMCPServers: (oldIndex: number, newIndex: number) => void;

  // Project Analysis actions
  setProjectAnalysis: (analysis: ProjectAnalysis | null) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  clearAnalysis: () => void;

  // Agent Session actions
  setLastSelectedSession: (projectPath: string, sessionId: string | null) => void;
  getLastSelectedSession: (projectPath: string) => string | null;

  // Board Background actions
  setBoardBackground: (projectPath: string, imagePath: string | null) => void;
  setCardOpacity: (projectPath: string, opacity: number) => void;
  setColumnOpacity: (projectPath: string, opacity: number) => void;
  setColumnBorderEnabled: (projectPath: string, enabled: boolean) => void;
  getBoardBackground: (projectPath: string) => {
    imagePath: string | null;
    cardOpacity: number;
    columnOpacity: number;
    columnBorderEnabled: boolean;
    cardGlassmorphism: boolean;
    cardBorderEnabled: boolean;
    cardBorderOpacity: number;
    hideScrollbar: boolean;
  };
  setCardGlassmorphism: (projectPath: string, enabled: boolean) => void;
  setCardBorderEnabled: (projectPath: string, enabled: boolean) => void;
  setCardBorderOpacity: (projectPath: string, opacity: number) => void;
  setHideScrollbar: (projectPath: string, hide: boolean) => void;
  clearBoardBackground: (projectPath: string) => void;

  // Terminal actions
  setTerminalUnlocked: (unlocked: boolean, token?: string) => void;
  setActiveTerminalSession: (sessionId: string | null) => void;
  toggleTerminalMaximized: (sessionId: string) => void;
  addTerminalToLayout: (
    sessionId: string,
    direction?: 'horizontal' | 'vertical',
    targetSessionId?: string,
    branchName?: string
  ) => void;
  removeTerminalFromLayout: (sessionId: string) => void;
  swapTerminals: (sessionId1: string, sessionId2: string) => void;
  clearTerminalState: () => void;
  setTerminalPanelFontSize: (sessionId: string, fontSize: number) => void;
  setTerminalDefaultFontSize: (fontSize: number) => void;
  setTerminalDefaultRunScript: (script: string) => void;
  setTerminalScreenReaderMode: (enabled: boolean) => void;
  setTerminalFontFamily: (fontFamily: string) => void;
  setTerminalScrollbackLines: (lines: number) => void;
  setTerminalLineHeight: (lineHeight: number) => void;
  setTerminalMaxSessions: (maxSessions: number) => void;
  setTerminalLastActiveProjectPath: (projectPath: string | null) => void;
  setOpenTerminalMode: (mode: 'newTab' | 'split') => void;
  addTerminalTab: (name?: string) => string;
  removeTerminalTab: (tabId: string) => void;
  setActiveTerminalTab: (tabId: string) => void;
  renameTerminalTab: (tabId: string, name: string) => void;
  reorderTerminalTabs: (fromTabId: string, toTabId: string) => void;
  moveTerminalToTab: (sessionId: string, targetTabId: string | 'new') => void;
  addTerminalToTab: (
    sessionId: string,
    tabId: string,
    direction?: 'horizontal' | 'vertical',
    branchName?: string
  ) => void;
  setTerminalTabLayout: (
    tabId: string,
    layout: TerminalPanelContent,
    activeSessionId?: string
  ) => void;
  updateTerminalPanelSizes: (tabId: string, panelKeys: string[], sizes: number[]) => void;
  saveTerminalLayout: (projectPath: string) => void;
  getPersistedTerminalLayout: (projectPath: string) => PersistedTerminalState | null;
  clearPersistedTerminalLayout: (projectPath: string) => void;

  // Spec Creation actions
  setSpecCreatingForProject: (projectPath: string | null) => void;
  isSpecCreatingForProject: (projectPath: string) => boolean;

  setDefaultPlanningMode: (mode: PlanningMode) => void;
  setDefaultRequirePlanApproval: (require: boolean) => void;
  setDefaultFeatureModel: (entry: PhaseModelEntry) => void;

  // Plan Approval actions
  setPendingPlanApproval: (
    approval: {
      featureId: string;
      projectPath: string;
      planContent: string;
      planningMode: 'lite' | 'spec' | 'full';
    } | null
  ) => void;

  // Pipeline actions
  setPipelineConfig: (projectPath: string, config: PipelineConfig) => void;
  getPipelineConfig: (projectPath: string) => PipelineConfig | null;
  addPipelineStep: (
    projectPath: string,
    step: Omit<PipelineStep, 'id' | 'createdAt' | 'updatedAt'>
  ) => PipelineStep;
  updatePipelineStep: (
    projectPath: string,
    stepId: string,
    updates: Partial<Omit<PipelineStep, 'id' | 'createdAt'>>
  ) => void;
  deletePipelineStep: (projectPath: string, stepId: string) => void;
  reorderPipelineSteps: (projectPath: string, stepIds: string[]) => void;

  // Worktree Panel Visibility actions (per-project)
  setWorktreePanelVisible: (projectPath: string, visible: boolean) => void;
  getWorktreePanelVisible: (projectPath: string) => boolean;

  // Init Script Indicator Visibility actions (per-project)
  setShowInitScriptIndicator: (projectPath: string, visible: boolean) => void;
  getShowInitScriptIndicator: (projectPath: string) => boolean;

  // Default Delete Branch actions (per-project)
  setDefaultDeleteBranch: (projectPath: string, deleteBranch: boolean) => void;
  getDefaultDeleteBranch: (projectPath: string) => boolean;

  // Auto-dismiss Init Script Indicator actions (per-project)
  setAutoDismissInitScriptIndicator: (projectPath: string, autoDismiss: boolean) => void;
  getAutoDismissInitScriptIndicator: (projectPath: string) => boolean;

  // Use Worktrees Override actions (per-project)
  setProjectUseWorktrees: (projectPath: string, useWorktrees: boolean | null) => void; // null = use global
  getProjectUseWorktrees: (projectPath: string) => boolean | undefined; // undefined = using global
  getEffectiveUseWorktrees: (projectPath: string) => boolean; // Returns actual value (project or global fallback)

  // UI State actions (previously in localStorage, now synced via API)
  setWorktreePanelCollapsed: (collapsed: boolean) => void;
  setLastProjectDir: (dir: string) => void;
  setRecentFolders: (folders: string[]) => void;
  addRecentFolder: (folder: string) => void;

  // Claude Usage Tracking actions
  setClaudeRefreshInterval: (interval: number) => void;
  setClaudeUsageLastUpdated: (timestamp: number) => void;
  setClaudeUsage: (usage: ClaudeUsage | null) => void;

  // Codex Usage Tracking actions
  setCodexUsage: (usage: CodexUsage | null) => void;

  // Codex Models actions
  fetchCodexModels: (forceRefresh?: boolean) => Promise<void>;
  setCodexModels: (
    models: Array<{
      id: string;
      label: string;
      description: string;
      hasThinking: boolean;
      supportsVision: boolean;
      tier: 'premium' | 'standard' | 'basic';
      isDefault: boolean;
    }>
  ) => void;

  // OpenCode Models actions
  fetchOpencodeModels: (forceRefresh?: boolean) => Promise<void>;

  // Init Script State actions (keyed by projectPath::branch to support concurrent scripts)
  setInitScriptState: (
    projectPath: string,
    branch: string,
    state: Partial<InitScriptState>
  ) => void;
  appendInitScriptOutput: (projectPath: string, branch: string, content: string) => void;
  clearInitScriptState: (projectPath: string, branch: string) => void;
  getInitScriptState: (projectPath: string, branch: string) => InitScriptState | null;
  getInitScriptStatesForProject: (
    projectPath: string
  ) => Array<{ key: string; state: InitScriptState }>;

  // Reset
  reset: () => void;
}

const initialState: AppState = {
  projects: [],
  currentProject: null,
  trashedProjects: [],
  projectHistory: [],
  projectHistoryIndex: -1,
  currentView: 'welcome',
  sidebarOpen: true,
  chatSidebarOpen: false,
  bottomPanelOpen: false,
  bottomPanelActiveTab: 'activity',
  mobileSidebarHidden: false, // Sidebar visible by default on mobile
  lastSelectedSessionByProject: {},
  theme: getStoredTheme() || 'studio-dark', // Use localStorage theme as initial value, fallback to 'studio-dark'
  fontFamilySans: getStoredFontSans(), // Use localStorage font as initial value (null = use default Geist Sans)
  fontFamilyMono: getStoredFontMono(), // Use localStorage font as initial value (null = use default Geist Mono)
  features: [],
  appSpec: '',
  ipcConnected: false,
  apiKeys: {
    anthropic: '',
    google: '',
    openai: '',
  },
  chatSessions: [],
  currentChatSession: null,
  chatHistoryOpen: false,
  autoModeByWorktree: {},
  autoModeActivityLog: [],
  maxConcurrency: DEFAULT_MAX_CONCURRENCY, // Default concurrent agents
  boardViewMode: 'kanban', // Default to kanban view
  defaultSkipTests: true, // Default to manual verification (tests disabled)
  enableDependencyBlocking: true, // Default to enabled (show dependency blocking UI)
  skipVerificationInAutoMode: false, // Default to disabled (require dependencies to be verified)
  enableAiCommitMessages: true, // Default to enabled (auto-generate commit messages)
  planUseSelectedWorktreeBranch: true, // Default to enabled (Plan creates features on selected worktree branch)
  addFeatureUseSelectedWorktreeBranch: false, // Default to disabled (Add Feature uses normal defaults)
  useWorktrees: true, // Default to enabled (git worktree isolation)
  currentWorktreeByProject: {},
  worktreesByProject: {},
  worktreesLoadingByProject: {}, // Track loading state per project (default=true via getter)
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS, // Default keyboard shortcuts
  muteDoneSound: false, // Default to sound enabled (not muted)
  serverLogLevel: 'info', // Default to info level for server logs
  enableRequestLogging: true, // Default to enabled for HTTP request logging
  enhancementModel: 'claude-sonnet', // Default to sonnet for feature enhancement
  validationModel: 'claude-opus', // Default to opus for GitHub issue validation
  phaseModels: DEFAULT_PHASE_MODELS, // Phase-specific model configuration
  favoriteModels: [],
  enabledCursorModels: getAllCursorModelIds(), // All Cursor models enabled by default
  cursorDefaultModel: 'cursor-auto', // Default to auto selection
  enabledCodexModels: getAllCodexModelIds(), // All Codex models enabled by default
  codexDefaultModel: 'codex-gpt-5.2-codex', // Default to GPT-5.2-Codex
  codexAutoLoadAgents: false, // Default to disabled (user must opt-in)
  codexSandboxMode: 'workspace-write', // Default to workspace-write for safety
  codexApprovalPolicy: 'on-request', // Default to on-request for balanced safety
  codexEnableWebSearch: false, // Default to disabled
  codexEnableImages: false, // Default to disabled
  enabledOpencodeModels: getAllOpencodeModelIds(), // All OpenCode models enabled by default
  opencodeDefaultModel: DEFAULT_OPENCODE_MODEL, // Default to OpenCode free tier
  dynamicOpencodeModels: [], // Empty until fetched from OpenCode CLI
  enabledDynamicModelIds: [], // Empty until user enables dynamic models
  cachedOpencodeProviders: [], // Empty until fetched from OpenCode CLI
  opencodeModelsLoading: false,
  opencodeModelsError: null,
  opencodeModelsLastFetched: null,
  opencodeModelsLastFailedAt: null,
  disabledProviders: [], // No providers disabled by default
  autoLoadClaudeMd: false, // Default to disabled (user must opt-in)
  skipSandboxWarning: false, // Default to disabled (show sandbox warning dialog)
  mcpServers: [], // No MCP servers configured by default
  defaultEditorCommand: null, // Auto-detect: Cursor > VS Code > first available
  defaultTerminalId: null, // Integrated terminal by default
  enableSkills: true, // Skills enabled by default
  skillsSources: ['user', 'project'] as Array<'user' | 'project'>, // Load from both sources by default
  enableSubagents: true, // Subagents enabled by default
  subagentsSources: ['user', 'project'] as Array<'user' | 'project'>, // Load from both sources by default
  promptCustomization: {}, // Empty by default - all prompts use built-in defaults
  eventHooks: [], // No event hooks configured by default
  claudeCompatibleProviders: [], // Claude-compatible providers that expose models
  claudeApiProfiles: [], // No Claude API profiles configured by default (deprecated)
  activeClaudeApiProfileId: null, // Use direct Anthropic API by default (deprecated)
  projectAnalysis: null,
  isAnalyzing: false,
  boardBackgroundByProject: {},
  previewTheme: null,
  terminalState: {
    isUnlocked: false,
    authToken: null,
    tabs: [],
    activeTabId: null,
    activeSessionId: null,
    maximizedSessionId: null,
    defaultFontSize: 14,
    defaultRunScript: '',
    screenReaderMode: false,
    fontFamily: DEFAULT_FONT_VALUE,
    scrollbackLines: 5000,
    lineHeight: 1.0,
    maxSessions: 100,
    lastActiveProjectPath: null,
    openTerminalMode: 'newTab',
  },
  terminalLayoutByProject: {},
  specCreatingForProject: null,
  defaultPlanningMode: 'skip' as PlanningMode,
  defaultRequirePlanApproval: false,
  defaultFeatureModel: { model: 'opus' } as PhaseModelEntry,
  pendingPlanApproval: null,
  claudeRefreshInterval: 60,
  claudeUsage: null,
  claudeUsageLastUpdated: null,
  codexUsage: null,
  codexUsageLastUpdated: null,
  codexModels: [],
  codexModelsLoading: false,
  codexModelsError: null,
  codexModelsLastFetched: null,
  codexModelsLastFailedAt: null,
  pipelineConfigByProject: {},
  worktreePanelVisibleByProject: {},
  showInitScriptIndicatorByProject: {},
  defaultDeleteBranchByProject: {},
  autoDismissInitScriptIndicatorByProject: {},
  useWorktreesByProject: {},
  // UI State (previously in localStorage, now synced via API)
  worktreePanelCollapsed: false,
  lastProjectDir: '',
  recentFolders: [],
  initScriptState: {},
};

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
  ...initialState,

  // Project actions
  setProjects: (projects) => set({ projects }),

  addProject: (project) => {
    const projects = get().projects;
    const existing = projects.findIndex((p) => p.path === project.path);
    if (existing >= 0) {
      const updated = [...projects];
      updated[existing] = {
        ...project,
        lastOpened: new Date().toISOString(),
      };
      set({ projects: updated });
    } else {
      set({
        projects: [...projects, { ...project, lastOpened: new Date().toISOString() }],
      });
    }
  },

  removeProject: (projectId) => {
    set({ projects: get().projects.filter((p) => p.id !== projectId) });
  },

  moveProjectToTrash: (projectId) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) {
      console.warn('[MOVE_TO_TRASH] Project not found:', projectId);
      return;
    }

    console.log('[MOVE_TO_TRASH] Moving project to trash:', {
      projectId,
      projectName: project.name,
      currentProjectCount: get().projects.length,
    });

    const remainingProjects = get().projects.filter((p) => p.id !== projectId);
    const existingTrash = get().trashedProjects.filter((p) => p.id !== projectId);
    const trashedProject: TrashedProject = {
      ...project,
      trashedAt: new Date().toISOString(),
      deletedFromDisk: false,
    };

    const isCurrent = get().currentProject?.id === projectId;
    const nextCurrentProject = isCurrent ? null : get().currentProject;

    console.log('[MOVE_TO_TRASH] Updating store with new state:', {
      newProjectCount: remainingProjects.length,
      newTrashedCount: [trashedProject, ...existingTrash].length,
    });

    set({
      projects: remainingProjects,
      trashedProjects: [trashedProject, ...existingTrash],
      currentProject: nextCurrentProject,
      currentView: isCurrent ? 'welcome' : get().currentView,
    });

    persistEffectiveThemeForProject(nextCurrentProject, get().theme);
  },

  restoreTrashedProject: (projectId) => {
    const trashed = get().trashedProjects.find((p) => p.id === projectId);
    if (!trashed) return;

    const remainingTrash = get().trashedProjects.filter((p) => p.id !== projectId);
    const existingProjects = get().projects;
    const samePathProject = existingProjects.find((p) => p.path === trashed.path);
    const projectsWithoutId = existingProjects.filter((p) => p.id !== projectId);

    // If a project with the same path already exists, keep it and just remove from trash
    if (samePathProject) {
      set({
        trashedProjects: remainingTrash,
        currentProject: samePathProject,
        currentView: 'board',
      });
      persistEffectiveThemeForProject(samePathProject, get().theme);
      return;
    }

    const restoredProject: Project = {
      id: trashed.id,
      name: trashed.name,
      path: trashed.path,
      lastOpened: new Date().toISOString(),
      theme: trashed.theme, // Preserve theme from trashed project
    };

    set({
      trashedProjects: remainingTrash,
      projects: [...projectsWithoutId, restoredProject],
      currentProject: restoredProject,
      currentView: 'board',
    });
    persistEffectiveThemeForProject(restoredProject, get().theme);
  },

  deleteTrashedProject: (projectId) => {
    set({
      trashedProjects: get().trashedProjects.filter((p) => p.id !== projectId),
    });
  },

  emptyTrash: () => set({ trashedProjects: [] }),

  reorderProjects: (oldIndex, newIndex) => {
    const projects = [...get().projects];
    const [movedProject] = projects.splice(oldIndex, 1);
    projects.splice(newIndex, 0, movedProject);
    set({ projects });
  },

  setCurrentProject: (project) => {
    set({ currentProject: project });
    persistEffectiveThemeForProject(project, get().theme);
    if (project) {
      set({ currentView: 'board' });
      // Add to project history (MRU order)
      const currentHistory = get().projectHistory;
      // Remove this project if it's already in history
      const filteredHistory = currentHistory.filter((id) => id !== project.id);
      // Add to the front (most recent)
      const newHistory = [project.id, ...filteredHistory];
      // Reset history index to 0 (current project)
      set({ projectHistory: newHistory, projectHistoryIndex: 0 });
    } else {
      set({ currentView: 'welcome' });
    }
  },

  upsertAndSetCurrentProject: (path, name, theme) => {
    const {
      projects,
      trashedProjects,
      currentProject: _currentProject,
      theme: _globalTheme,
    } = get();
    const existingProject = projects.find((p) => p.path === path);
    let project: Project;

    if (existingProject) {
      // Update existing project, preserving theme and other properties
      project = {
        ...existingProject,
        name, // Update name in case it changed
        lastOpened: new Date().toISOString(),
      };
      // Update the project in the store
      const updatedProjects = projects.map((p) => (p.id === existingProject.id ? project : p));
      set({ projects: updatedProjects });
    } else {
      // Create new project - only set theme if explicitly provided or recovering from trash
      // Otherwise leave undefined so project uses global theme ("Use Global Theme" checked)
      const trashedProject = trashedProjects.find((p) => p.path === path);
      const projectTheme =
        theme !== undefined ? theme : (trashedProject?.theme as ThemeMode | undefined);

      project = {
        id: `project-${Date.now()}`,
        name,
        path,
        lastOpened: new Date().toISOString(),
        theme: projectTheme, // May be undefined - intentional!
      };
      // Add the new project to the store
      set({
        projects: [...projects, { ...project, lastOpened: new Date().toISOString() }],
      });
    }

    // Set as current project (this will also update history and view)
    get().setCurrentProject(project);
    return project;
  },

  cyclePrevProject: () => {
    const { projectHistory, projectHistoryIndex, projects } = get();

    // Filter history to only include valid projects
    const validHistory = projectHistory.filter((id) => projects.some((p) => p.id === id));

    if (validHistory.length <= 1) return; // Need at least 2 valid projects to cycle

    // Find current position in valid history
    const currentProjectId = get().currentProject?.id;
    let currentIndex = currentProjectId
      ? validHistory.indexOf(currentProjectId)
      : projectHistoryIndex;

    // If current project not found in valid history, start from 0
    if (currentIndex === -1) currentIndex = 0;

    // Move to the next index (going back in history = higher index), wrapping around
    const newIndex = (currentIndex + 1) % validHistory.length;
    const targetProjectId = validHistory[newIndex];
    const targetProject = projects.find((p) => p.id === targetProjectId);

    if (targetProject) {
      // Update history to only include valid projects and set new index
      set({
        currentProject: targetProject,
        projectHistory: validHistory,
        projectHistoryIndex: newIndex,
        currentView: 'board',
      });
      persistEffectiveThemeForProject(targetProject, get().theme);
    }
  },

  cycleNextProject: () => {
    const { projectHistory, projectHistoryIndex, projects } = get();

    // Filter history to only include valid projects
    const validHistory = projectHistory.filter((id) => projects.some((p) => p.id === id));

    if (validHistory.length <= 1) return; // Need at least 2 valid projects to cycle

    // Find current position in valid history
    const currentProjectId = get().currentProject?.id;
    let currentIndex = currentProjectId
      ? validHistory.indexOf(currentProjectId)
      : projectHistoryIndex;

    // If current project not found in valid history, start from 0
    if (currentIndex === -1) currentIndex = 0;

    // Move to the previous index (going forward = lower index), wrapping around
    const newIndex = currentIndex <= 0 ? validHistory.length - 1 : currentIndex - 1;
    const targetProjectId = validHistory[newIndex];
    const targetProject = projects.find((p) => p.id === targetProjectId);

    if (targetProject) {
      // Update history to only include valid projects and set new index
      set({
        currentProject: targetProject,
        projectHistory: validHistory,
        projectHistoryIndex: newIndex,
        currentView: 'board',
      });
      persistEffectiveThemeForProject(targetProject, get().theme);
    }
  },

  clearProjectHistory: () => {
    const currentProject = get().currentProject;
    if (currentProject) {
      // Keep only the current project in history
      set({
        projectHistory: [currentProject.id],
        projectHistoryIndex: 0,
      });
    } else {
      // No current project, clear everything
      set({
        projectHistory: [],
        projectHistoryIndex: -1,
      });
    }
  },

  toggleProjectFavorite: (projectId) => {
    const { projects, currentProject } = get();
    const updatedProjects = projects.map((p) =>
      p.id === projectId ? { ...p, isFavorite: !p.isFavorite } : p
    );
    set({ projects: updatedProjects });
    // Also update currentProject if it matches
    if (currentProject?.id === projectId) {
      set({
        currentProject: {
          ...currentProject,
          isFavorite: !currentProject.isFavorite,
        },
      });
    }
  },

  setProjectIcon: (projectId, icon) => {
    const { projects, currentProject } = get();
    const updatedProjects = projects.map((p) =>
      p.id === projectId ? { ...p, icon: icon === null ? undefined : icon } : p
    );
    set({ projects: updatedProjects });
    // Also update currentProject if it matches
    if (currentProject?.id === projectId) {
      set({
        currentProject: {
          ...currentProject,
          icon: icon === null ? undefined : icon,
        },
      });
    }
  },

  setProjectCustomIcon: (projectId, customIconPath) => {
    const { projects, currentProject } = get();
    const updatedProjects = projects.map((p) =>
      p.id === projectId
        ? { ...p, customIconPath: customIconPath === null ? undefined : customIconPath }
        : p
    );
    set({ projects: updatedProjects });
    // Also update currentProject if it matches
    if (currentProject?.id === projectId) {
      set({
        currentProject: {
          ...currentProject,
          customIconPath: customIconPath === null ? undefined : customIconPath,
        },
      });
    }
  },

  setProjectName: (projectId, name) => {
    const { projects, currentProject } = get();
    const updatedProjects = projects.map((p) => (p.id === projectId ? { ...p, name } : p));
    set({ projects: updatedProjects });
    // Also update currentProject if it matches
    if (currentProject?.id === projectId) {
      set({
        currentProject: {
          ...currentProject,
          name,
        },
      });
    }
  },

  // View actions
  setCurrentView: (view) => set({ currentView: view }),
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleChatSidebar: () => set({ chatSidebarOpen: !get().chatSidebarOpen }),
  setChatSidebarOpen: (open) => set({ chatSidebarOpen: open }),
  toggleBottomPanel: () => set({ bottomPanelOpen: !get().bottomPanelOpen }),
  setBottomPanelActiveTab: (tab) => set({ bottomPanelActiveTab: tab }),
  toggleMobileSidebarHidden: () => set({ mobileSidebarHidden: !get().mobileSidebarHidden }),
  setMobileSidebarHidden: (hidden) => set({ mobileSidebarHidden: hidden }),

  // Theme actions — setTheme/setPreviewTheme forwarded to useThemeStore
  setTheme: (...args) => useThemeStore.getState().setTheme(...args),

  setProjectTheme: (projectId, theme) => {
    // Update the project's theme property
    const projects = get().projects.map((p) =>
      p.id === projectId ? { ...p, theme: theme === null ? undefined : theme } : p
    );
    set({ projects });

    // Also update currentProject if it's the same project
    const currentProject = get().currentProject;
    if (currentProject?.id === projectId) {
      const updatedTheme = theme === null ? undefined : theme;
      set({
        currentProject: {
          ...currentProject,
          theme: updatedTheme,
        },
      });
      persistEffectiveThemeForProject({ ...currentProject, theme: updatedTheme }, get().theme);
    }
  },

  getEffectiveTheme: () => {
    // If preview theme is set, use it (for hover preview)
    const previewTheme = get().previewTheme;
    if (previewTheme) {
      return previewTheme;
    }
    const currentProject = get().currentProject;
    // If current project has a theme set, use it
    if (currentProject?.theme) {
      return currentProject.theme as ThemeMode;
    }
    // Otherwise fall back to global theme
    return get().theme;
  },

  setPreviewTheme: (...args) => useThemeStore.getState().setPreviewTheme(...args),

  // Font actions — global setters forwarded to useThemeStore
  setFontSans: (...args) => useThemeStore.getState().setFontSans(...args),
  setFontMono: (...args) => useThemeStore.getState().setFontMono(...args),

  setProjectFontSans: (projectId, fontFamily) => {
    // Update the project's fontFamilySans property
    // null means "clear to use global", any string (including 'default') means explicit override
    const projects = get().projects.map((p) =>
      p.id === projectId
        ? { ...p, fontFamilySans: fontFamily === null ? undefined : fontFamily }
        : p
    );
    set({ projects });

    // Also update currentProject if it's the same project
    const currentProject = get().currentProject;
    if (currentProject?.id === projectId) {
      set({
        currentProject: {
          ...currentProject,
          fontFamilySans: fontFamily === null ? undefined : fontFamily,
        },
      });
    }
  },

  setProjectFontMono: (projectId, fontFamily) => {
    // Update the project's fontFamilyMono property
    // null means "clear to use global", any string (including 'default') means explicit override
    const projects = get().projects.map((p) =>
      p.id === projectId
        ? { ...p, fontFamilyMono: fontFamily === null ? undefined : fontFamily }
        : p
    );
    set({ projects });

    // Also update currentProject if it's the same project
    const currentProject = get().currentProject;
    if (currentProject?.id === projectId) {
      set({
        currentProject: {
          ...currentProject,
          fontFamilyMono: fontFamily === null ? undefined : fontFamily,
        },
      });
    }
  },

  getEffectiveFontSans: () => {
    const { currentProject, fontFamilySans } = get();
    return getEffectiveFont(currentProject?.fontFamilySans, fontFamilySans, UI_SANS_FONT_OPTIONS);
  },

  getEffectiveFontMono: () => {
    const { currentProject, fontFamilyMono } = get();
    return getEffectiveFont(currentProject?.fontFamilyMono, fontFamilyMono, UI_MONO_FONT_OPTIONS);
  },

  // Claude API Profile actions (per-project override)
  setProjectClaudeApiProfile: (projectId, profileId) => {
    // Find the project to get its path for server sync
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) {
      console.error('Cannot set Claude API profile: project not found');
      return;
    }

    // Update the project's activeClaudeApiProfileId property
    // undefined means "use global", null means "explicit direct API", string means specific profile
    const projects = get().projects.map((p) =>
      p.id === projectId ? { ...p, activeClaudeApiProfileId: profileId } : p
    );
    set({ projects });

    // Also update currentProject if it's the same project
    const currentProject = get().currentProject;
    if (currentProject?.id === projectId) {
      set({
        currentProject: {
          ...currentProject,
          activeClaudeApiProfileId: profileId,
        },
      });
    }

    // Persist to server
    // Note: undefined means "use global" but JSON doesn't serialize undefined,
    // so we use a special marker string "__USE_GLOBAL__" to signal deletion
    const httpClient = getHttpApiClient();
    const serverValue = profileId === undefined ? '__USE_GLOBAL__' : profileId;
    httpClient.settings
      .updateProject(project.path, {
        activeClaudeApiProfileId: serverValue,
      })
      .catch((error) => {
        console.error('Failed to persist activeClaudeApiProfileId:', error);
      });
  },

  // Project Phase Model Override actions
  setProjectPhaseModelOverride: (projectId, phase, entry) => {
    // Find the project to get its path for server sync
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) {
      console.error('Cannot set phase model override: project not found');
      return;
    }

    // Get current overrides or start fresh
    const currentOverrides = project.phaseModelOverrides || {};

    // Build new overrides
    let newOverrides: typeof currentOverrides;
    if (entry === null) {
      // Remove the override (use global)

      const { [phase]: _, ...rest } = currentOverrides;
      newOverrides = rest;
    } else {
      // Set the override
      newOverrides = { ...currentOverrides, [phase]: entry };
    }

    // Update the project's phaseModelOverrides
    const projects = get().projects.map((p) =>
      p.id === projectId
        ? {
            ...p,
            phaseModelOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : undefined,
          }
        : p
    );
    set({ projects });

    // Also update currentProject if it's the same project
    const currentProject = get().currentProject;
    if (currentProject?.id === projectId) {
      set({
        currentProject: {
          ...currentProject,
          phaseModelOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : undefined,
        },
      });
    }

    // Persist to server
    const httpClient = getHttpApiClient();
    httpClient.settings
      .updateProject(project.path, {
        phaseModelOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : '__CLEAR__',
      })
      .catch((error) => {
        console.error('Failed to persist phaseModelOverrides:', error);
      });
  },

  clearAllProjectPhaseModelOverrides: (projectId) => {
    // Find the project to get its path for server sync
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) {
      console.error('Cannot clear phase model overrides: project not found');
      return;
    }

    // Clear overrides from project
    const projects = get().projects.map((p) =>
      p.id === projectId ? { ...p, phaseModelOverrides: undefined } : p
    );
    set({ projects });

    // Also update currentProject if it's the same project
    const currentProject = get().currentProject;
    if (currentProject?.id === projectId) {
      set({
        currentProject: {
          ...currentProject,
          phaseModelOverrides: undefined,
        },
      });
    }

    // Persist to server
    const httpClient = getHttpApiClient();
    httpClient.settings
      .updateProject(project.path, {
        phaseModelOverrides: '__CLEAR__',
      })
      .catch((error) => {
        console.error('Failed to clear phaseModelOverrides:', error);
      });
  },

  // Feature actions
  setFeatures: (features) => set({ features }),

  updateFeature: (id, updates) => {
    set({
      features: get().features.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    });
  },

  addFeature: (feature) => {
    const id = feature.id || `feature-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const featureWithId = { ...feature, id } as unknown as Feature;
    set({ features: [...get().features, featureWithId] });
    return featureWithId;
  },

  removeFeature: (id) => {
    set({ features: get().features.filter((f) => f.id !== id) });
  },

  moveFeature: (id, newStatus) => {
    set({
      features: get().features.map((f) => (f.id === id ? { ...f, status: newStatus } : f)),
    });
  },

  // App spec actions
  setAppSpec: (spec) => set({ appSpec: spec }),

  // IPC actions
  setIpcConnected: (connected) => set({ ipcConnected: connected }),

  // API Keys actions
  setApiKeys: (keys) => set({ apiKeys: { ...get().apiKeys, ...keys } }),

  // Chat Session actions
  createChatSession: (title) => {
    const currentProject = get().currentProject;
    if (!currentProject) {
      throw new Error('No project selected');
    }

    const now = new Date();
    const session: ChatSession = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: title || `Chat ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      projectId: currentProject.id,
      messages: [
        {
          id: 'welcome',
          role: 'assistant',
          content:
            "Hello! I'm the Automaker Agent. I can help you build software autonomously. What would you like to create today?",
          timestamp: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
      archived: false,
    };

    set({
      chatSessions: [...get().chatSessions, session],
      currentChatSession: session,
    });

    return session;
  },

  updateChatSession: (sessionId, updates) => {
    set({
      chatSessions: get().chatSessions.map((session) =>
        session.id === sessionId ? { ...session, ...updates, updatedAt: new Date() } : session
      ),
    });

    // Update current session if it's the one being updated
    const currentSession = get().currentChatSession;
    if (currentSession && currentSession.id === sessionId) {
      set({
        currentChatSession: {
          ...currentSession,
          ...updates,
          updatedAt: new Date(),
        },
      });
    }
  },

  addMessageToSession: (sessionId, message) => {
    const sessions = get().chatSessions;
    const sessionIndex = sessions.findIndex((s) => s.id === sessionId);

    if (sessionIndex >= 0) {
      const updatedSessions = [...sessions];
      updatedSessions[sessionIndex] = {
        ...updatedSessions[sessionIndex],
        messages: [...updatedSessions[sessionIndex].messages, message],
        updatedAt: new Date(),
      };

      set({ chatSessions: updatedSessions });

      // Update current session if it's the one being updated
      const currentSession = get().currentChatSession;
      if (currentSession && currentSession.id === sessionId) {
        set({
          currentChatSession: updatedSessions[sessionIndex],
        });
      }
    }
  },

  setCurrentChatSession: (session) => {
    set({ currentChatSession: session });
  },

  archiveChatSession: (sessionId) => {
    get().updateChatSession(sessionId, { archived: true });
  },

  unarchiveChatSession: (sessionId) => {
    get().updateChatSession(sessionId, { archived: false });
  },

  deleteChatSession: (sessionId) => {
    const currentSession = get().currentChatSession;
    set({
      chatSessions: get().chatSessions.filter((s) => s.id !== sessionId),
      currentChatSession: currentSession?.id === sessionId ? null : currentSession,
    });
  },

  setChatHistoryOpen: (open) => set({ chatHistoryOpen: open }),

  toggleChatHistory: () => set({ chatHistoryOpen: !get().chatHistoryOpen }),

  // Auto Mode actions — forwarded to useWorktreeStore
  getWorktreeKey: (...args) => useWorktreeStore.getState().getWorktreeKey(...args),
  setAutoModeRunning: (...args) => useWorktreeStore.getState().setAutoModeRunning(...args),
  addRunningTask: (...args) => useWorktreeStore.getState().addRunningTask(...args),
  removeRunningTask: (...args) => useWorktreeStore.getState().removeRunningTask(...args),
  clearRunningTasks: (...args) => useWorktreeStore.getState().clearRunningTasks(...args),
  getAutoModeState: (...args) => useWorktreeStore.getState().getAutoModeState(...args),
  getMaxConcurrencyForWorktree: (...args) =>
    useWorktreeStore.getState().getMaxConcurrencyForWorktree(...args),
  setMaxConcurrencyForWorktree: (...args) =>
    useWorktreeStore.getState().setMaxConcurrencyForWorktree(...args),
  addAutoModeActivity: (...args) => useWorktreeStore.getState().addAutoModeActivity(...args),
  clearAutoModeActivity: () => useWorktreeStore.getState().clearAutoModeActivity(),
  setMaxConcurrency: (...args) => useWorktreeStore.getState().setMaxConcurrency(...args),

  // Kanban Card Settings actions
  setBoardViewMode: (mode) => set({ boardViewMode: mode }),

  // Feature Default Settings actions
  setDefaultSkipTests: (skip) => set({ defaultSkipTests: skip }),
  setEnableDependencyBlocking: (enabled) => set({ enableDependencyBlocking: enabled }),
  setSkipVerificationInAutoMode: async (enabled) => {
    set({ skipVerificationInAutoMode: enabled });
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },
  setEnableAiCommitMessages: async (enabled) => {
    const previous = get().enableAiCommitMessages;
    set({ enableAiCommitMessages: enabled });
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    const ok = await syncSettingsToServer();
    if (!ok) {
      logger.error('Failed to sync enableAiCommitMessages setting to server - reverting');
      set({ enableAiCommitMessages: previous });
    }
  },
  setPlanUseSelectedWorktreeBranch: async (enabled) => {
    const previous = get().planUseSelectedWorktreeBranch;
    set({ planUseSelectedWorktreeBranch: enabled });
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    const ok = await syncSettingsToServer();
    if (!ok) {
      logger.error('Failed to sync planUseSelectedWorktreeBranch setting to server - reverting');
      set({ planUseSelectedWorktreeBranch: previous });
    }
  },
  setAddFeatureUseSelectedWorktreeBranch: async (enabled) => {
    const previous = get().addFeatureUseSelectedWorktreeBranch;
    set({ addFeatureUseSelectedWorktreeBranch: enabled });
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    const ok = await syncSettingsToServer();
    if (!ok) {
      logger.error(
        'Failed to sync addFeatureUseSelectedWorktreeBranch setting to server - reverting'
      );
      set({ addFeatureUseSelectedWorktreeBranch: previous });
    }
  },

  // Worktree Settings actions — forwarded to useWorktreeStore
  setUseWorktrees: (...args) => useWorktreeStore.getState().setUseWorktrees(...args),
  setCurrentWorktree: (...args) => useWorktreeStore.getState().setCurrentWorktree(...args),
  setWorktrees: (...args) => useWorktreeStore.getState().setWorktrees(...args),
  setWorktreesLoading: (...args) => useWorktreeStore.getState().setWorktreesLoading(...args),
  getWorktreesLoading: (...args) => useWorktreeStore.getState().getWorktreesLoading(...args),
  getCurrentWorktree: (...args) => useWorktreeStore.getState().getCurrentWorktree(...args),
  getWorktrees: (...args) => useWorktreeStore.getState().getWorktrees(...args),
  isPrimaryWorktreeBranch: (...args) =>
    useWorktreeStore.getState().isPrimaryWorktreeBranch(...args),
  getPrimaryWorktreeBranch: (...args) =>
    useWorktreeStore.getState().getPrimaryWorktreeBranch(...args),

  // Keyboard Shortcuts actions
  setKeyboardShortcut: (key, value) => {
    set({
      keyboardShortcuts: {
        ...get().keyboardShortcuts,
        [key]: value,
      },
    });
  },

  setKeyboardShortcuts: (shortcuts) => {
    set({
      keyboardShortcuts: {
        ...get().keyboardShortcuts,
        ...shortcuts,
      },
    });
  },

  resetKeyboardShortcuts: () => {
    set({ keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS });
  },

  // Audio Settings actions
  setMuteDoneSound: (muted) => set({ muteDoneSound: muted }),

  // Server Log Level actions
  setServerLogLevel: (level) => set({ serverLogLevel: level }),
  setEnableRequestLogging: (enabled) => set({ enableRequestLogging: enabled }),

  // AI Model actions — forwarded to useAIModelsStore
  setEnhancementModel: (...args) => useAIModelsStore.getState().setEnhancementModel(...args),
  setValidationModel: (...args) => useAIModelsStore.getState().setValidationModel(...args),
  setPhaseModel: (...args) => useAIModelsStore.getState().setPhaseModel(...args),
  setPhaseModels: (...args) => useAIModelsStore.getState().setPhaseModels(...args),
  resetPhaseModels: () => useAIModelsStore.getState().resetPhaseModels(),
  toggleFavoriteModel: (...args) => useAIModelsStore.getState().toggleFavoriteModel(...args),
  setEnabledCursorModels: (...args) => useAIModelsStore.getState().setEnabledCursorModels(...args),
  setCursorDefaultModel: (...args) => useAIModelsStore.getState().setCursorDefaultModel(...args),
  toggleCursorModel: (...args) => useAIModelsStore.getState().toggleCursorModel(...args),
  setEnabledCodexModels: (...args) => useAIModelsStore.getState().setEnabledCodexModels(...args),
  setCodexDefaultModel: (...args) => useAIModelsStore.getState().setCodexDefaultModel(...args),
  toggleCodexModel: (...args) => useAIModelsStore.getState().toggleCodexModel(...args),
  setCodexAutoLoadAgents: (...args) => useAIModelsStore.getState().setCodexAutoLoadAgents(...args),
  setCodexSandboxMode: (...args) => useAIModelsStore.getState().setCodexSandboxMode(...args),
  setCodexApprovalPolicy: (...args) => useAIModelsStore.getState().setCodexApprovalPolicy(...args),
  setCodexEnableWebSearch: (...args) =>
    useAIModelsStore.getState().setCodexEnableWebSearch(...args),
  setCodexEnableImages: (...args) => useAIModelsStore.getState().setCodexEnableImages(...args),
  setEnabledOpencodeModels: (...args) =>
    useAIModelsStore.getState().setEnabledOpencodeModels(...args),
  setOpencodeDefaultModel: (...args) =>
    useAIModelsStore.getState().setOpencodeDefaultModel(...args),
  toggleOpencodeModel: (...args) => useAIModelsStore.getState().toggleOpencodeModel(...args),
  setDynamicOpencodeModels: (...args) =>
    useAIModelsStore.getState().setDynamicOpencodeModels(...args),
  setEnabledDynamicModelIds: (...args) =>
    useAIModelsStore.getState().setEnabledDynamicModelIds(...args),
  toggleDynamicModel: (...args) => useAIModelsStore.getState().toggleDynamicModel(...args),
  setCachedOpencodeProviders: (...args) =>
    useAIModelsStore.getState().setCachedOpencodeProviders(...args),
  setDisabledProviders: (...args) => useAIModelsStore.getState().setDisabledProviders(...args),
  toggleProviderDisabled: (...args) => useAIModelsStore.getState().toggleProviderDisabled(...args),
  isProviderDisabled: (...args) => useAIModelsStore.getState().isProviderDisabled(...args),
  setAutoLoadClaudeMd: (...args) => useAIModelsStore.getState().setAutoLoadClaudeMd(...args),
  setSkipSandboxWarning: (...args) => useAIModelsStore.getState().setSkipSandboxWarning(...args),

  // Editor Configuration actions
  setDefaultEditorCommand: (command) => set({ defaultEditorCommand: command }),
  // Terminal Configuration actions
  setDefaultTerminalId: (terminalId) =>
    useTerminalStore.getState().setDefaultTerminalId(terminalId),
  // Prompt Customization actions
  setPromptCustomization: async (customization) => {
    set({ promptCustomization: customization });
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  // Event Hook actions
  setEventHooks: (hooks) => set({ eventHooks: hooks }),

  // Claude-Compatible Provider actions — forwarded to useAIModelsStore
  addClaudeCompatibleProvider: (...args) =>
    useAIModelsStore.getState().addClaudeCompatibleProvider(...args),
  updateClaudeCompatibleProvider: (...args) =>
    useAIModelsStore.getState().updateClaudeCompatibleProvider(...args),
  deleteClaudeCompatibleProvider: (...args) =>
    useAIModelsStore.getState().deleteClaudeCompatibleProvider(...args),
  setClaudeCompatibleProviders: (...args) =>
    useAIModelsStore.getState().setClaudeCompatibleProviders(...args),
  toggleClaudeCompatibleProviderEnabled: (...args) =>
    useAIModelsStore.getState().toggleClaudeCompatibleProviderEnabled(...args),

  // Claude API Profile actions — forwarded to useAIModelsStore
  // (except deleteClaudeApiProfile which has cross-domain project cleanup)
  addClaudeApiProfile: (...args) => useAIModelsStore.getState().addClaudeApiProfile(...args),
  updateClaudeApiProfile: (...args) => useAIModelsStore.getState().updateClaudeApiProfile(...args),

  // deleteClaudeApiProfile keeps full implementation (cross-domain: reads projects + currentProject)
  deleteClaudeApiProfile: async (id) => {
    const projects = get().projects;
    const affectedProjects = projects.filter((p) => p.activeClaudeApiProfileId === id);

    // Delegate profile state cleanup to AI models store
    await useAIModelsStore.getState().deleteClaudeApiProfile(id);

    // Handle project cleanup (cross-domain)
    set({
      projects: projects.map((p) =>
        p.activeClaudeApiProfileId === id ? { ...p, activeClaudeApiProfileId: undefined } : p
      ),
    });

    const currentProject = get().currentProject;
    if (currentProject?.activeClaudeApiProfileId === id) {
      set({
        currentProject: { ...currentProject, activeClaudeApiProfileId: undefined },
      });
    }

    // Persist per-project changes to server
    const httpClient = getHttpApiClient();
    await Promise.all(
      affectedProjects.map((project) =>
        httpClient.settings
          .updateProject(project.path, { activeClaudeApiProfileId: '__USE_GLOBAL__' })
          .catch((error) => {
            console.error(`Failed to clear profile override for project ${project.name}:`, error);
          })
      )
    );
  },

  setActiveClaudeApiProfile: (...args) =>
    useAIModelsStore.getState().setActiveClaudeApiProfile(...args),
  setClaudeApiProfiles: (...args) => useAIModelsStore.getState().setClaudeApiProfiles(...args),

  // MCP Server actions
  addMCPServer: (server) => {
    const id = `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    set({ mcpServers: [...get().mcpServers, { ...server, id, enabled: true }] });
  },

  updateMCPServer: (id, updates) => {
    set({
      mcpServers: get().mcpServers.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    });
  },

  removeMCPServer: (id) => {
    set({ mcpServers: get().mcpServers.filter((s) => s.id !== id) });
  },

  reorderMCPServers: (oldIndex, newIndex) => {
    const servers = [...get().mcpServers];
    const [movedServer] = servers.splice(oldIndex, 1);
    servers.splice(newIndex, 0, movedServer);
    set({ mcpServers: servers });
  },

  // Project Analysis actions
  setProjectAnalysis: (analysis) => set({ projectAnalysis: analysis }),
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  clearAnalysis: () => set({ projectAnalysis: null }),

  // Agent Session actions
  setLastSelectedSession: (projectPath, sessionId) => {
    const current = get().lastSelectedSessionByProject;
    if (sessionId === null) {
      // Remove the entry for this project
      const rest = Object.fromEntries(
        Object.entries(current).filter(([key]) => key !== projectPath)
      );
      set({ lastSelectedSessionByProject: rest });
    } else {
      set({
        lastSelectedSessionByProject: {
          ...current,
          [projectPath]: sessionId,
        },
      });
    }
  },

  getLastSelectedSession: (projectPath) => {
    return get().lastSelectedSessionByProject[projectPath] || null;
  },

  // Board Background actions — forwarded to useThemeStore
  setBoardBackground: (...args) => useThemeStore.getState().setBoardBackground(...args),
  setCardOpacity: (...args) => useThemeStore.getState().setCardOpacity(...args),
  setColumnOpacity: (...args) => useThemeStore.getState().setColumnOpacity(...args),
  getBoardBackground: (...args) => useThemeStore.getState().getBoardBackground(...args),
  setColumnBorderEnabled: (...args) => useThemeStore.getState().setColumnBorderEnabled(...args),
  setCardGlassmorphism: (...args) => useThemeStore.getState().setCardGlassmorphism(...args),
  setCardBorderEnabled: (...args) => useThemeStore.getState().setCardBorderEnabled(...args),
  setCardBorderOpacity: (...args) => useThemeStore.getState().setCardBorderOpacity(...args),
  setHideScrollbar: (...args) => useThemeStore.getState().setHideScrollbar(...args),
  clearBoardBackground: (...args) => useThemeStore.getState().clearBoardBackground(...args),

  // Terminal actions — forwarded to useTerminalStore
  setTerminalUnlocked: (...args) => useTerminalStore.getState().setTerminalUnlocked(...args),
  setActiveTerminalSession: (...args) =>
    useTerminalStore.getState().setActiveTerminalSession(...args),
  toggleTerminalMaximized: (...args) =>
    useTerminalStore.getState().toggleTerminalMaximized(...args),
  addTerminalToLayout: (...args) => useTerminalStore.getState().addTerminalToLayout(...args),
  removeTerminalFromLayout: (...args) =>
    useTerminalStore.getState().removeTerminalFromLayout(...args),
  swapTerminals: (...args) => useTerminalStore.getState().swapTerminals(...args),
  clearTerminalState: () => useTerminalStore.getState().clearTerminalState(),
  setTerminalPanelFontSize: (...args) =>
    useTerminalStore.getState().setTerminalPanelFontSize(...args),
  setTerminalDefaultFontSize: (...args) =>
    useTerminalStore.getState().setTerminalDefaultFontSize(...args),
  setTerminalDefaultRunScript: (...args) =>
    useTerminalStore.getState().setTerminalDefaultRunScript(...args),
  setTerminalScreenReaderMode: (...args) =>
    useTerminalStore.getState().setTerminalScreenReaderMode(...args),
  setTerminalFontFamily: (...args) => useTerminalStore.getState().setTerminalFontFamily(...args),
  setTerminalScrollbackLines: (...args) =>
    useTerminalStore.getState().setTerminalScrollbackLines(...args),
  setTerminalLineHeight: (...args) => useTerminalStore.getState().setTerminalLineHeight(...args),
  setTerminalMaxSessions: (...args) => useTerminalStore.getState().setTerminalMaxSessions(...args),
  setTerminalLastActiveProjectPath: (...args) =>
    useTerminalStore.getState().setTerminalLastActiveProjectPath(...args),
  setOpenTerminalMode: (...args) => useTerminalStore.getState().setOpenTerminalMode(...args),
  addTerminalTab: (...args) => useTerminalStore.getState().addTerminalTab(...args),
  removeTerminalTab: (...args) => useTerminalStore.getState().removeTerminalTab(...args),
  setActiveTerminalTab: (...args) => useTerminalStore.getState().setActiveTerminalTab(...args),
  renameTerminalTab: (...args) => useTerminalStore.getState().renameTerminalTab(...args),
  reorderTerminalTabs: (...args) => useTerminalStore.getState().reorderTerminalTabs(...args),
  moveTerminalToTab: (...args) => useTerminalStore.getState().moveTerminalToTab(...args),
  addTerminalToTab: (...args) => useTerminalStore.getState().addTerminalToTab(...args),
  setTerminalTabLayout: (...args) => useTerminalStore.getState().setTerminalTabLayout(...args),
  updateTerminalPanelSizes: (...args) =>
    useTerminalStore.getState().updateTerminalPanelSizes(...args),
  saveTerminalLayout: (...args) => useTerminalStore.getState().saveTerminalLayout(...args),
  getPersistedTerminalLayout: (...args) =>
    useTerminalStore.getState().getPersistedTerminalLayout(...args),
  clearPersistedTerminalLayout: (...args) =>
    useTerminalStore.getState().clearPersistedTerminalLayout(...args),

  // Spec Creation actions
  setSpecCreatingForProject: (projectPath) => {
    set({ specCreatingForProject: projectPath });
  },

  isSpecCreatingForProject: (projectPath) => {
    return get().specCreatingForProject === projectPath;
  },

  setDefaultPlanningMode: (mode) => set({ defaultPlanningMode: mode }),
  setDefaultRequirePlanApproval: (require) => set({ defaultRequirePlanApproval: require }),
  setDefaultFeatureModel: (entry) => set({ defaultFeatureModel: entry }),

  // Plan Approval actions
  setPendingPlanApproval: (approval) => set({ pendingPlanApproval: approval }),

  // Claude/Codex Usage + Model Fetching actions — forwarded to useAIModelsStore
  setClaudeRefreshInterval: (...args) =>
    useAIModelsStore.getState().setClaudeRefreshInterval(...args),
  setClaudeUsageLastUpdated: (...args) =>
    useAIModelsStore.getState().setClaudeUsageLastUpdated(...args),
  setClaudeUsage: (...args) => useAIModelsStore.getState().setClaudeUsage(...args),
  setCodexUsage: (...args) => useAIModelsStore.getState().setCodexUsage(...args),
  fetchCodexModels: (...args) => useAIModelsStore.getState().fetchCodexModels(...args),
  setCodexModels: (...args) => useAIModelsStore.getState().setCodexModels(...args),
  fetchOpencodeModels: (...args) => useAIModelsStore.getState().fetchOpencodeModels(...args),

  // Pipeline actions
  setPipelineConfig: (projectPath, config) => {
    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: config,
      },
    });
  },

  getPipelineConfig: (projectPath) => {
    return get().pipelineConfigByProject[projectPath] || null;
  },

  addPipelineStep: (projectPath, step) => {
    const config = get().pipelineConfigByProject[projectPath] || { version: 1, steps: [] };
    const now = new Date().toISOString();
    const newStep: PipelineStep = {
      ...step,
      id: `step_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      createdAt: now,
      updatedAt: now,
    };

    const newSteps = [...config.steps, newStep].sort((a, b) => a.order - b.order);
    newSteps.forEach((s, index) => {
      s.order = index;
    });

    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: { ...config, steps: newSteps },
      },
    });

    return newStep;
  },

  updatePipelineStep: (projectPath, stepId, updates) => {
    const config = get().pipelineConfigByProject[projectPath];
    if (!config) return;

    const stepIndex = config.steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) return;

    const updatedSteps = [...config.steps];
    updatedSteps[stepIndex] = {
      ...updatedSteps[stepIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: { ...config, steps: updatedSteps },
      },
    });
  },

  deletePipelineStep: (projectPath, stepId) => {
    const config = get().pipelineConfigByProject[projectPath];
    if (!config) return;

    const newSteps = config.steps.filter((s) => s.id !== stepId);
    newSteps.forEach((s, index) => {
      s.order = index;
    });

    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: { ...config, steps: newSteps },
      },
    });
  },

  reorderPipelineSteps: (projectPath, stepIds) => {
    const config = get().pipelineConfigByProject[projectPath];
    if (!config) return;

    const stepMap = new Map(config.steps.map((s) => [s.id, s]));
    const reorderedSteps = stepIds
      .map((id, index) => {
        const step = stepMap.get(id);
        if (!step) return null;
        return { ...step, order: index, updatedAt: new Date().toISOString() };
      })
      .filter((s): s is PipelineStep => s !== null);

    set({
      pipelineConfigByProject: {
        ...get().pipelineConfigByProject,
        [projectPath]: { ...config, steps: reorderedSteps },
      },
    });
  },

  // Worktree Panel Visibility actions — forwarded to useWorktreeStore
  setWorktreePanelVisible: (...args) =>
    useWorktreeStore.getState().setWorktreePanelVisible(...args),
  getWorktreePanelVisible: (...args) =>
    useWorktreeStore.getState().getWorktreePanelVisible(...args),

  // Init Script Indicator Visibility actions — forwarded to useTerminalStore
  setShowInitScriptIndicator: (...args) =>
    useTerminalStore.getState().setShowInitScriptIndicator(...args),
  getShowInitScriptIndicator: (...args) =>
    useTerminalStore.getState().getShowInitScriptIndicator(...args),

  // Default Delete Branch actions — forwarded to useWorktreeStore
  setDefaultDeleteBranch: (...args) => useWorktreeStore.getState().setDefaultDeleteBranch(...args),
  getDefaultDeleteBranch: (...args) => useWorktreeStore.getState().getDefaultDeleteBranch(...args),

  // Auto-dismiss Init Script Indicator actions — forwarded to useTerminalStore
  setAutoDismissInitScriptIndicator: (...args) =>
    useTerminalStore.getState().setAutoDismissInitScriptIndicator(...args),
  getAutoDismissInitScriptIndicator: (...args) =>
    useTerminalStore.getState().getAutoDismissInitScriptIndicator(...args),

  // Use Worktrees Override actions — forwarded to useWorktreeStore
  setProjectUseWorktrees: (...args) => useWorktreeStore.getState().setProjectUseWorktrees(...args),
  getProjectUseWorktrees: (...args) => useWorktreeStore.getState().getProjectUseWorktrees(...args),
  getEffectiveUseWorktrees: (...args) =>
    useWorktreeStore.getState().getEffectiveUseWorktrees(...args),

  // UI State actions (previously in localStorage, now synced via API)
  setWorktreePanelCollapsed: (...args) =>
    useWorktreeStore.getState().setWorktreePanelCollapsed(...args),
  setLastProjectDir: (dir) => set({ lastProjectDir: dir }),
  setRecentFolders: (folders) => set({ recentFolders: folders }),
  addRecentFolder: (folder) => {
    const current = get().recentFolders;
    // Remove if already exists, then add to front
    const filtered = current.filter((f) => f !== folder);
    // Keep max 10 recent folders
    const updated = [folder, ...filtered].slice(0, 10);
    set({ recentFolders: updated });
  },

  // Init Script State actions — forwarded to useTerminalStore
  setInitScriptState: (...args) => useTerminalStore.getState().setInitScriptState(...args),
  appendInitScriptOutput: (...args) => useTerminalStore.getState().appendInitScriptOutput(...args),
  clearInitScriptState: (...args) => useTerminalStore.getState().clearInitScriptState(...args),
  getInitScriptState: (...args) => useTerminalStore.getState().getInitScriptState(...args),
  getInitScriptStatesForProject: (...args) =>
    useTerminalStore.getState().getInitScriptStatesForProject(...args),

  // Reset
  reset: () => set(initialState),
}));

// Sync terminal store state back to app-store for backward compatibility.
// This ensures useAppStore(s => s.terminalState) continues to work while
// consumers are being migrated to useTerminalStore directly.
useTerminalStore.subscribe((terminalState) => {
  useAppStore.setState({
    terminalState: terminalState.terminalState,
    terminalLayoutByProject: terminalState.terminalLayoutByProject,
    defaultTerminalId: terminalState.defaultTerminalId,
    initScriptState: terminalState.initScriptState,
    showInitScriptIndicatorByProject: terminalState.showInitScriptIndicatorByProject,
    autoDismissInitScriptIndicatorByProject: terminalState.autoDismissInitScriptIndicatorByProject,
  });
});

// Sync AI models store state back to app-store for backward compatibility.
// This ensures useAppStore(s => s.phaseModels) etc. continues to work while
// consumers are being migrated to useAIModelsStore directly.
useAIModelsStore.subscribe((aiModelsState) => {
  useAppStore.setState({
    enhancementModel: aiModelsState.enhancementModel,
    validationModel: aiModelsState.validationModel,
    phaseModels: aiModelsState.phaseModels,
    favoriteModels: aiModelsState.favoriteModels,
    enabledCursorModels: aiModelsState.enabledCursorModels,
    cursorDefaultModel: aiModelsState.cursorDefaultModel,
    enabledCodexModels: aiModelsState.enabledCodexModels,
    codexDefaultModel: aiModelsState.codexDefaultModel,
    codexAutoLoadAgents: aiModelsState.codexAutoLoadAgents,
    codexSandboxMode: aiModelsState.codexSandboxMode,
    codexApprovalPolicy: aiModelsState.codexApprovalPolicy,
    codexEnableWebSearch: aiModelsState.codexEnableWebSearch,
    codexEnableImages: aiModelsState.codexEnableImages,
    enabledOpencodeModels: aiModelsState.enabledOpencodeModels,
    opencodeDefaultModel: aiModelsState.opencodeDefaultModel,
    dynamicOpencodeModels: aiModelsState.dynamicOpencodeModels,
    enabledDynamicModelIds: aiModelsState.enabledDynamicModelIds,
    cachedOpencodeProviders: aiModelsState.cachedOpencodeProviders,
    opencodeModelsLoading: aiModelsState.opencodeModelsLoading,
    opencodeModelsError: aiModelsState.opencodeModelsError,
    opencodeModelsLastFetched: aiModelsState.opencodeModelsLastFetched,
    opencodeModelsLastFailedAt: aiModelsState.opencodeModelsLastFailedAt,
    disabledProviders: aiModelsState.disabledProviders,
    autoLoadClaudeMd: aiModelsState.autoLoadClaudeMd,
    skipSandboxWarning: aiModelsState.skipSandboxWarning,
    claudeCompatibleProviders: aiModelsState.claudeCompatibleProviders,
    claudeApiProfiles: aiModelsState.claudeApiProfiles,
    activeClaudeApiProfileId: aiModelsState.activeClaudeApiProfileId,
    claudeRefreshInterval: aiModelsState.claudeRefreshInterval,
    claudeUsage: aiModelsState.claudeUsage,
    claudeUsageLastUpdated: aiModelsState.claudeUsageLastUpdated,
    codexUsage: aiModelsState.codexUsage,
    codexUsageLastUpdated: aiModelsState.codexUsageLastUpdated,
    codexModels: aiModelsState.codexModels,
    codexModelsLoading: aiModelsState.codexModelsLoading,
    codexModelsError: aiModelsState.codexModelsError,
    codexModelsLastFetched: aiModelsState.codexModelsLastFetched,
    codexModelsLastFailedAt: aiModelsState.codexModelsLastFailedAt,
  });
});

// Sync worktree store state back to app-store for backward compatibility.
// This ensures useAppStore(s => s.autoModeByWorktree) etc. continues to work while
// consumers are being migrated to useWorktreeStore directly.
useWorktreeStore.subscribe((worktreeState) => {
  useAppStore.setState({
    autoModeByWorktree: worktreeState.autoModeByWorktree,
    autoModeActivityLog: worktreeState.autoModeActivityLog,
    maxConcurrency: worktreeState.maxConcurrency,
    useWorktrees: worktreeState.useWorktrees,
    currentWorktreeByProject: worktreeState.currentWorktreeByProject,
    worktreesByProject: worktreeState.worktreesByProject,
    worktreesLoadingByProject: worktreeState.worktreesLoadingByProject,
    worktreePanelVisibleByProject: worktreeState.worktreePanelVisibleByProject,
    defaultDeleteBranchByProject: worktreeState.defaultDeleteBranchByProject,
    useWorktreesByProject: worktreeState.useWorktreesByProject,
    worktreePanelCollapsed: worktreeState.worktreePanelCollapsed,
  });
});

// Sync theme store state back to app-store for backward compatibility.
// This ensures useAppStore(s => s.theme) etc. continues to work while
// consumers are being migrated to useThemeStore directly.
useThemeStore.subscribe((themeState) => {
  useAppStore.setState({
    theme: themeState.theme,
    previewTheme: themeState.previewTheme,
    fontFamilySans: themeState.fontFamilySans,
    fontFamilyMono: themeState.fontFamilyMono,
    boardBackgroundByProject: themeState.boardBackgroundByProject,
  });
});
