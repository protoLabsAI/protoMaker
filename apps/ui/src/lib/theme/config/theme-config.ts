/**
 * Theme configuration type for Automaker.
 *
 * Extends proto-starter's ThemeConfig to cover all 102 CSS custom properties.
 * The generator derives ~60 variables automatically from this config.
 */

import type { LucideIcon } from 'lucide-react';
import type { ColorScale } from './color-scales';

/**
 * Full theme configuration object.
 *
 * Provides explicit control over surfaces, foreground, borders, and brand accent.
 * The CSS generator derives action, status, sidebar, chart, and running-indicator
 * tokens from these base values.
 */
export interface AutomakerThemeConfig {
  /** CSS class name applied to :root (e.g. 'studio-dark') */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Whether this is a dark theme */
  isDark: boolean;
  /** Theme category for grouping in the picker */
  category: 'curated' | 'community';
  /** Lucide icon for the theme picker */
  icon?: LucideIcon;
  /** Hex color for the icon in the picker */
  iconColor?: string;

  /** Color scales for generation */
  colors: {
    /** Primary accent scale — used for brand, actions, ring, running indicator */
    primary: ColorScale;
    /** Neutral gray scale — used for surfaces, borders, text */
    gray: ColorScale;
    /** Optional secondary accent (defaults to primary if omitted) */
    accent?: ColorScale;
  };

  /** Status colors — single OKLCH values */
  status: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };

  /** Surface backgrounds — explicit OKLCH values */
  surfaces: {
    background: string;
    card: string;
    popover: string;
    sidebar: string;
    input: string;
    muted: string;
    secondary: string;
  };

  /** Text color hierarchy */
  foreground: {
    default: string;
    secondary: string;
    muted: string;
  };

  /** Border tokens */
  borders: {
    default: string;
    glass: string;
    ring: string;
  };

  /** Brand color overrides (defaults derived from primary scale if omitted) */
  brand?: {
    400: string;
    500: string;
    600: string;
  };

  /** Optional radius override (defaults to 0.5rem) */
  radius?: string;

  /** Optional font overrides */
  fonts?: {
    sans?: string;
    mono?: string;
  };
}

/**
 * Subset of ThemeConfig needed for the theme picker UI.
 * Avoids importing full ColorScale data into the picker component.
 */
export interface ThemeOptionConfig {
  name: string;
  displayName: string;
  isDark: boolean;
  category: 'curated' | 'community';
  icon?: LucideIcon;
  iconColor?: string;
}
