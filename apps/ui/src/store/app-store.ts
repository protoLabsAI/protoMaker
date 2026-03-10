import { create } from 'zustand';
// Note: persist middleware removed - settings now sync via API (use-settings-sync.ts)
import type { Project, TrashedProject } from '@/lib/electron';
import { getHttpApiClient, invalidateHttpClient } from '@/lib/http-api-client';
import { createLogger } from '@protolabsai/utils/logger';
import { UI_SANS_FONT_OPTIONS, UI_MONO_FONT_OPTIONS } from '@/config/ui-font-options';
import type {
  PlanningMode,
  PhaseModelEntry,
  MCPServerConfig,
  PromptCustomization,
  ServerLogLevel,
  EventHook,
  FeatureFlags,
  HivemindPeer,
} from '@protolabsai/types';
import { DEFAULT_FEATURE_FLAGS } from '@protolabsai/types';
import { DEFAULT_KEYBOARD_SHORTCUTS } from './types';
import type {
  ViewMode,
  ThemeMode,
  BoardViewMode,
  ApiKeys,
  KeyboardShortcuts,
  Feature,
  ProjectAnalysis,
} from './types';

import { useAIModelsStore } from './ai-models-store';
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
export { usePipelineStore } from './pipeline-store';

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
  bottomPanelOpen: boolean;
  bottomPanelActiveTab: string;
  mobileSidebarHidden: boolean; // Completely hides sidebar on mobile

  // Agent Session state (per-project, keyed by project path)
  lastSelectedSessionByProject: Record<string, string>; // projectPath -> sessionId

  // Features/Kanban
  features: Feature[];

  // App spec
  appSpec: string;

  // IPC status
  ipcConnected: boolean;

  // API Keys
  apiKeys: ApiKeys;

  // Kanban Card Display Settings
  boardViewMode: BoardViewMode; // Whether to show kanban or dependency graph view

  // Feature Default Settings
  defaultSkipTests: boolean; // Default value for skip tests when creating new features
  enableDependencyBlocking: boolean; // When true, show blocked badges and warnings for features with incomplete dependencies (default: true)
  skipVerificationInAutoMode: boolean; // When true, auto-mode grabs features even if dependencies are not verified (only checks they're not running)
  enableAiCommitMessages: boolean; // When true, auto-generate commit messages using AI when opening commit dialog
  systemMaxConcurrency: number; // User-configurable system-wide maximum concurrent agents (default: 10)
  planUseSelectedWorktreeBranch: boolean; // When true, Plan dialog creates features on the currently selected worktree branch
  addFeatureUseSelectedWorktreeBranch: boolean; // When true, Add Feature dialog defaults to custom mode with selected worktree branch

  // Keyboard Shortcuts
  keyboardShortcuts: KeyboardShortcuts; // User-defined keyboard shortcuts

  // Audio Settings
  muteDoneSound: boolean; // When true, mute the notification sound when agents complete (default: false)

  // Server Log Level Settings
  serverLogLevel: ServerLogLevel; // Log level for the API server (error, warn, info, debug)
  enableRequestLogging: boolean; // Enable HTTP request logging (Morgan)

  // Feature Flags — toggle in-development UI features per-installation
  featureFlags: FeatureFlags;

  // MCP Servers
  mcpServers: MCPServerConfig[]; // List of configured MCP servers for agent use

  // Editor Configuration
  defaultEditorCommand: string | null; // Default editor for "Open In" action

  // File Editor (in-app code editor) settings
  fileEditorFontFamily: string; // Monospace font family for the built-in code editor
  fileEditorFontSize: number; // Font size (px) for the built-in code editor
  editorAutoSave: boolean; // Whether auto-save is enabled (default true)
  editorAutoSaveDelay: number; // Auto-save debounce delay in ms (default 1000)

  // Skills Configuration
  enableSkills: boolean; // Enable Skills functionality (loads from .claude/skills/ directories)
  skillsSources: Array<'user' | 'project'>; // Which directories to load Skills from

  // Subagents Configuration
  enableSubagents: boolean; // Enable Custom Subagents functionality (loads from .claude/agents/ directories)
  subagentsSources: Array<'user' | 'project'>; // Which directories to load Subagents from

  // Prompt Customization
  promptCustomization: PromptCustomization; // Custom prompts for Auto Mode, Agent, Backlog Plan, Enhancement

  // Browser Notifications
  browserNotificationsEnabled: boolean; // When true, show browser notifications for new actionable items (default: false)

  // Event Hooks
  eventHooks: EventHook[]; // Event hooks for custom commands or webhooks

  // Project Analysis
  projectAnalysis: ProjectAnalysis | null;
  isAnalyzing: boolean;

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

  // UI State
  /** Last directory opened in file picker */
  lastProjectDir: string;
  /** Recently accessed folders for quick access */
  recentFolders: string[];

  // User Identity (for board assignment)
  userIdentity: string | null;

  // Hivemind / Cross-instance dashboard
  peers: HivemindPeer[];
  instanceFilter: 'all' | 'mine'; // 'all' = show features from all instances, 'mine' = local only
  selfInstanceId: string | null; // The instanceId of this Automaker instance

  // Server URL runtime override
  serverUrlOverride: string | null; // Runtime server URL override (null = use env var / default)
  recentServerUrls: string[]; // Recently used server URLs, max 10, persisted in localStorage

  // Server connection state
  serverStatus: 'connected' | 'disconnected' | 'connecting'; // Current connection status
  serverInfo: { version: string; status: string; timestamp: string } | null; // Info from /api/health
  recentConnections: Array<{ url: string; lastConnected: string }>; // Recent connections with timestamps

  // Connected instance identity
  instanceName: string | null; // Human-readable name of the connected instance (e.g. 'Dev Server', 'Staging')
  instanceRole: string | null; // Role of the connected instance (e.g. 'primary', 'worker')
}

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
  toggleBottomPanel: () => void;
  toggleMobileSidebarHidden: () => void;
  setMobileSidebarHidden: (hidden: boolean) => void;

  // Theme actions (cross-domain: project theme in app-store, global theme in theme-store)
  setProjectTheme: (projectId: string, theme: ThemeMode | null) => void;
  getEffectiveTheme: () => ThemeMode;

  // Font actions (cross-domain: project font overrides in app-store, global fonts in theme-store)
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
    phase: import('@protolabsai/types').PhaseModelKey,
    entry: import('@protolabsai/types').PhaseModelEntry | null // null = use global
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

  // Kanban Card Settings actions
  setBoardViewMode: (mode: BoardViewMode) => void;

  // Feature Default Settings actions
  setDefaultSkipTests: (skip: boolean) => void;
  setEnableDependencyBlocking: (enabled: boolean) => void;
  setSkipVerificationInAutoMode: (enabled: boolean) => Promise<void>;
  setEnableAiCommitMessages: (enabled: boolean) => Promise<void>;
  setSystemMaxConcurrency: (max: number) => void;
  setPlanUseSelectedWorktreeBranch: (enabled: boolean) => Promise<void>;
  setAddFeatureUseSelectedWorktreeBranch: (enabled: boolean) => Promise<void>;

  // Keyboard Shortcuts actions
  setKeyboardShortcut: (key: keyof KeyboardShortcuts, value: string) => void;
  setKeyboardShortcuts: (shortcuts: Partial<KeyboardShortcuts>) => void;
  resetKeyboardShortcuts: () => void;

  // Audio Settings actions
  setMuteDoneSound: (muted: boolean) => void;

  // Server Log Level actions
  setServerLogLevel: (level: ServerLogLevel) => void;
  setEnableRequestLogging: (enabled: boolean) => void;

  // Feature Flag actions
  setFeatureFlags: (flags: Partial<FeatureFlags>) => void;

  // Editor Configuration actions
  setDefaultEditorCommand: (command: string | null) => void;

  // File Editor font settings
  setFileEditorFontFamily: (fontFamily: string) => void;
  setFileEditorFontSize: (fontSize: number) => void;
  setEditorAutoSave: (enabled: boolean) => void;
  setEditorAutoSaveDelay: (delay: number) => void;

  // Prompt Customization actions
  setPromptCustomization: (customization: PromptCustomization) => Promise<void>;

  // Browser Notification actions
  setBrowserNotificationsEnabled: (enabled: boolean) => void;

  // Event Hook actions
  setEventHooks: (hooks: EventHook[]) => void;

  // Claude API Profile cross-domain cleanup (reads projects + delegates to AI models store)
  deleteClaudeApiProfile: (id: string) => Promise<void>;

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

  // UI State actions
  setLastProjectDir: (dir: string) => void;
  setRecentFolders: (folders: string[]) => void;
  addRecentFolder: (folder: string) => void;

  // User Identity actions
  setUserIdentity: (identity: string | null) => void;

  // Hivemind / Cross-instance dashboard actions
  setPeers: (peers: HivemindPeer[]) => void;
  setInstanceFilter: (filter: 'all' | 'mine') => void;
  fetchPeers: () => Promise<void>;
  setSelfInstanceId: (id: string | null) => void;
  fetchSelfInstanceId: () => Promise<void>;

  // Server URL runtime override actions
  setServerUrlOverride: (url: string | null) => void;
  addRecentServerUrl: (url: string) => void; // Adds to recentServerUrls (max 10, deduplicated)

  // Server connection actions
  connectToServer: (url: string) => Promise<void>;
  removeRecentConnection: (url: string) => void;
  setInstanceName: (name: string | null) => void;
  fetchInstanceInfo: () => Promise<void>;

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
  bottomPanelOpen: false,
  bottomPanelActiveTab: 'activity', // Deprecated — kept for persisted state compat
  mobileSidebarHidden: false, // Sidebar visible by default on mobile
  lastSelectedSessionByProject: {},
  features: [],
  appSpec: '',
  ipcConnected: false,
  apiKeys: {
    anthropic: '',
    google: '',
    openai: '',
  },
  boardViewMode: 'kanban', // Default to kanban view
  defaultSkipTests: true, // Default to manual verification (tests disabled)
  enableDependencyBlocking: true, // Default to enabled (show dependency blocking UI)
  skipVerificationInAutoMode: false, // Default to disabled (require dependencies to be verified)
  enableAiCommitMessages: true, // Default to enabled (auto-generate commit messages)
  systemMaxConcurrency: 10, // Default to 10 concurrent agents (user-configurable)
  planUseSelectedWorktreeBranch: true, // Default to enabled (Plan creates features on selected worktree branch)
  addFeatureUseSelectedWorktreeBranch: false, // Default to disabled (Add Feature uses normal defaults)
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS, // Default keyboard shortcuts
  muteDoneSound: false, // Default to sound enabled (not muted)
  serverLogLevel: 'info', // Default to info level for server logs
  enableRequestLogging: true, // Default to enabled for HTTP request logging
  featureFlags: DEFAULT_FEATURE_FLAGS, // All flags on in development by default
  mcpServers: [], // No MCP servers configured by default
  defaultEditorCommand: null, // Auto-detect: Cursor > VS Code > first available
  fileEditorFontFamily: (() => {
    try {
      return localStorage.getItem('file-editor:fontFamily') ?? '';
    } catch {
      return '';
    }
  })(),
  fileEditorFontSize: (() => {
    try {
      const stored = localStorage.getItem('file-editor:fontSize');
      return stored ? parseInt(stored, 10) : 14;
    } catch {
      return 14;
    }
  })(),
  editorAutoSave: true, // Auto-save enabled by default
  editorAutoSaveDelay: 1000, // 1 second debounce
  enableSkills: true, // Skills enabled by default
  skillsSources: ['user', 'project'] as Array<'user' | 'project'>, // Load from both sources by default
  enableSubagents: true, // Subagents enabled by default
  subagentsSources: ['user', 'project'] as Array<'user' | 'project'>, // Load from both sources by default
  promptCustomization: {}, // Empty by default - all prompts use built-in defaults
  browserNotificationsEnabled: false, // Default to disabled (opt-in)
  eventHooks: [], // No event hooks configured by default
  projectAnalysis: null,
  isAnalyzing: false,
  specCreatingForProject: null,
  defaultPlanningMode: 'skip' as PlanningMode,
  defaultRequirePlanApproval: false,
  defaultFeatureModel: { model: 'opus' } as PhaseModelEntry,
  pendingPlanApproval: null,
  // UI State (previously in localStorage, now synced via API)
  lastProjectDir: '',
  recentFolders: [],
  userIdentity: null,
  // Hivemind / Cross-instance dashboard
  peers: [],
  instanceFilter: 'all',
  selfInstanceId: null,
  // Server URL runtime override
  serverUrlOverride: (() => {
    try {
      return localStorage.getItem('automaker:serverUrlOverride') ?? null;
    } catch {
      return null;
    }
  })(),
  recentServerUrls: (() => {
    try {
      const stored = localStorage.getItem('automaker:recentServerUrls');
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  })(),
  // Server connection state
  serverStatus: 'disconnected' as 'connected' | 'disconnected' | 'connecting',
  serverInfo: null,
  recentConnections: (() => {
    try {
      const stored = localStorage.getItem('automaker:recentConnections');
      return stored ? (JSON.parse(stored) as Array<{ url: string; lastConnected: string }>) : [];
    } catch {
      return [];
    }
  })(),
  // Connected instance identity
  instanceName: null,
  instanceRole: null,
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

    persistEffectiveThemeForProject(nextCurrentProject, useThemeStore.getState().theme);
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
      persistEffectiveThemeForProject(samePathProject, useThemeStore.getState().theme);
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
    persistEffectiveThemeForProject(restoredProject, useThemeStore.getState().theme);
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
    persistEffectiveThemeForProject(project, useThemeStore.getState().theme);
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
    const { projects, trashedProjects } = get();
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
      persistEffectiveThemeForProject(targetProject, useThemeStore.getState().theme);
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
      persistEffectiveThemeForProject(targetProject, useThemeStore.getState().theme);
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
  toggleBottomPanel: () => set({ bottomPanelOpen: !get().bottomPanelOpen }),
  toggleMobileSidebarHidden: () => set({ mobileSidebarHidden: !get().mobileSidebarHidden }),
  setMobileSidebarHidden: (hidden) => set({ mobileSidebarHidden: hidden }),

  // Theme actions (cross-domain: project theme lives in app-store, global theme in theme-store)
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
      persistEffectiveThemeForProject(
        { ...currentProject, theme: updatedTheme },
        useThemeStore.getState().theme
      );
    }
  },

  getEffectiveTheme: () => {
    // If preview theme is set, use it (for hover preview)
    const previewTheme = useThemeStore.getState().previewTheme;
    if (previewTheme) {
      return previewTheme as ThemeMode;
    }
    const currentProject = get().currentProject;
    // If current project has a theme set, use it
    if (currentProject?.theme) {
      return currentProject.theme as ThemeMode;
    }
    // Otherwise fall back to global theme from theme-store
    return useThemeStore.getState().theme;
  },

  // Font actions (cross-domain: project font overrides live in app-store, global fonts in theme-store)
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
    const currentProject = get().currentProject;
    const fontFamilySans = useThemeStore.getState().fontFamilySans;
    return getEffectiveFont(currentProject?.fontFamilySans, fontFamilySans, UI_SANS_FONT_OPTIONS);
  },

  getEffectiveFontMono: () => {
    const currentProject = get().currentProject;
    const fontFamilyMono = useThemeStore.getState().fontFamilyMono;
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

  // Kanban Card Settings actions
  setBoardViewMode: (mode) => set({ boardViewMode: mode }),

  // Feature Default Settings actions
  setDefaultSkipTests: (skip) => set({ defaultSkipTests: skip }),
  setEnableDependencyBlocking: (enabled) => set({ enableDependencyBlocking: enabled }),
  setSystemMaxConcurrency: (max) => set({ systemMaxConcurrency: max }),
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

  // Keyboard Shortcuts actions
  setKeyboardShortcut: (key, value) => {
    set({
      keyboardShortcuts: {
        ...get().keyboardShortcuts,
        [key]: value,
      },
    });
    // When avaAnywhere changes, re-register the global Electron shortcut.
    // Convert app format (Cmd+Shift+X) to Electron accelerator format.
    if (key === 'avaAnywhere' && typeof window !== 'undefined') {
      const accelerator = value
        .replace(/\bCmd\b/g, 'CommandOrControl')
        .replace(/\bCtrl\b/g, 'CommandOrControl')
        .replace(/\bOpt\b/g, 'Alt');
      (
        window as Window & {
          electronAPI?: { setOverlayShortcut?: (acc: string) => Promise<boolean> };
        }
      ).electronAPI?.setOverlayShortcut?.(accelerator);
    }
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

  // Feature Flag actions
  setFeatureFlags: (flags) =>
    set((state) => ({ featureFlags: { ...state.featureFlags, ...flags } })),

  // Editor Configuration actions
  setDefaultEditorCommand: (command) => set({ defaultEditorCommand: command }),

  // File Editor font settings
  setFileEditorFontFamily: (fontFamily) => {
    try {
      localStorage.setItem('file-editor:fontFamily', fontFamily);
    } catch {
      // ignore storage errors
    }
    set({ fileEditorFontFamily: fontFamily });
  },
  setFileEditorFontSize: (fontSize) => {
    try {
      localStorage.setItem('file-editor:fontSize', String(fontSize));
    } catch {
      // ignore storage errors
    }
    set({ fileEditorFontSize: fontSize });
  },
  setEditorAutoSave: (enabled) => set({ editorAutoSave: enabled }),
  setEditorAutoSaveDelay: (delay) => set({ editorAutoSaveDelay: delay }),

  // Prompt Customization actions
  setPromptCustomization: async (customization) => {
    set({ promptCustomization: customization });
    // Sync to server settings file
    const { syncSettingsToServer } = await import('@/hooks/use-settings-migration');
    await syncSettingsToServer();
  },

  // Browser Notification actions
  setBrowserNotificationsEnabled: (enabled) => set({ browserNotificationsEnabled: enabled }),

  // Event Hook actions
  setEventHooks: (hooks) => set({ eventHooks: hooks }),

  // deleteClaudeApiProfile: cross-domain cleanup (reads projects + delegates to AI models store)
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

  // User Identity actions
  setUserIdentity: (identity) => set({ userIdentity: identity }),

  // Hivemind / Cross-instance dashboard actions
  setPeers: (peers) => set({ peers }),
  setInstanceFilter: (instanceFilter) => set({ instanceFilter }),
  fetchPeers: async () => {
    try {
      const api = getHttpApiClient();
      const data = await api.hivemind.getPeers();
      set({ peers: data.peers });
    } catch (err) {
      logger.warn('[AppStore] Failed to fetch hivemind peers:', err);
    }
  },
  setSelfInstanceId: (selfInstanceId) => set({ selfInstanceId }),
  fetchSelfInstanceId: async () => {
    try {
      const api = getHttpApiClient();
      const data = await api.hivemind.getSelf();
      const selfId = data.instanceId;
      // Try to find a human-readable name via hivemind status (self shows up in onlinePeers)
      let displayName: string | null = null;
      try {
        const status = await api.hivemind.getStatus();
        const selfPeer = status.onlinePeers.find((p) => p.identity.instanceId === selfId);
        displayName = selfPeer?.identity.name ?? null;
      } catch {
        // Status endpoint may fail — fall back to instanceId
      }
      set({ selfInstanceId: selfId, instanceName: displayName ?? selfId });
    } catch (err) {
      logger.warn('[AppStore] Failed to fetch self instanceId:', err);
    }
  },

  // Server URL runtime override actions
  setServerUrlOverride: (url) => {
    // Persist override to localStorage
    try {
      if (url) {
        localStorage.setItem('automaker:serverUrlOverride', url);
      } else {
        localStorage.removeItem('automaker:serverUrlOverride');
      }
    } catch {
      // localStorage might be disabled
    }

    // Update recent URLs (deduplicated, max 10)
    let recentServerUrls = get().recentServerUrls;
    if (url) {
      recentServerUrls = [url, ...recentServerUrls.filter((u) => u !== url)].slice(0, 10);
      try {
        localStorage.setItem('automaker:recentServerUrls', JSON.stringify(recentServerUrls));
      } catch {
        // localStorage might be disabled
      }
    }

    set({ serverUrlOverride: url, recentServerUrls });

    // Invalidate cached HTTP client and trigger WebSocket reconnection
    invalidateHttpClient();
  },

  addRecentServerUrl: (url) => {
    const recentServerUrls = [url, ...get().recentServerUrls.filter((u) => u !== url)].slice(0, 10);
    try {
      localStorage.setItem('automaker:recentServerUrls', JSON.stringify(recentServerUrls));
    } catch {
      // localStorage might be disabled
    }
    set({ recentServerUrls });
  },

  // Server connection actions
  connectToServer: async (url) => {
    set({ serverStatus: 'connecting', serverInfo: null, instanceName: null, instanceRole: null });
    try {
      const response = await fetch(`${url}/api/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        set({ serverStatus: 'disconnected' });
        return;
      }
      const data = (await response.json()) as {
        version?: string;
        status?: string;
        timestamp?: string;
      };
      const serverInfo = {
        version: data.version ?? 'unknown',
        status: data.status ?? 'ok',
        timestamp: data.timestamp ?? new Date().toISOString(),
      };

      // Update recent connections (deduplicated, max 10)
      const lastConnected = new Date().toISOString();
      const existing = get().recentConnections.filter((c) => c.url !== url);
      const recentConnections = [{ url, lastConnected }, ...existing].slice(0, 10);
      try {
        localStorage.setItem('automaker:recentConnections', JSON.stringify(recentConnections));
      } catch {
        // localStorage might be disabled
      }

      set({ serverStatus: 'connected', serverInfo, recentConnections });

      // Apply the URL override so all subsequent API calls use the new server
      get().setServerUrlOverride(url);
    } catch {
      set({ serverStatus: 'disconnected' });
    }
  },

  removeRecentConnection: (url) => {
    const recentConnections = get().recentConnections.filter((c) => c.url !== url);
    try {
      localStorage.setItem('automaker:recentConnections', JSON.stringify(recentConnections));
    } catch {
      // localStorage might be disabled
    }
    // Also remove from legacy recentServerUrls list for consistency
    const recentServerUrls = get().recentServerUrls.filter((u) => u !== url);
    try {
      localStorage.setItem('automaker:recentServerUrls', JSON.stringify(recentServerUrls));
    } catch {
      // localStorage might be disabled
    }
    set({ recentConnections, recentServerUrls });
  },

  setInstanceName: (name) => set({ instanceName: name }),

  fetchInstanceInfo: async () => {
    try {
      const api = getHttpApiClient();
      // Fetch self instanceId
      const selfData = await api.hivemind.getSelf();
      const selfId = selfData.instanceId;
      // Fetch hivemind status to get role and display name
      let displayName: string | null = null;
      let instanceRole: string | null = null;
      try {
        const status = await api.hivemind.getStatus();
        instanceRole = status.role ?? null;
        const selfPeer = status.onlinePeers.find((p) => p.identity.instanceId === selfId);
        displayName = selfPeer?.identity.name ?? null;
      } catch {
        // Status endpoint may fail — fall back gracefully
      }
      set({ selfInstanceId: selfId, instanceName: displayName ?? selfId, instanceRole });
    } catch (err) {
      logger.warn('[AppStore] Failed to fetch instance info:', err);
    }
  },

  // Reset
  reset: () => set(initialState),
}));
