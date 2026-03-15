/**
 * Color harmony generation using OKLCH hue rotation.
 *
 * OKLCH's perceptually uniform hue angle means harmonies based on equal
 * hue intervals are visually balanced — unlike HSL where 180° opposite
 * hues can produce very different-feeling color pairs.
 *
 * Supported harmony types:
 * - Complementary: one opposite color (+180°)
 * - Triadic: three evenly-spaced colors (+120°, +240°)
 * - Analogous: three adjacent colors (±spread°, default ±30°)
 * - Split-complementary: base + two colors flanking the complement (+150°, +210°)
 * - Tetradic (square): four evenly-spaced colors (+90°, +180°, +270°)
 */

import { generateScale } from './scales.js';
import type { ColorScale, OklchColor } from './scales.js';

/** A named color with its generated 11-shade scale */
export interface HarmonyColor {
  /** Human-readable role name (e.g. 'base', 'complement', 'triadic-1') */
  name: string;
  /** OKLCH hue angle for this harmony stop */
  hue: number;
  /** Peak chroma used for scale generation */
  chroma: number;
  /** Generated 11-shade ColorScale */
  scale: ColorScale;
}

/** All supported harmony types */
export type HarmonyType =
  | 'complementary'
  | 'triadic'
  | 'analogous'
  | 'split-complementary'
  | 'tetradic';

/**
 * Rotate a hue angle, keeping the result in [0, 360).
 */
export function rotateHue(hue: number, degrees: number): number {
  return (((hue + degrees) % 360) + 360) % 360;
}

/** Build a HarmonyColor from hue and chroma */
function harmonyColor(name: string, hue: number, chroma: number): HarmonyColor {
  return { name, hue, chroma, scale: generateScale(hue, chroma) };
}

/**
 * Generate complementary colors — one color opposite on the hue wheel (+180°).
 *
 * @returns Tuple of [base, complement]
 *
 * @example
 * ```ts
 * const [base, comp] = complementary({ l: 0.55, c: 0.18, h: 275 });
 * // comp.hue === 95
 * ```
 */
export function complementary(base: OklchColor): [HarmonyColor, HarmonyColor] {
  return [
    harmonyColor('base', base.h, base.c),
    harmonyColor('complement', rotateHue(base.h, 180), base.c),
  ];
}

/**
 * Generate triadic colors — three evenly-spaced hues (+120°, +240°).
 *
 * @returns Tuple of [base, triadic-1, triadic-2]
 */
export function triadic(base: OklchColor): [HarmonyColor, HarmonyColor, HarmonyColor] {
  return [
    harmonyColor('base', base.h, base.c),
    harmonyColor('triadic-1', rotateHue(base.h, 120), base.c),
    harmonyColor('triadic-2', rotateHue(base.h, 240), base.c),
  ];
}

/**
 * Generate analogous colors — three adjacent hues (default ±30°).
 *
 * @param spread - Angular spread in degrees. Default: 30
 * @returns Tuple of [left, base, right]
 */
export function analogous(
  base: OklchColor,
  spread = 30
): [HarmonyColor, HarmonyColor, HarmonyColor] {
  return [
    harmonyColor('analogous-left', rotateHue(base.h, -spread), base.c),
    harmonyColor('base', base.h, base.c),
    harmonyColor('analogous-right', rotateHue(base.h, spread), base.c),
  ];
}

/**
 * Generate split-complementary colors — base + two hues flanking the complement (+150°, +210°).
 * Less tension than full complementary but more visual interest than analogous.
 *
 * @returns Tuple of [base, split-1, split-2]
 */
export function splitComplementary(base: OklchColor): [HarmonyColor, HarmonyColor, HarmonyColor] {
  return [
    harmonyColor('base', base.h, base.c),
    harmonyColor('split-1', rotateHue(base.h, 150), base.c),
    harmonyColor('split-2', rotateHue(base.h, 210), base.c),
  ];
}

/**
 * Generate tetradic (square) colors — four evenly-spaced hues (+90°, +180°, +270°).
 * Provides maximum color variety; use carefully to avoid visual chaos.
 *
 * @returns Tuple of [base, tetradic-1, tetradic-2, tetradic-3]
 */
export function tetradic(
  base: OklchColor
): [HarmonyColor, HarmonyColor, HarmonyColor, HarmonyColor] {
  return [
    harmonyColor('base', base.h, base.c),
    harmonyColor('tetradic-1', rotateHue(base.h, 90), base.c),
    harmonyColor('tetradic-2', rotateHue(base.h, 180), base.c),
    harmonyColor('tetradic-3', rotateHue(base.h, 270), base.c),
  ];
}

/**
 * Generate a harmony by name.
 *
 * @param type - Harmony type
 * @param base - Base color to build harmonies from
 * @returns Array of HarmonyColor objects (length depends on type)
 *
 * @example
 * ```ts
 * const colors = generateHarmony('triadic', { l: 0.55, c: 0.18, h: 275 });
 * // colors.length === 3
 * ```
 */
export function generateHarmony(type: HarmonyType, base: OklchColor): HarmonyColor[] {
  switch (type) {
    case 'complementary':
      return complementary(base);
    case 'triadic':
      return triadic(base);
    case 'analogous':
      return analogous(base);
    case 'split-complementary':
      return splitComplementary(base);
    case 'tetradic':
      return tetradic(base);
  }
}

/** All supported harmony types as a constant array */
export const HARMONY_TYPES: HarmonyType[] = [
  'complementary',
  'triadic',
  'analogous',
  'split-complementary',
  'tetradic',
];
