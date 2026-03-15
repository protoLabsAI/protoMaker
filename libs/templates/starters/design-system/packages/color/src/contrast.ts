/**
 * WCAG contrast ratio calculation using OKLCH color values.
 *
 * Converts OKLCH → linear sRGB → relative luminance per the WCAG 2.1 spec.
 * Since Oklab operates in linear light (no gamma encoding), the luminance
 * computation skips the gamma-decoding step that sRGB-based WCAG calculators
 * need to perform.
 *
 * References:
 * - WCAG 2.1 Contrast: https://www.w3.org/TR/WCAG21/#contrast-minimum
 * - Oklab spec (Björn Ottosson): https://bottosson.github.io/posts/oklab/
 */

import { parseOklch } from './scales.js';
import type { OklchColor, ColorScale, Shade } from './scales.js';

/** WCAG conformance level */
export type WCAGLevel = 'AA' | 'AAA';

/** Text size category */
export type TextSize = 'normal' | 'large';

/** Full contrast check result */
export interface ContrastResult {
  /** Raw contrast ratio (e.g. 4.52 means 4.52:1) */
  ratio: number;
  /** Formatted ratio string e.g. "4.52:1" */
  ratioString: string;
  /** Passes WCAG AA for normal text (≥4.5:1) */
  passesAA: boolean;
  /** Passes WCAG AA for large text (≥3:1) */
  passesAALarge: boolean;
  /** Passes WCAG AAA for normal text (≥7:1) */
  passesAAA: boolean;
  /** Passes WCAG AAA for large text (≥4.5:1) */
  passesAAALarge: boolean;
}

/** WCAG minimum contrast ratios */
export const WCAG_RATIOS = {
  AA_NORMAL: 4.5,
  AA_LARGE: 3.0,
  AAA_NORMAL: 7.0,
  AAA_LARGE: 4.5,
} as const;

// ---------------------------------------------------------------------------
// Color math: OKLCH → linear sRGB → luminance
// ---------------------------------------------------------------------------

/**
 * Convert an OklchColor to linear sRGB [r, g, b] in [0, 1].
 *
 * Pipeline:
 *   Oklch (L, C, h) → Oklab (L, a, b) → LMS^(1/3) → LMS → linear sRGB
 *
 * Uses the inverse Oklab matrices from Björn Ottosson's spec.
 * Output may slightly exceed [0, 1] for out-of-gamut colors.
 */
export function oklchToLinearSRGB(color: OklchColor): [number, number, number] {
  const { l, c, h } = color;
  const hRad = (h * Math.PI) / 180;

  // Step 1: Oklch → Oklab
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  // Step 2: Oklab → LMS^(1/3) via inverse of M2
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  // Step 3: Cube to get LMS
  const lLMS = l_ * l_ * l_;
  const mLMS = m_ * m_ * m_;
  const sLMS = s_ * s_ * s_;

  // Step 4: LMS → linear sRGB via inverse of M1
  const r = +4.0767416621 * lLMS - 3.3077115913 * mLMS + 0.2309699292 * sLMS;
  const g = -1.2684380046 * lLMS + 2.6097574011 * mLMS - 0.3413193965 * sLMS;
  const bl = -0.0041960863 * lLMS - 0.7034186147 * mLMS + 1.707614701 * sLMS;

  return [r, g, bl];
}

/**
 * Calculate relative luminance from linear sRGB values.
 *
 * Input values are clamped to [0, 1] to handle out-of-gamut colors gracefully.
 * Formula: Y = 0.2126·R + 0.7152·G + 0.0722·B  (CIE 1931 luminance)
 */
export function linearSRGBToLuminance(r: number, g: number, b: number): number {
  const rC = Math.max(0, Math.min(1, r));
  const gC = Math.max(0, Math.min(1, g));
  const bC = Math.max(0, Math.min(1, b));
  return 0.2126 * rC + 0.7152 * gC + 0.0722 * bC;
}

/**
 * Calculate WCAG relative luminance from an OklchColor.
 * Returns a value in [0, 1] where 0 = absolute black, 1 = absolute white.
 */
export function oklchToLuminance(color: OklchColor): number {
  const [r, g, b] = oklchToLinearSRGB(color);
  return linearSRGBToLuminance(r, g, b);
}

// ---------------------------------------------------------------------------
// Contrast API
// ---------------------------------------------------------------------------

/**
 * Calculate the WCAG contrast ratio between two OklchColors.
 *
 * Formula: (L_lighter + 0.05) / (L_darker + 0.05)
 *
 * @returns Ratio ≥ 1.0. White-on-black = 21:1.
 */
export function contrastRatio(color1: OklchColor, color2: OklchColor): number {
  const l1 = oklchToLuminance(color1);
  const l2 = oklchToLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Full WCAG contrast check between two OKLCH colors.
 *
 * @example
 * ```ts
 * const result = checkContrast(
 *   { l: 0.12, c: 0.01, h: 260 }, // near-black text
 *   { l: 0.97, c: 0.00, h: 260 }, // near-white background
 * );
 * console.log(result.ratioString); // "17.51:1"
 * console.log(result.passesAAA);   // true
 * ```
 */
export function checkContrast(foreground: OklchColor, background: OklchColor): ContrastResult {
  const ratio = contrastRatio(foreground, background);
  return {
    ratio,
    ratioString: `${ratio.toFixed(2)}:1`,
    passesAA: ratio >= WCAG_RATIOS.AA_NORMAL,
    passesAALarge: ratio >= WCAG_RATIOS.AA_LARGE,
    passesAAA: ratio >= WCAG_RATIOS.AAA_NORMAL,
    passesAAALarge: ratio >= WCAG_RATIOS.AAA_LARGE,
  };
}

/**
 * Check if two colors (OklchColor objects or oklch() CSS strings) meet
 * a specific WCAG level.
 *
 * @param fg - Foreground color
 * @param bg - Background color
 * @param level - WCAG level: 'AA' (default) or 'AAA'
 * @param size - Text size: 'normal' (default) or 'large'
 * @returns true if the pair passes the specified WCAG requirement
 */
export function passesWCAG(
  fg: string | OklchColor,
  bg: string | OklchColor,
  level: WCAGLevel = 'AA',
  size: TextSize = 'normal'
): boolean {
  const fgColor = typeof fg === 'string' ? parseOklch(fg) : fg;
  const bgColor = typeof bg === 'string' ? parseOklch(bg) : bg;
  if (!fgColor || !bgColor) return false;

  const result = checkContrast(fgColor, bgColor);
  if (level === 'AA') {
    return size === 'normal' ? result.passesAA : result.passesAALarge;
  }
  return size === 'normal' ? result.passesAAA : result.passesAAALarge;
}

/**
 * Get the contrast ratio between two colors as a number.
 * Returns 0 if either color cannot be parsed.
 */
export function getRatio(fg: string | OklchColor, bg: string | OklchColor): number {
  const fgColor = typeof fg === 'string' ? parseOklch(fg) : fg;
  const bgColor = typeof bg === 'string' ? parseOklch(bg) : bg;
  if (!fgColor || !bgColor) return 0;
  return contrastRatio(fgColor, bgColor);
}

/**
 * Find the first shade in a ColorScale that achieves the minimum contrast ratio
 * against a given background. Useful for finding accessible text colors.
 *
 * Iterates from shade 50 (lightest) upward. For dark backgrounds, consider
 * iterating in reverse by using `findAccessibleShadeFrom950`.
 *
 * @param scale - ColorScale to search
 * @param bg - Background color to test against
 * @param minRatio - Minimum contrast ratio. Default: 4.5 (WCAG AA normal)
 * @returns The shade key that first meets the ratio, or null if none qualifies
 */
export function findAccessibleShade(
  scale: ColorScale,
  bg: string | OklchColor,
  minRatio = WCAG_RATIOS.AA_NORMAL
): Shade | null {
  const bgColor = typeof bg === 'string' ? parseOklch(bg) : bg;
  if (!bgColor) return null;

  const shades: Shade[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  for (const shade of shades) {
    const fgColor = parseOklch(scale[shade]);
    if (!fgColor) continue;
    if (contrastRatio(fgColor, bgColor) >= minRatio) {
      return shade;
    }
  }
  return null;
}

/**
 * Find the first shade from 950 downward that achieves the minimum contrast ratio.
 * Use this when looking for accessible colors on dark backgrounds.
 *
 * @param scale - ColorScale to search
 * @param bg - Background color to test against
 * @param minRatio - Minimum contrast ratio. Default: 4.5 (WCAG AA normal)
 * @returns The shade key that first meets the ratio, or null if none qualifies
 */
export function findAccessibleShadeFrom950(
  scale: ColorScale,
  bg: string | OklchColor,
  minRatio = WCAG_RATIOS.AA_NORMAL
): Shade | null {
  const bgColor = typeof bg === 'string' ? parseOklch(bg) : bg;
  if (!bgColor) return null;

  const shades: Shade[] = [950, 900, 800, 700, 600, 500, 400, 300, 200, 100, 50];
  for (const shade of shades) {
    const fgColor = parseOklch(scale[shade]);
    if (!fgColor) continue;
    if (contrastRatio(fgColor, bgColor) >= minRatio) {
      return shade;
    }
  }
  return null;
}
