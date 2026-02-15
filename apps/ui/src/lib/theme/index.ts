// Config
export { generateOklchScale, palettes, parseOklch, oklchString, SHADE_KEYS } from './config';
export type {
  ColorScale,
  Shade,
  AutomakerThemeConfig,
  ThemeOptionConfig,
  ThemeBranding,
} from './config';

// Generator
export { generateThemeCSS } from './generator';
export { contrastRatio, meetsWCAG_AA, meetsWCAG_AAA, validateThemeContrast } from './generator';
export { validateThemeConfig } from './generator';
export type { ContrastResult, ContrastReport, ValidationResult } from './generator';

// Registry
export { studioDark, studioLight, curatedThemes, getCuratedTheme } from './registry';

// Transitions
export { startThemeTransition, useThemeTransition } from './transitions';
export type { TransitionVariant, ThemeTransitionOptions } from './transitions';
