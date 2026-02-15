/**
 * OKLCH color scale generation.
 *
 * Produces 11-shade scales (50-950) from a hue and peak chroma.
 * Lightness curves from 0.97 (50) to 0.10 (950).
 * Chroma bell-curves around the 500 shade.
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

/**
 * Lightness values for each shade step.
 * 50 is near-white, 950 is near-black.
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
 * Bell-curves around 400-600 range (peak saturation).
 * Tails (50, 950) have very low chroma.
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

/** Format a single OKLCH value */
function oklch(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(4)} ${h.toFixed(1)})`;
}

/**
 * Generate an 11-shade OKLCH color scale.
 *
 * @param hue - OKLCH hue angle (0-360)
 * @param peakChroma - Maximum chroma at the 500 shade (typically 0.02-0.25)
 * @returns ColorScale with OKLCH string values
 */
export function generateOklchScale(hue: number, peakChroma: number): ColorScale {
  const scale = {} as Record<Shade, string>;

  for (const shade of SHADE_KEYS) {
    const lightness = LIGHTNESS_MAP[shade];
    const chroma = peakChroma * CHROMA_CURVE[shade];
    scale[shade] = oklch(lightness, chroma, hue);
  }

  return scale as ColorScale;
}

/**
 * Pre-built primitive palettes for the Studio themes.
 * These are the building blocks — semantic tokens reference specific shades.
 */
export const palettes = {
  /** Cool neutral gray — backbone of the UI */
  gray: generateOklchScale(260, 0.02),
  /** Brand violet — primary accent */
  violet: generateOklchScale(275, 0.18),
  /** Info blue — links, informational states */
  blue: generateOklchScale(245, 0.16),
  /** Success green */
  green: generateOklchScale(145, 0.15),
  /** Warning amber */
  amber: generateOklchScale(75, 0.14),
  /** Error red */
  red: generateOklchScale(25, 0.18),
  /** Accent cyan */
  cyan: generateOklchScale(210, 0.13),
} as const;

/**
 * Extract a single OKLCH value from a formatted string.
 * Returns { l, c, h } or null if parsing fails.
 */
export function parseOklch(value: string): { l: number; c: number; h: number } | null {
  const match = value.match(/oklch\(([.\d]+)\s+([.\d]+)\s+([.\d]+)/);
  if (!match) return null;
  return {
    l: parseFloat(match[1]),
    c: parseFloat(match[2]),
    h: parseFloat(match[3]),
  };
}

/**
 * Create an OKLCH string with optional alpha.
 */
export function oklchString(l: number, c: number, h: number, alpha?: number): string {
  if (alpha !== undefined && alpha < 1) {
    return `oklch(${l.toFixed(3)} ${c.toFixed(4)} ${h.toFixed(1)} / ${alpha})`;
  }
  return oklch(l, c, h);
}
