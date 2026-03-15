/**
 * Full palette generation from a single accent color.
 *
 * Given one accent color (the primary brand color), generates a complete
 * design-system palette:
 *   - Primary scale (from accent)
 *   - Neutral/gray scale (low-chroma, hue-coordinated)
 *   - Status scales: destructive, success, warning, info
 *   - Complementary accent (for visual variety)
 *   - Semantic token map (ready to emit as CSS custom properties)
 *
 * The single-accent approach keeps visual identity coherent: all hues are
 * either derived from the accent (harmonics) or are conventional status hues
 * matched to the accent's chroma level.
 */

import { generateScale, generateNeutralScale } from './scales.js';
import type { ColorScale, OklchColor } from './scales.js';
import { complementary } from './harmonies.js';
import { buildSemanticMap, semanticMapToCSSVars } from './semantic.js';
import type { SemanticColorMap, SemanticRole } from './semantic.js';

// Re-export helpers for palette-level consumers
export { formatOklch, parseOklch } from './scales.js';

/** The full set of named raw scales in a DesignSystemPalette */
export interface PaletteScales {
  primary: ColorScale;
  neutral: ColorScale;
  destructive: ColorScale;
  success: ColorScale;
  warning: ColorScale;
  info: ColorScale;
  /** Complementary accent — opposite the primary on the hue wheel */
  accent: ColorScale;
}

/** A complete design system color palette */
export interface DesignSystemPalette {
  /** Raw color scales by name */
  scales: PaletteScales;
  /** Semantic token mappings (DEFAULT, foreground, subtle, etc.) */
  semantic: SemanticColorMap;
}

/** Options for palette generation */
export interface PaletteOptions {
  /**
   * Peak chroma for status colors (destructive, success, warning, info).
   * Defaults to the accent color's chroma so status colors feel cohesive.
   */
  statusChroma?: number;

  /**
   * Hue for the neutral/gray scale.
   * Default: accent.h - 15° (slightly cooler for cohesion).
   */
  neutralHue?: number;

  /**
   * Chroma for the neutral scale.
   * Default: 0.02 (very subtle).
   */
  neutralChroma?: number;
}

/** Fixed hues for semantic status roles */
const STATUS_HUES = {
  destructive: 25, // Red-orange
  success: 145, // Green
  warning: 75, // Amber-yellow
  info: 245, // Blue
} as const;

/**
 * Generate a complete design system palette from a single accent color.
 *
 * The accent becomes the primary. All other scales are derived from
 * conventional design system roles with chroma coordinated to the accent.
 *
 * @param accent - Primary brand color in OKLCH
 * @param options - Optional tuning parameters
 *
 * @example
 * ```ts
 * // Violet-based design system
 * const palette = generatePalette({ l: 0.55, c: 0.18, h: 275 });
 *
 * // Access a specific raw shade
 * const brandBtn = palette.scales.primary[500];
 *
 * // Get CSS custom properties
 * const cssVars = semanticMapToCSSVars(palette.semantic);
 * Object.entries(cssVars).forEach(([name, value]) => {
 *   document.documentElement.style.setProperty(name, value);
 * });
 * ```
 */
export function generatePalette(
  accent: OklchColor,
  options: PaletteOptions = {}
): DesignSystemPalette {
  const statusChroma = options.statusChroma ?? accent.c;
  const neutralHue = options.neutralHue ?? (accent.h - 15 + 360) % 360;
  const neutralChroma = options.neutralChroma ?? 0.02;

  // Primary from accent
  const primaryScale = generateScale(accent.h, accent.c);

  // Neutral — very low chroma, hue-coordinated
  const neutralScale = generateNeutralScale(neutralHue, neutralChroma);

  // Status scales — fixed hues, chroma matched to accent
  const destructiveScale = generateScale(STATUS_HUES.destructive, statusChroma);
  const successScale = generateScale(STATUS_HUES.success, statusChroma * 0.85);
  const warningScale = generateScale(STATUS_HUES.warning, statusChroma * 0.8);
  const infoScale = generateScale(STATUS_HUES.info, statusChroma * 0.9);

  // Complementary accent — opposite hue, slightly reduced chroma
  const [, compHarmony] = complementary(accent);
  const accentScale = generateScale(compHarmony.hue, accent.c * 0.85);

  const scales: PaletteScales = {
    primary: primaryScale,
    neutral: neutralScale,
    destructive: destructiveScale,
    success: successScale,
    warning: warningScale,
    info: infoScale,
    accent: accentScale,
  };

  // Build semantic map using the generated scales
  const semanticScales: Record<SemanticRole, ColorScale> = {
    primary: primaryScale,
    secondary: neutralScale,
    destructive: destructiveScale,
    muted: neutralScale,
    success: successScale,
    warning: warningScale,
    info: infoScale,
  };

  const semantic = buildSemanticMap(semanticScales);

  return { scales, semantic };
}

/**
 * Convenience wrapper — generate a palette from hue and chroma values.
 *
 * @param hue - OKLCH hue angle (0-360)
 * @param chroma - Peak chroma. Default: 0.18
 * @param lightness - Lightness. Default: 0.55 (the 500-shade reference point)
 * @param options - Optional palette tuning
 */
export function generatePaletteFromHue(
  hue: number,
  chroma = 0.18,
  lightness = 0.55,
  options?: PaletteOptions
): DesignSystemPalette {
  return generatePalette({ l: lightness, c: chroma, h: hue }, options);
}

/**
 * Extract CSS custom properties from a palette's semantic map.
 * Thin wrapper that surfaces semanticMapToCSSVars at the palette level.
 */
export function paletteToCSSVars(
  palette: DesignSystemPalette,
  prefix = '--color'
): Record<string, string> {
  return semanticMapToCSSVars(palette.semantic, prefix);
}

/**
 * Named preset palette factories for common design system starting points.
 *
 * @example
 * ```ts
 * const palette = PRESET_PALETTES.violet();
 * ```
 */
export const PRESET_PALETTES = {
  violet: () => generatePaletteFromHue(275, 0.18),
  blue: () => generatePaletteFromHue(245, 0.16),
  teal: () => generatePaletteFromHue(190, 0.15),
  green: () => generatePaletteFromHue(145, 0.15),
  amber: () => generatePaletteFromHue(75, 0.14),
  rose: () => generatePaletteFromHue(355, 0.18),
  slate: () => generatePaletteFromHue(225, 0.03),
} as const;

export type PresetPaletteName = keyof typeof PRESET_PALETTES;
