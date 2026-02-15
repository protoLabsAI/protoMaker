/**
 * WCAG 2.1 contrast ratio validation for OKLCH colors.
 *
 * Converts OKLCH → sRGB → relative luminance → contrast ratio.
 * Used to validate theme accessibility during generation.
 */

import { parseOklch } from '../config/color-scales';

/** Contrast check result for a foreground/background pair */
export interface ContrastResult {
  fg: string;
  bg: string;
  ratio: number;
  meetsAA: boolean;
  meetsAAA: boolean;
  /** Human-readable label for this pair */
  label: string;
}

/** Full contrast report for a theme */
export interface ContrastReport {
  passes: ContrastResult[];
  warnings: ContrastResult[];
  failures: ContrastResult[];
}

/**
 * Convert OKLCH to approximate sRGB values.
 * Uses simplified conversion via OKLab intermediate.
 */
function oklchToSrgb(l: number, c: number, h: number): [number, number, number] {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  // OKLab to linear sRGB (approximate matrix)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const lCube = l_ * l_ * l_;
  const mCube = m_ * m_ * m_;
  const sCube = s_ * s_ * s_;

  const r = 4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube;
  const g = -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube;
  const bVal = -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube;

  return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, bVal))];
}

/**
 * Linearize an sRGB component for luminance calculation.
 */
function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Calculate relative luminance per WCAG 2.1.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Calculate WCAG 2.1 contrast ratio between two OKLCH color strings.
 * Returns ratio >= 1.0 (always lighter/darker, not directional).
 */
export function contrastRatio(fgOklch: string, bgOklch: string): number {
  const fg = parseOklch(fgOklch);
  const bg = parseOklch(bgOklch);
  if (!fg || !bg) return 1;

  const fgRgb = oklchToSrgb(fg.l, fg.c, fg.h);
  const bgRgb = oklchToSrgb(bg.l, bg.c, bg.h);

  const fgLum = relativeLuminance(...fgRgb);
  const bgLum = relativeLuminance(...bgRgb);

  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);

  return (lighter + 0.05) / (darker + 0.05);
}

/** Check if a pair meets WCAG AA (4.5:1 for normal text, 3:1 for large) */
export function meetsWCAG_AA(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= 4.5;
}

/** Check if a pair meets WCAG AAA (7:1 for normal text) */
export function meetsWCAG_AAA(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= 7.0;
}

/**
 * Validate all critical foreground/background pairs in a theme.
 * Returns a ContrastReport with passes, warnings, and failures.
 */
export function validateThemeContrast(config: {
  surfaces: { background: string; card: string; popover: string; sidebar: string; muted: string };
  foreground: { default: string; secondary: string; muted: string };
  status: { success: string; warning: string; error: string; info: string };
}): ContrastReport {
  const pairs: { fg: string; bg: string; label: string }[] = [
    // Primary text on surfaces
    { fg: config.foreground.default, bg: config.surfaces.background, label: 'text on background' },
    { fg: config.foreground.default, bg: config.surfaces.card, label: 'text on card' },
    { fg: config.foreground.default, bg: config.surfaces.popover, label: 'text on popover' },
    { fg: config.foreground.default, bg: config.surfaces.sidebar, label: 'text on sidebar' },
    // Secondary text on surfaces
    {
      fg: config.foreground.secondary,
      bg: config.surfaces.background,
      label: 'secondary text on background',
    },
    { fg: config.foreground.secondary, bg: config.surfaces.card, label: 'secondary text on card' },
    // Muted text on surfaces
    {
      fg: config.foreground.muted,
      bg: config.surfaces.background,
      label: 'muted text on background',
    },
    { fg: config.foreground.muted, bg: config.surfaces.muted, label: 'muted text on muted' },
    // Status colors on surfaces
    { fg: config.status.success, bg: config.surfaces.background, label: 'success on background' },
    { fg: config.status.warning, bg: config.surfaces.background, label: 'warning on background' },
    { fg: config.status.error, bg: config.surfaces.background, label: 'error on background' },
    { fg: config.status.info, bg: config.surfaces.background, label: 'info on background' },
  ];

  const passes: ContrastResult[] = [];
  const warnings: ContrastResult[] = [];
  const failures: ContrastResult[] = [];

  for (const { fg, bg, label } of pairs) {
    const ratio = contrastRatio(fg, bg);
    const result: ContrastResult = {
      fg,
      bg,
      ratio: Math.round(ratio * 100) / 100,
      meetsAA: ratio >= 4.5,
      meetsAAA: ratio >= 7.0,
      label,
    };

    if (ratio >= 4.5) {
      passes.push(result);
    } else if (ratio >= 3.0) {
      warnings.push(result);
    } else {
      failures.push(result);
    }
  }

  return { passes, warnings, failures };
}
