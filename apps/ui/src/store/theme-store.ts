import { create } from 'zustand';
import { setItem } from '@/lib/storage';
import { DEFAULT_FONT_VALUE } from '@/config/ui-font-options';
import type { ThemeMode } from './types';
import {
  getStoredTheme,
  getStoredFontSans,
  getStoredFontMono,
  defaultBackgroundSettings,
  THEME_STORAGE_KEY,
  FONT_SANS_STORAGE_KEY,
  FONT_MONO_STORAGE_KEY,
} from './types';
import type { Project } from '@/lib/electron';

// --- Exported helper functions (used by app-store for project management) ---

/**
 * Helper to get effective font value with validation
 * Returns the font to use (project override -> global -> null for default)
 */
export function getEffectiveFont(
  projectFont: string | undefined,
  globalFont: string | null,
  fontOptions: readonly { value: string; label: string }[]
): string | null {
  const isValidFont = (font: string | null | undefined): boolean => {
    if (!font || font === DEFAULT_FONT_VALUE) return true;
    return fontOptions.some((opt) => opt.value === font);
  };

  if (projectFont) {
    if (!isValidFont(projectFont)) return null;
    return projectFont === DEFAULT_FONT_VALUE ? null : projectFont;
  }
  if (!isValidFont(globalFont)) return null;
  return globalFont === DEFAULT_FONT_VALUE ? null : globalFont;
}

export function saveThemeToStorage(theme: ThemeMode): void {
  setItem(THEME_STORAGE_KEY, theme);
}

export function saveFontSansToStorage(fontFamily: string | null): void {
  if (fontFamily) {
    setItem(FONT_SANS_STORAGE_KEY, fontFamily);
  } else {
    localStorage.removeItem(FONT_SANS_STORAGE_KEY);
  }
}

export function saveFontMonoToStorage(fontFamily: string | null): void {
  if (fontFamily) {
    setItem(FONT_MONO_STORAGE_KEY, fontFamily);
  } else {
    localStorage.removeItem(FONT_MONO_STORAGE_KEY);
  }
}

export function persistEffectiveThemeForProject(
  project: Project | null,
  fallbackTheme: ThemeMode
): void {
  const projectTheme = project?.theme as ThemeMode | undefined;
  const themeToStore = projectTheme ?? fallbackTheme;
  saveThemeToStorage(themeToStore);
}

// --- Theme/Appearance Store ---

interface BoardBackgroundSettings {
  imagePath: string | null;
  imageVersion?: number;
  cardOpacity: number;
  columnOpacity: number;
  columnBorderEnabled: boolean;
  cardGlassmorphism: boolean;
  cardBorderEnabled: boolean;
  cardBorderOpacity: number;
  hideScrollbar: boolean;
}

interface ThemeState {
  theme: ThemeMode;
  previewTheme: ThemeMode | null;
  fontFamilySans: string | null;
  fontFamilyMono: string | null;
  boardBackgroundByProject: Record<string, BoardBackgroundSettings>;
}

interface ThemeActions {
  setTheme: (theme: ThemeMode) => void;
  setPreviewTheme: (theme: ThemeMode | null) => void;
  setFontSans: (fontFamily: string | null) => void;
  setFontMono: (fontFamily: string | null) => void;

  // Board background actions (per-project)
  setBoardBackground: (projectPath: string, imagePath: string | null) => void;
  setCardOpacity: (projectPath: string, opacity: number) => void;
  setColumnOpacity: (projectPath: string, opacity: number) => void;
  getBoardBackground: (projectPath: string) => BoardBackgroundSettings;
  setColumnBorderEnabled: (projectPath: string, enabled: boolean) => void;
  setCardGlassmorphism: (projectPath: string, enabled: boolean) => void;
  setCardBorderEnabled: (projectPath: string, enabled: boolean) => void;
  setCardBorderOpacity: (projectPath: string, opacity: number) => void;
  setHideScrollbar: (projectPath: string, hide: boolean) => void;
  clearBoardBackground: (projectPath: string) => void;
}

export const useThemeStore = create<ThemeState & ThemeActions>()((set, get) => ({
  // Initial state
  theme: getStoredTheme() || 'studio-dark',
  previewTheme: null,
  fontFamilySans: getStoredFontSans(),
  fontFamilyMono: getStoredFontMono(),
  boardBackgroundByProject: {},

  // Theme actions
  setTheme: (theme) => {
    saveThemeToStorage(theme);
    set({ theme });
  },

  setPreviewTheme: (theme) => set({ previewTheme: theme }),

  // Font actions
  setFontSans: (fontFamily) => {
    saveFontSansToStorage(fontFamily);
    set({ fontFamilySans: fontFamily });
  },

  setFontMono: (fontFamily) => {
    saveFontMonoToStorage(fontFamily);
    set({ fontFamilyMono: fontFamily });
  },

  // Board Background actions
  setBoardBackground: (projectPath, imagePath) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || {
      imagePath: null,
      cardOpacity: 100,
      columnOpacity: 100,
      columnBorderEnabled: true,
      cardGlassmorphism: true,
      cardBorderEnabled: true,
      cardBorderOpacity: 100,
      hideScrollbar: false,
    };
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: {
          ...existing,
          imagePath,
          imageVersion: imagePath ? Date.now() : undefined,
        },
      },
    });
  },

  setCardOpacity: (projectPath, opacity) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: { ...existing, cardOpacity: opacity },
      },
    });
  },

  setColumnOpacity: (projectPath, opacity) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: { ...existing, columnOpacity: opacity },
      },
    });
  },

  getBoardBackground: (projectPath) => {
    return get().boardBackgroundByProject[projectPath] || defaultBackgroundSettings;
  },

  setColumnBorderEnabled: (projectPath, enabled) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: { ...existing, columnBorderEnabled: enabled },
      },
    });
  },

  setCardGlassmorphism: (projectPath, enabled) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: { ...existing, cardGlassmorphism: enabled },
      },
    });
  },

  setCardBorderEnabled: (projectPath, enabled) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: { ...existing, cardBorderEnabled: enabled },
      },
    });
  },

  setCardBorderOpacity: (projectPath, opacity) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: { ...existing, cardBorderOpacity: opacity },
      },
    });
  },

  setHideScrollbar: (projectPath, hide) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: { ...existing, hideScrollbar: hide },
      },
    });
  },

  clearBoardBackground: (projectPath) => {
    const current = get().boardBackgroundByProject;
    const existing = current[projectPath] || defaultBackgroundSettings;
    set({
      boardBackgroundByProject: {
        ...current,
        [projectPath]: {
          ...existing,
          imagePath: null,
          imageVersion: undefined,
        },
      },
    });
  },
}));
