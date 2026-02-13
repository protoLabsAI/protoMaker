/**
 * Settings Store - State management for application settings and preferences
 * Contains non-model-related settings extracted from app-store
 */

import { create } from 'zustand';
import type {
  MCPServerConfig,
  PromptCustomization,
  EventHook,
  ServerLogLevel,
} from '@automaker/types';

// ============================================================================
// Types
// ============================================================================

// Parsed shortcut key structure
export interface ShortcutKey {
  key: string; // The main key (e.g., "K", "N", "1")
  shift?: boolean; // Shift key modifier
  cmdCtrl?: boolean; // Cmd on Mac, Ctrl on Windows/Linux
  alt?: boolean; // Alt/Option key modifier
}

/**
 * Parse a shortcut string (e.g., "Cmd+K", "Shift+N") into its components
 */
export function parseShortcut(shortcut: string | undefined | null): ShortcutKey {
  if (!shortcut) return { key: '' };
  const parts = shortcut.split('+').map((p) => p.trim());
  const result: ShortcutKey = { key: parts[parts.length - 1] };

  // Normalize common OS-specific modifiers (Cmd/Ctrl/Win/Super symbols) into cmdCtrl
  for (let i = 0; i < parts.length - 1; i++) {
    const modifier = parts[i].toLowerCase();
    if (modifier === 'shift') result.shift = true;
    else if (
      modifier === 'cmd' ||
      modifier === 'ctrl' ||
      modifier === 'win' ||
      modifier === 'super' ||
      modifier === '⌘' ||
      modifier === '^' ||
      modifier === '⊞' ||
      modifier === '◆'
    )
      result.cmdCtrl = true;
    else if (modifier === 'alt' || modifier === 'opt' || modifier === 'option' || modifier === '⌥')
      result.alt = true;
  }

  return result;
}

/**
 * Format a shortcut string for display (e.g., "⌘ K" on Mac, "Win+K" on Windows)
 */
export function formatShortcut(shortcut: string | undefined | null, forDisplay = false): string {
  if (!shortcut) return '';
  const parsed = parseShortcut(shortcut);
  const parts: string[] = [];

  // Prefer User-Agent Client Hints when available; fall back to legacy
  const platform: 'darwin' | 'win32' | 'linux' = (() => {
    if (typeof navigator === 'undefined') return 'linux';

    const uaPlatform = (
      navigator as Navigator & { userAgentData?: { platform?: string } }
    ).userAgentData?.platform?.toLowerCase?.();
    const legacyPlatform = navigator.platform?.toLowerCase?.();
    const platformString = uaPlatform || legacyPlatform || '';

    if (platformString.includes('mac')) return 'darwin';
    if (platformString.includes('win')) return 'win32';
    return 'linux';
  })();

  // Primary modifier - OS-specific
  if (parsed.cmdCtrl) {
    if (forDisplay) {
      parts.push(platform === 'darwin' ? '⌘' : platform === 'win32' ? '⊞' : '◆');
    } else {
      parts.push(platform === 'darwin' ? 'Cmd' : platform === 'win32' ? 'Win' : 'Super');
    }
  }

  // Alt/Option
  if (parsed.alt) {
    parts.push(
      forDisplay ? (platform === 'darwin' ? '⌥' : 'Alt') : platform === 'darwin' ? 'Opt' : 'Alt'
    );
  }

  // Shift
  if (parsed.shift) {
    parts.push(forDisplay ? '⇧' : 'Shift');
  }

  parts.push(parsed.key.toUpperCase());

  // Add spacing when displaying symbols
  return parts.join(forDisplay ? ' ' : '+');
}

// Keyboard Shortcuts - stored as strings like "K", "Shift+N", "Cmd+K"
export interface KeyboardShortcuts {
  // Navigation shortcuts
  board: string;
  graph: string;
  agent: string;
  spec: string;
  context: string;
  memory: string;
  settings: string;
  projectSettings: string;
  terminal: string;
  ideation: string;
  notifications: string;
  githubIssues: string;
  githubPrs: string;

  // UI shortcuts
  toggleSidebar: string;

  // Action shortcuts
  addFeature: string;
  addContextFile: string;
  startNext: string;
  newSession: string;
  openProject: string;
  projectPicker: string;
  cyclePrevProject: string;
  cycleNextProject: string;

  // Terminal shortcuts
  splitTerminalRight: string;
  splitTerminalDown: string;
  closeTerminal: string;
  newTerminalTab: string;
}

// Default keyboard shortcuts
export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcuts = {
  // Navigation
  board: 'K',
  graph: 'H',
  agent: 'A',
  spec: 'D',
  context: 'C',
  memory: 'Y',
  settings: 'S',
  projectSettings: 'Shift+S',
  terminal: 'T',
  ideation: 'I',
  notifications: 'X',
  githubIssues: 'G',
  githubPrs: 'R',

  // UI
  toggleSidebar: '`',

  // Actions
  // Note: Some shortcuts share the same key (e.g., "N" for addFeature, newSession)
  // This is intentional as they are context-specific and only active in their respective views
  addFeature: 'N', // Only active in board view
  addContextFile: 'N', // Only active in context view
  startNext: 'G', // Only active in board view
  newSession: 'N', // Only active in agent view
  openProject: 'O', // Global shortcut
  projectPicker: 'P', // Global shortcut
  cyclePrevProject: 'Q', // Global shortcut
  cycleNextProject: 'E', // Global shortcut

  // Terminal shortcuts (only active in terminal view)
  // Using Alt modifier to avoid conflicts with both terminal signals AND browser shortcuts
  splitTerminalRight: 'Alt+D',
  splitTerminalDown: 'Alt+S',
  closeTerminal: 'Alt+W',
  newTerminalTab: 'Alt+T',
};

// ============================================================================
// State Interface
// ============================================================================

export interface SettingsState {
  // Keyboard Shortcuts
  keyboardShortcuts: KeyboardShortcuts;

  // Audio Settings
  muteDoneSound: boolean;

  // Server Log Level Settings
  serverLogLevel: ServerLogLevel;
  enableRequestLogging: boolean;

  // MCP Servers
  mcpServers: MCPServerConfig[];

  // Editor Configuration
  defaultEditorCommand: string | null;

  // Terminal Configuration
  defaultTerminalId: string | null;

  // Skills Configuration
  enableSkills: boolean;
  skillsSources: Array<'user' | 'project'>;

  // Subagents Configuration
  enableSubagents: boolean;
  subagentsSources: Array<'user' | 'project'>;

  // Prompt Customization
  promptCustomization: PromptCustomization;

  // Event Hooks
  eventHooks: EventHook[];

  // Claude SDK Settings
  autoLoadClaudeMd: boolean;
  skipSandboxWarning: boolean;

  // Feature Defaults
  defaultSkipTests: boolean;
  enableDependencyBlocking: boolean;
  skipVerificationInAutoMode: boolean;
  enableAiCommitMessages: boolean;
  planUseSelectedWorktreeBranch: boolean;
  addFeatureUseSelectedWorktreeBranch: boolean;
}

// ============================================================================
// Actions Interface
// ============================================================================

interface SettingsActions {
  // Keyboard Shortcuts actions
  setKeyboardShortcut: (key: keyof KeyboardShortcuts, value: string) => void;
  setKeyboardShortcuts: (shortcuts: Partial<KeyboardShortcuts>) => void;
  resetKeyboardShortcuts: () => void;

  // Audio Settings actions
  setMuteDoneSound: (muted: boolean) => void;

  // Server Log Level actions
  setServerLogLevel: (level: ServerLogLevel) => void;
  setEnableRequestLogging: (enabled: boolean) => void;

  // MCP Servers actions
  setMcpServers: (servers: MCPServerConfig[]) => void;
  addMcpServer: (server: MCPServerConfig) => void;
  removeMcpServer: (serverId: string) => void;
  updateMcpServer: (serverId: string, server: Partial<MCPServerConfig>) => void;

  // Editor Configuration actions
  setDefaultEditorCommand: (command: string | null) => void;

  // Terminal Configuration actions
  setDefaultTerminalId: (terminalId: string | null) => void;

  // Skills Configuration actions
  setEnableSkills: (enabled: boolean) => void;
  setSkillsSources: (sources: Array<'user' | 'project'>) => void;

  // Subagents Configuration actions
  setEnableSubagents: (enabled: boolean) => void;
  setSubagentsSources: (sources: Array<'user' | 'project'>) => void;

  // Prompt Customization actions
  setPromptCustomization: (customization: PromptCustomization) => void;

  // Event Hooks actions
  setEventHooks: (hooks: EventHook[]) => void;
  addEventHook: (hook: EventHook) => void;
  removeEventHook: (hookId: string) => void;
  updateEventHook: (hookId: string, hook: Partial<EventHook>) => void;

  // Claude SDK Settings actions
  setAutoLoadClaudeMd: (enabled: boolean) => void;
  setSkipSandboxWarning: (skip: boolean) => void;

  // Feature Defaults actions
  setDefaultSkipTests: (skip: boolean) => void;
  setEnableDependencyBlocking: (enabled: boolean) => void;
  setSkipVerificationInAutoMode: (skip: boolean) => void;
  setEnableAiCommitMessages: (enabled: boolean) => void;
  setPlanUseSelectedWorktreeBranch: (use: boolean) => void;
  setAddFeatureUseSelectedWorktreeBranch: (use: boolean) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: SettingsState = {
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
  muteDoneSound: false,
  serverLogLevel: 'info',
  enableRequestLogging: true,
  mcpServers: [],
  defaultEditorCommand: null,
  defaultTerminalId: null,
  enableSkills: true,
  skillsSources: ['user', 'project'],
  enableSubagents: true,
  subagentsSources: ['user', 'project'],
  promptCustomization: {},
  eventHooks: [],
  autoLoadClaudeMd: false,
  skipSandboxWarning: false,
  defaultSkipTests: true,
  enableDependencyBlocking: true,
  skipVerificationInAutoMode: false,
  enableAiCommitMessages: true,
  planUseSelectedWorktreeBranch: true,
  addFeatureUseSelectedWorktreeBranch: false,
};

// ============================================================================
// Store
// ============================================================================

export const useSettingsStore = create<SettingsState & SettingsActions>((set, get) => ({
  ...initialState,

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
  setMuteDoneSound: (muted) => {
    set({ muteDoneSound: muted });
  },

  // Server Log Level actions
  setServerLogLevel: (level) => {
    set({ serverLogLevel: level });
  },

  setEnableRequestLogging: (enabled) => {
    set({ enableRequestLogging: enabled });
  },

  // MCP Servers actions
  setMcpServers: (servers) => {
    set({ mcpServers: servers });
  },

  addMcpServer: (server) => {
    set({
      mcpServers: [...get().mcpServers, server],
    });
  },

  removeMcpServer: (serverId) => {
    set({
      mcpServers: get().mcpServers.filter((server) => server.id !== serverId),
    });
  },

  updateMcpServer: (serverId, server) => {
    set({
      mcpServers: get().mcpServers.map((s) => (s.id === serverId ? { ...s, ...server } : s)),
    });
  },

  // Editor Configuration actions
  setDefaultEditorCommand: (command) => {
    set({ defaultEditorCommand: command });
  },

  // Terminal Configuration actions
  setDefaultTerminalId: (terminalId) => {
    set({ defaultTerminalId: terminalId });
  },

  // Skills Configuration actions
  setEnableSkills: (enabled) => {
    set({ enableSkills: enabled });
  },

  setSkillsSources: (sources) => {
    set({ skillsSources: sources });
  },

  // Subagents Configuration actions
  setEnableSubagents: (enabled) => {
    set({ enableSubagents: enabled });
  },

  setSubagentsSources: (sources) => {
    set({ subagentsSources: sources });
  },

  // Prompt Customization actions
  setPromptCustomization: (customization) => {
    set({ promptCustomization: customization });
  },

  // Event Hooks actions
  setEventHooks: (hooks) => {
    set({ eventHooks: hooks });
  },

  addEventHook: (hook) => {
    set({
      eventHooks: [...get().eventHooks, hook],
    });
  },

  removeEventHook: (hookId) => {
    set({
      eventHooks: get().eventHooks.filter((hook) => hook.id !== hookId),
    });
  },

  updateEventHook: (hookId, hook) => {
    set({
      eventHooks: get().eventHooks.map((h) => (h.id === hookId ? { ...h, ...hook } : h)),
    });
  },

  // Claude SDK Settings actions
  setAutoLoadClaudeMd: (enabled) => {
    set({ autoLoadClaudeMd: enabled });
  },

  setSkipSandboxWarning: (skip) => {
    set({ skipSandboxWarning: skip });
  },

  // Feature Defaults actions
  setDefaultSkipTests: (skip) => {
    set({ defaultSkipTests: skip });
  },

  setEnableDependencyBlocking: (enabled) => {
    set({ enableDependencyBlocking: enabled });
  },

  setSkipVerificationInAutoMode: (skip) => {
    set({ skipVerificationInAutoMode: skip });
  },

  setEnableAiCommitMessages: (enabled) => {
    set({ enableAiCommitMessages: enabled });
  },

  setPlanUseSelectedWorktreeBranch: (use) => {
    set({ planUseSelectedWorktreeBranch: use });
  },

  setAddFeatureUseSelectedWorktreeBranch: (use) => {
    set({ addFeatureUseSelectedWorktreeBranch: use });
  },
}));
