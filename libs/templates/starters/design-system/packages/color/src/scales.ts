/**
 * OKLCH color scale generation.
 *
 * Produces 11-shade scales (50-950) from a hue angle and peak chroma.
 * Uses the perceptually uniform OKLCH color space, which fixes HSL's
 * shortcoming of unequal perceived lightness across hues.
 *
 * Port of proto2's @proto/utils color science engine.
 */

/** 11-shade color scale, Tailwind-style */
export interface ColorScale {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

/** All shade keys in order */
export const SHADE_KEYS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Shade = (typeof SHADE_KEYS)[number];

/** OKLCH color components */
export interface OklchColor {
  /** Lightness in [0, 1]. 0 = black, 1 = white. */
  l: number;
  /** Chroma (saturation). 0 = gray, practical max ~0.37. */
  c: number;
  /** Hue angle in degrees [0, 360). */
  h: number;
}

/**
 * Lightness values for each shade step.
 * 50 is near-white (0.97), 950 is near-black (0.12).
 */
const LIGHTNESS_MAP: Record<Shade, number> = {
  50: 0.97,
  100: 0.93,
  200: 0.87,
  300: 0.78,
  400: 0.68,
  500: 0.55,
  600: 0.45,
  700: 0.37,
  800: 0.28,
  900: 0.2,
  950: 0.12,
};

/**
 * Chroma multiplier for each shade step.
 * Bell-curves around the 400-600 range (peak saturation).
 * Tails (50, 950) have very low chroma for near-neutral tints/shades.
 */
const CHROMA_CURVE: Record<Shade, number> = {
  50: 0.1,
  100: 0.2,
  200: 0.4,
  300: 0.65,
  400: 0.85,
  500: 1.0,
  600: 0.95,
  700: 0.8,
  800: 0.6,
  900: 0.4,
  950: 0.25,
};

/**
 * Format a single OKLCH value as a CSS oklch() string.
 */
export function formatOklch(l: number, c: number, h: number, alpha?: number): string {
  if (alpha !== undefined && alpha < 1) {
    return `oklch(${l.toFixed(3)} ${c.toFixed(4)} ${h.toFixed(1)} / ${alpha})`;
  }
  return `oklch(${l.toFixed(3)} ${c.toFixed(4)} ${h.toFixed(1)})`;
}

/**
 * Parse an oklch() CSS string into color components.
 * Returns null if the string cannot be parsed.
 */
export function parseOklch(value: string): OklchColor | null {
  const match = value.match(/oklch\(([.\d]+)\s+([.\d]+)\s+([.\d]+)/);
  if (!match) return null;
  return {
    l: parseFloat(match[1]),
    c: parseFloat(match[2]),
    h: parseFloat(match[3]),
  };
}

/**
 * Generate an 11-shade OKLCH color scale from a hue and peak chroma.
 *
 * @param hue - OKLCH hue angle in degrees (0-360)
 * @param peakChroma - Maximum chroma at the 500 shade (typically 0.02-0.25)
 * @returns ColorScale with oklch() CSS strings for each of the 11 shades
 *
 * @example
 * ```ts
 * const violet = generateScale(275, 0.18);
 * console.log(violet[500]); // "oklch(0.550 0.1800 275.0)"
 * ```
 */
export function generateScale(hue: number, peakChroma: number): ColorScale {
  const scale = {} as Record<Shade, string>;

  for (const shade of SHADE_KEYS) {
    const l = LIGHTNESS_MAP[shade];
    const c = peakChroma * CHROMA_CURVE[shade];
    scale[shade] = formatOklch(l, c, hue);
  }

  return scale as ColorScale;
}

/**
 * Generate an 11-shade scale from an existing OKLCH color object.
 * Uses the color's hue and chroma as the scale's hue and peak chroma.
 *
 * @param color - Source OklchColor to build a scale around
 */
export function generateScaleFromColor(color: OklchColor): ColorScale {
  return generateScale(color.h, color.c);
}

/**
 * Generate a neutral (low-chroma) scale, suitable for grays and UI backgrounds.
 *
 * @param hue - Subtle hue cast angle (0-360). Default: 260 (cool blue-gray)
 * @param chromaLevel - Chroma intensity. 0 = pure gray, default 0.02 = very subtle
 */
export function generateNeutralScale(hue = 260, chromaLevel = 0.02): ColorScale {
  return generateScale(hue, chromaLevel);
}

/**
 * Get a single shade value from a ColorScale.
 */
export function getShade(scale: ColorScale, shade: Shade): string {
  return scale[shade];
}

/**
 * Convert a ColorScale to an ordered array of [shade, value] pairs.
 */
export function scaleEntries(scale: ColorScale): Array<[Shade, string]> {
  return SHADE_KEYS.map((shade) => [shade, scale[shade]]);
}
