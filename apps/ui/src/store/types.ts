/**
 * Store types, interfaces, constants, and utility functions.
 *
 * Extracted from app-store.ts to allow lightweight imports without
 * pulling in the full Zustand store module.
 */

import { getItem } from '@/lib/storage';
import type {
  Feature as BaseFeature,
  FeatureImagePath,
  FeatureTextFilePath,
  ModelAlias,
  PlanningMode,
  ThinkingLevel,
  ModelProvider,
  FeatureStatusWithPipeline,
  PipelineConfig,
  ServerLogLevel,
} from '@protolabs-ai/types';

// Re-export types from @protolabs-ai/types for convenience
export type {
  ModelAlias,
  PlanningMode,
  ThinkingLevel,
  ModelProvider,
  ServerLogLevel,
  FeatureTextFilePath,
  FeatureImagePath,
  PipelineConfig,
};

// ---------------------------------------------------------------------------
// View & Theme
// ---------------------------------------------------------------------------

export type ViewMode =
  | 'welcome'
  | 'setup'
  | 'spec'
  | 'board'
  | 'agent'
  | 'settings'
  | 'interview'
  | 'context'
  | 'terminal'
  | 'ideation';

export type ThemeMode =
  // Special modes
  | 'system'
  // Curated themes
  | 'studio-dark'
  | 'studio-light'
  // Community presets
  | 'nord'
  | 'catppuccin'
  | 'dracula'
  | 'monokai';

// ---------------------------------------------------------------------------
// Storage keys & theme/font persistence helpers
// ---------------------------------------------------------------------------

// LocalStorage keys for persistence (fallback when server settings aren't available)
export const THEME_STORAGE_KEY = 'automaker:theme';
export const FONT_SANS_STORAGE_KEY = 'automaker:font-sans';
export const FONT_MONO_STORAGE_KEY = 'automaker:font-mono';

/**
 * Get the theme from localStorage as a fallback
 * Used before server settings are loaded (e.g., on login/setup pages)
 */
export function getStoredTheme(): ThemeMode | null {
  const stored = getItem(THEME_STORAGE_KEY);
  if (stored) return stored as ThemeMode;

  // Backwards compatibility: older versions stored theme inside the Zustand persist blob.
  // We intentionally keep reading it as a fallback so users don't get a "default theme flash"
  // on login/logged-out pages if THEME_STORAGE_KEY hasn't been written yet.
  try {
    const legacy = getItem('automaker-storage');
    if (!legacy) return null;
    const parsed = JSON.parse(legacy) as { state?: { theme?: unknown } } | { theme?: unknown };
    const theme =
      (parsed as { state?: { theme?: unknown } })?.state?.theme ??
      (parsed as { theme?: unknown })?.theme;
    if (typeof theme === 'string' && theme.length > 0) {
      return theme as ThemeMode;
    }
  } catch {
    // Ignore legacy parse errors
  }

  return null;
}

/**
 * Get fonts from localStorage as a fallback
 * Used before server settings are loaded (e.g., on login/setup pages)
 */
export function getStoredFontSans(): string | null {
  return getItem(FONT_SANS_STORAGE_KEY);
}

export function getStoredFontMono(): string | null {
  return getItem(FONT_MONO_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export type BoardViewMode = 'kanban' | 'graph';

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export interface ApiKeys {
  anthropic: string;
  google: string;
  openai: string;
}

// ---------------------------------------------------------------------------
// Keyboard Shortcuts
// ---------------------------------------------------------------------------

// Keyboard Shortcut with optional modifiers
export interface ShortcutKey {
  key: string; // The main key (e.g., "K", "N", "1")
  shift?: boolean; // Shift key modifier
  cmdCtrl?: boolean; // Cmd on Mac, Ctrl on Windows/Linux
  alt?: boolean; // Alt/Option key modifier
}

// Helper to parse shortcut string to ShortcutKey object
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
      modifier === 'commandorcontrol' ||
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

// Helper to format ShortcutKey to display string
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
  notes: string;
  docs: string;
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

  // Global overlay shortcut (Electron accelerator format, e.g. "CommandOrControl+Shift+Space")
  avaAnywhere: string;
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
  notes: 'W',
  docs: 'Cmd+D',
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

  // Global overlay shortcut
  avaAnywhere: 'CommandOrControl+Shift+Space',
};

// ---------------------------------------------------------------------------
// Attachments & Chat
// ---------------------------------------------------------------------------

export interface ImageAttachment {
  id?: string; // Optional - may not be present in messages loaded from server
  data: string; // base64 encoded image data
  mimeType: string; // e.g., "image/png", "image/jpeg"
  filename: string;
  size?: number; // file size in bytes - optional for messages from server
}

export interface TextFileAttachment {
  id: string;
  content: string; // text content of the file
  mimeType: string; // e.g., "text/plain", "text/markdown"
  filename: string;
  size: number; // file size in bytes
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

// UI-specific: base64-encoded images (not in shared types)
export interface FeatureImage {
  id: string;
  data: string; // base64 encoded
  mimeType: string;
  filename: string;
  size: number;
}

// Available models for feature execution
export type ClaudeModel = 'opus' | 'sonnet' | 'haiku';

export interface Feature extends Omit<
  BaseFeature,
  'steps' | 'imagePaths' | 'textFilePaths' | 'status' | 'planSpec'
> {
  id: string;
  title?: string;
  titleGenerating?: boolean;
  category: string;
  description: string;
  steps: string[]; // Required in UI (not optional)
  status: FeatureStatusWithPipeline;
  images?: FeatureImage[]; // UI-specific base64 images
  imagePaths?: FeatureImagePath[]; // Stricter type than base (no string | union)
  textFilePaths?: FeatureTextFilePath[]; // Text file attachments for context
  justFinishedAt?: string; // UI-specific: ISO timestamp when agent just finished
  prUrl?: string; // UI-specific: Pull request URL
  planSpec?: PlanSpec; // Explicit planSpec type to override BaseFeature's index signature
}

// Parsed task from spec (for spec and full planning modes)
export interface ParsedTask {
  id: string; // e.g., "T001"
  description: string; // e.g., "Create user model"
  filePath?: string; // e.g., "src/models/user.ts"
  phase?: string; // e.g., "Phase 1: Foundation" (for full mode)
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

// PlanSpec status for feature planning/specification
export interface PlanSpec {
  status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
  content?: string; // The actual spec/plan markdown content
  version: number;
  generatedAt?: string; // ISO timestamp
  approvedAt?: string; // ISO timestamp
  reviewedByUser: boolean; // True if user has seen the spec
  tasksCompleted?: number;
  tasksTotal?: number;
  currentTaskId?: string; // ID of the task currently being worked on
  tasks?: ParsedTask[]; // Parsed tasks from the spec
}

// ---------------------------------------------------------------------------
// Project Analysis
// ---------------------------------------------------------------------------

// File tree node for project analysis
export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  extension?: string;
  children?: FileTreeNode[];
}

// Project analysis result
export interface ProjectAnalysis {
  fileTree: FileTreeNode[];
  totalFiles: number;
  totalDirectories: number;
  filesByExtension: Record<string, number>;
  analyzedAt: string;
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

// Maximum number of output lines to keep in init script state (prevents unbounded memory growth)
export const MAX_INIT_OUTPUT_LINES = 500;

// Terminal panel layout types (recursive for splits)
export type TerminalPanelContent =
  | { type: 'terminal'; sessionId: string; size?: number; fontSize?: number; branchName?: string }
  | {
      type: 'split';
      id: string; // Stable ID for React key stability
      direction: 'horizontal' | 'vertical';
      panels: TerminalPanelContent[];
      size?: number;
    };

// Terminal tab - each tab has its own layout
export interface TerminalTab {
  id: string;
  name: string;
  layout: TerminalPanelContent | null;
}

export interface TerminalState {
  isUnlocked: boolean;
  authToken: string | null;
  tabs: TerminalTab[];
  activeTabId: string | null;
  activeSessionId: string | null;
  maximizedSessionId: string | null; // Session ID of the maximized terminal pane (null if none)
  defaultFontSize: number; // Default font size for new terminals
  defaultRunScript: string; // Script to run when a new terminal is created (e.g., "claude" to start Claude Code)
  screenReaderMode: boolean; // Enable screen reader accessibility mode
  fontFamily: string; // Font family for terminal text
  scrollbackLines: number; // Number of lines to keep in scrollback buffer
  lineHeight: number; // Line height multiplier for terminal text
  maxSessions: number; // Maximum concurrent terminal sessions (server setting)
  lastActiveProjectPath: string | null; // Last project path to detect route changes vs project switches
  openTerminalMode: 'newTab' | 'split'; // How to open terminals from "Open in Terminal" action
}

// Persisted terminal layout - now includes sessionIds for reconnection
// Used to restore terminal layout structure when switching projects
export type PersistedTerminalPanel =
  | { type: 'terminal'; size?: number; fontSize?: number; sessionId?: string; branchName?: string }
  | {
      type: 'split';
      id?: string; // Optional for backwards compatibility with older persisted layouts
      direction: 'horizontal' | 'vertical';
      panels: PersistedTerminalPanel[];
      size?: number;
    };

export interface PersistedTerminalTab {
  id: string;
  name: string;
  layout: PersistedTerminalPanel | null;
}

export interface PersistedTerminalState {
  tabs: PersistedTerminalTab[];
  activeTabIndex: number; // Use index instead of ID since IDs are regenerated
  defaultFontSize: number;
  defaultRunScript?: string; // Optional to support existing persisted data
  screenReaderMode?: boolean; // Optional to support existing persisted data
  fontFamily?: string; // Optional to support existing persisted data
  scrollbackLines?: number; // Optional to support existing persisted data
  lineHeight?: number; // Optional to support existing persisted data
}

// Persisted terminal settings - stored globally (not per-project)
export interface PersistedTerminalSettings {
  defaultFontSize: number;
  defaultRunScript: string;
  screenReaderMode: boolean;
  fontFamily: string;
  scrollbackLines: number;
  lineHeight: number;
  maxSessions: number;
  openTerminalMode: 'newTab' | 'split';
}

/** State for worktree init script execution */
export interface InitScriptState {
  status: 'idle' | 'running' | 'success' | 'failed';
  branch: string;
  output: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Claude & Codex Usage
// ---------------------------------------------------------------------------

// Claude Usage interface matching the server response
export type ClaudeUsage = {
  sessionTokensUsed: number;
  sessionLimit: number;
  sessionPercentage: number;
  sessionResetTime: string;
  sessionResetText: string;

  weeklyTokensUsed: number;
  weeklyLimit: number;
  weeklyPercentage: number;
  weeklyResetTime: string;
  weeklyResetText: string;

  sonnetWeeklyTokensUsed: number;
  sonnetWeeklyPercentage: number;
  sonnetResetText: string;

  costUsed: number | null;
  costLimit: number | null;
  costCurrency: string | null;

  lastUpdated: string;
  userTimezone: string;
};

// Response type for Claude usage API (can be success or error)
export type ClaudeUsageResponse = ClaudeUsage | { error: string; message?: string };

// Codex Usage types
export type CodexPlanType =
  | 'free'
  | 'plus'
  | 'pro'
  | 'team'
  | 'business'
  | 'enterprise'
  | 'edu'
  | 'unknown';

export interface CodexRateLimitWindow {
  limit: number;
  used: number;
  remaining: number;
  usedPercent: number; // Percentage used (0-100)
  windowDurationMins: number; // Duration in minutes
  resetsAt: number; // Unix timestamp in seconds
}

export interface CodexUsage {
  rateLimits: {
    primary?: CodexRateLimitWindow;
    secondary?: CodexRateLimitWindow;
    planType?: CodexPlanType;
  } | null;
  lastUpdated: string;
}

// Response type for Codex usage API (can be success or error)
export type CodexUsageResponse = CodexUsage | { error: string; message?: string };

/**
 * Check if Claude usage is at its limit (any of: session >= 100%, weekly >= 100%, OR cost >= limit)
 * Returns true if any limit is reached, meaning auto mode should pause feature pickup.
 */
export function isClaudeUsageAtLimit(claudeUsage: ClaudeUsage | null): boolean {
  if (!claudeUsage) {
    // No usage data available - don't block
    return false;
  }

  // Check session limit (5-hour window)
  if (claudeUsage.sessionPercentage >= 100) {
    return true;
  }

  // Check weekly limit
  if (claudeUsage.weeklyPercentage >= 100) {
    return true;
  }

  // Check cost limit (if configured)
  if (
    claudeUsage.costLimit !== null &&
    claudeUsage.costLimit > 0 &&
    claudeUsage.costUsed !== null &&
    claudeUsage.costUsed >= claudeUsage.costLimit
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Board Background
// ---------------------------------------------------------------------------

// Default background settings for board backgrounds
export const defaultBackgroundSettings: {
  imagePath: string | null;
  imageVersion?: number;
  cardOpacity: number;
  columnOpacity: number;
  columnBorderEnabled: boolean;
  cardGlassmorphism: boolean;
  cardBorderEnabled: boolean;
  cardBorderOpacity: number;
  hideScrollbar: boolean;
} = {
  imagePath: null,
  cardOpacity: 100,
  columnOpacity: 100,
  columnBorderEnabled: true,
  cardGlassmorphism: true,
  cardBorderEnabled: true,
  cardBorderOpacity: 100,
  hideScrollbar: false,
};

// ---------------------------------------------------------------------------
// Auto Mode
// ---------------------------------------------------------------------------

export interface AutoModeActivity {
  id: string;
  featureId: string;
  timestamp: Date;
  type:
    | 'start'
    | 'progress'
    | 'tool'
    | 'complete'
    | 'error'
    | 'planning'
    | 'action'
    | 'verification';
  message: string;
  tool?: string;
  passes?: boolean;
  phase?: 'planning' | 'action' | 'verification';
  errorType?: 'authentication' | 'execution';
}
