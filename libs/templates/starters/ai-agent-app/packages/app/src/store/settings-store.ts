/**
 * settings-store — Global user preferences with localStorage persistence.
 *
 * Stores the default model for new sessions and the active theme.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'system';

interface SettingsState {
  defaultModel: string;
  theme: Theme;
}

interface SettingsActions {
  setDefaultModel: (model: string) => void;
  setTheme: (theme: Theme) => void;
}

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      defaultModel: 'claude-haiku-4-5-20251001',
      theme: 'dark',

      setDefaultModel: (defaultModel) => set({ defaultModel }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'app-settings',
      partialize: (state) => ({
        defaultModel: state.defaultModel,
        theme: state.theme,
      }),
    }
  )
);
