/**
 * @@PROJECT_NAME-color
 *
 * LCH/OKLCH color science for design systems.
 * Zero external dependencies.
 *
 * Modules:
 *   scales    — 11-step OKLCH scale generation (50-950)
 *   harmonies — Color harmony generation (complementary, triadic, analogous, etc.)
 *   contrast  — WCAG AA/AAA contrast ratio checking
 *   semantic  — Semantic token mapping (primary, destructive, muted, etc.)
 *   palette   — Full palette generation from a single accent color
 */

// Scales
export {
  generateScale,
  generateScaleFromColor,
  generateNeutralScale,
  formatOklch,
  parseOklch,
  getShade,
  scaleEntries,
  SHADE_KEYS,
} from './scales.js';
export type { ColorScale, OklchColor, Shade } from './scales.js';

// Harmonies
export {
  complementary,
  triadic,
  analogous,
  splitComplementary,
  tetradic,
  generateHarmony,
  rotateHue,
  HARMONY_TYPES,
} from './harmonies.js';
export type { HarmonyColor, HarmonyType } from './harmonies.js';

// Contrast
export {
  oklchToLinearSRGB,
  linearSRGBToLuminance,
  oklchToLuminance,
  contrastRatio,
  checkContrast,
  passesWCAG,
  getRatio,
  findAccessibleShade,
  findAccessibleShadeFrom950,
  WCAG_RATIOS,
} from './contrast.js';
export type { ContrastResult, WCAGLevel, TextSize } from './contrast.js';

// Semantic
export {
  buildSemanticMap,
  buildDefaultSemanticMap,
  semanticMapToCSSVars,
  DEFAULT_SEMANTIC_HUES,
} from './semantic.js';
export type { SemanticRole, SemanticTokens, SemanticColorMap } from './semantic.js';

// Palette
export {
  generatePalette,
  generatePaletteFromHue,
  paletteToCSSVars,
  PRESET_PALETTES,
} from './palette.js';
export type {
  DesignSystemPalette,
  PaletteScales,
  PaletteOptions,
  PresetPaletteName,
} from './palette.js';
