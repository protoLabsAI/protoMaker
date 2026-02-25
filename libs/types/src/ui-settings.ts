/**
 * UI Settings - Visual and interface configuration types
 *
 * Covers themes, fonts, keyboard shortcuts, window state, board appearance,
 * and other UI-related preferences.
 */

// ============================================================================
// Theme Configuration
// ============================================================================

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

// ============================================================================
// Window State
// ============================================================================

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

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

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

// ============================================================================
// Board Appearance
// ============================================================================

// ============================================================================
// Voice Activation Settings - Offline wake word + speech-to-text
// ============================================================================

/** WhisperModelSize - Available whisper.cpp GGML model sizes */
export type WhisperModelSize = 'tiny' | 'base' | 'small';

/**
 * VoiceSettings - Configuration for offline voice activation
 *
 * Uses Silero VAD for speech detection in the renderer and whisper.cpp
 * for local transcription on the server. Fully offline, no paid services.
 */
export interface VoiceSettings {
  /** Whether voice activation is enabled (default: false) */
  enabled: boolean;
  /** Wake word to trigger command mode (default: 'ava') */
  wakeWord: string;
  /** Whisper model size for transcription (default: 'tiny') */
  modelSize: WhisperModelSize;
  /** VAD sensitivity threshold 0.0-1.0 (default: 0.5) */
  sensitivity: number;
  /** Microphone device ID, empty string = system default */
  inputDevice: string;
}

/**
 * Default voice settings - disabled by default
 */
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  wakeWord: 'ava',
  modelSize: 'tiny',
  sensitivity: 0.5,
  inputDevice: '',
};

// ============================================================================
// Board Appearance
// ============================================================================

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
