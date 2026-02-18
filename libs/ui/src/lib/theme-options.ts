import { type LucideIcon, Cat, Flame, Ghost, Moon, Snowflake, Sun } from 'lucide-react';

// Theme value type - all available themes
export type Theme =
  // Curated
  | 'studio-dark'
  | 'studio-light'
  // Community presets
  | 'nord'
  | 'catppuccin'
  | 'dracula'
  | 'monokai';

export interface ThemeOption {
  value: Theme;
  label: string;
  Icon: LucideIcon;
  testId: string;
  isDark: boolean;
  color: string; // Primary/brand color for icon display
}

// All theme options — curated first, then community presets (alphabetical within group)
export const themeOptions: ReadonlyArray<ThemeOption> = [
  // Curated themes
  {
    value: 'studio-dark',
    label: 'Studio Dark',
    Icon: Moon,
    testId: 'studio-dark-mode-button',
    isDark: true,
    color: '#8b5cf6',
  },
  {
    value: 'studio-light',
    label: 'Studio Light',
    Icon: Sun,
    testId: 'studio-light-mode-button',
    isDark: false,
    color: '#8b5cf6',
  },
  // Community presets — dark
  {
    value: 'catppuccin',
    label: 'Catppuccin',
    Icon: Cat,
    testId: 'catppuccin-mode-button',
    isDark: true,
    color: '#cba6f7',
  },
  {
    value: 'dracula',
    label: 'Dracula',
    Icon: Ghost,
    testId: 'dracula-mode-button',
    isDark: true,
    color: '#bd93f9',
  },
  {
    value: 'monokai',
    label: 'Monokai',
    Icon: Flame,
    testId: 'monokai-mode-button',
    isDark: true,
    color: '#f92672',
  },
  {
    value: 'nord',
    label: 'Nord',
    Icon: Snowflake,
    testId: 'nord-mode-button',
    isDark: true,
    color: '#88c0d0',
  },
];

// Helper: Get only dark themes
export const darkThemes = themeOptions.filter((t) => t.isDark);

// Helper: Get only light themes
export const lightThemes = themeOptions.filter((t) => !t.isDark);
