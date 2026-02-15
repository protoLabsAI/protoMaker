/**
 * Central theme registry.
 *
 * All curated themes register here. Community themes (existing CSS-only themes)
 * are referenced via theme-options.ts and don't need a ThemeConfig.
 */

import type { AutomakerThemeConfig } from '../config/theme-config';
import { studioDark } from './studio-dark';
import { studioLight } from './studio-light';

/** All programmatically-defined themes with full ThemeConfig */
export const curatedThemes: ReadonlyArray<AutomakerThemeConfig> = [studioDark, studioLight];

/** Look up a curated theme by name */
export function getCuratedTheme(name: string): AutomakerThemeConfig | undefined {
  return curatedThemes.find((t) => t.name === name);
}

/** Get all dark curated themes */
export function getCuratedDarkThemes(): ReadonlyArray<AutomakerThemeConfig> {
  return curatedThemes.filter((t) => t.isDark);
}

/** Get all light curated themes */
export function getCuratedLightThemes(): ReadonlyArray<AutomakerThemeConfig> {
  return curatedThemes.filter((t) => !t.isDark);
}
