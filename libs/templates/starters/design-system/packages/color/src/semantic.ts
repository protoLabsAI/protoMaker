/**
 * Semantic color mapping.
 *
 * Maps color scales to design-system semantic roles:
 *   primary, secondary, destructive, muted, success, warning, info
 *
 * Each role provides a consistent set of tokens:
 *   DEFAULT, foreground, subtle, subtleForeground, border, hover, active
 *
 * These tokens are designed to be emitted as CSS custom properties and consumed
 * by Tailwind or raw CSS. Shade selection is tuned for light-mode UI.
 */

import { generateScale } from './scales.js';
import type { ColorScale } from './scales.js';

/** All semantic color roles */
export type SemanticRole =
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'muted'
  | 'success'
  | 'warning'
  | 'info';

/** Token set for a single semantic role */
export interface SemanticTokens {
  /** Main interactive/brand color (button fill, link color, etc.) */
  DEFAULT: string;
  /** Text/icon color on top of DEFAULT background (must pass WCAG AA) */
  foreground: string;
  /** Light background tint (badges, highlights, row hover backgrounds) */
  subtle: string;
  /** Text on subtle background */
  subtleForeground: string;
  /** Border color for inputs, cards, dividers in this role */
  border: string;
  /** Hover state of DEFAULT */
  hover: string;
  /** Active/pressed state of DEFAULT */
  active: string;
}

/** Complete semantic color map — one SemanticTokens per role */
export type SemanticColorMap = Record<SemanticRole, SemanticTokens>;

// ---------------------------------------------------------------------------
// Internal shade selection per role
// ---------------------------------------------------------------------------

function mapRole(scale: ColorScale, role: SemanticRole): SemanticTokens {
  switch (role) {
    case 'primary':
    case 'info':
      // Saturated interactive colors — DEFAULT at 500, white-ish foreground
      return {
        DEFAULT: scale[500],
        foreground: scale[50],
        subtle: scale[50],
        subtleForeground: scale[700],
        border: scale[300],
        hover: scale[600],
        active: scale[700],
      };

    case 'secondary':
      // Low-contrast surfaces — DEFAULT at 200 for light backgrounds
      return {
        DEFAULT: scale[200],
        foreground: scale[900],
        subtle: scale[50],
        subtleForeground: scale[600],
        border: scale[200],
        hover: scale[300],
        active: scale[400],
      };

    case 'destructive':
      // Error/danger — matches primary structure but stays red
      return {
        DEFAULT: scale[500],
        foreground: scale[50],
        subtle: scale[50],
        subtleForeground: scale[700],
        border: scale[300],
        hover: scale[600],
        active: scale[700],
      };

    case 'muted':
      // Near-neutral surfaces — very subtle, used for disabled / placeholder states
      return {
        DEFAULT: scale[100],
        foreground: scale[600],
        subtle: scale[50],
        subtleForeground: scale[500],
        border: scale[200],
        hover: scale[200],
        active: scale[300],
      };

    case 'success':
      // Confirmation / positive feedback — green family
      return {
        DEFAULT: scale[500],
        foreground: scale[50],
        subtle: scale[50],
        subtleForeground: scale[700],
        border: scale[300],
        hover: scale[600],
        active: scale[700],
      };

    case 'warning':
      // Amber/yellow — darker foreground because light shades have poor contrast
      return {
        DEFAULT: scale[400],
        foreground: scale[950],
        subtle: scale[50],
        subtleForeground: scale[700],
        border: scale[300],
        hover: scale[500],
        active: scale[600],
      };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a SemanticColorMap from a set of role → ColorScale mappings.
 *
 * @param scales - Object mapping each SemanticRole to its ColorScale
 * @returns SemanticColorMap with all token values populated
 *
 * @example
 * ```ts
 * const map = buildSemanticMap({
 *   primary:     generateScale(275, 0.18),  // violet
 *   secondary:   generateNeutralScale(),
 *   destructive: generateScale(25, 0.18),   // red
 *   muted:       generateNeutralScale(),
 *   success:     generateScale(145, 0.15),  // green
 *   warning:     generateScale(75, 0.14),   // amber
 *   info:        generateScale(245, 0.16),  // blue
 * });
 * ```
 */
export function buildSemanticMap(scales: Record<SemanticRole, ColorScale>): SemanticColorMap {
  const result = {} as SemanticColorMap;
  for (const role of Object.keys(scales) as SemanticRole[]) {
    result[role] = mapRole(scales[role], role);
  }
  return result;
}

/**
 * Convert a SemanticColorMap to a flat object of CSS custom property name → value.
 *
 * @param map - Semantic color map
 * @param prefix - CSS variable prefix. Default: '--color'
 * @returns Object of { '--color-primary': 'oklch(...)', ... }
 *
 * @example
 * ```ts
 * const vars = semanticMapToCSSVars(map);
 * // { '--color-primary': 'oklch(0.550 0.1800 275.0)', '--color-primary-foreground': 'oklch(...)' }
 * ```
 */
export function semanticMapToCSSVars(
  map: SemanticColorMap,
  prefix = '--color'
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [role, tokens] of Object.entries(map) as Array<[SemanticRole, SemanticTokens]>) {
    for (const [tokenName, value] of Object.entries(tokens)) {
      const varName =
        tokenName === 'DEFAULT' ? `${prefix}-${role}` : `${prefix}-${role}-${tokenName}`;
      vars[varName] = value;
    }
  }
  return vars;
}

/**
 * Default hue and chroma assignments for each semantic role.
 * These are the conventional design system color assignments.
 * Override any role when calling buildSemanticMap().
 */
export const DEFAULT_SEMANTIC_HUES: Record<SemanticRole, { hue: number; chroma: number }> = {
  primary: { hue: 275, chroma: 0.18 }, // Violet — brand identity
  secondary: { hue: 260, chroma: 0.03 }, // Cool gray — neutral surfaces
  destructive: { hue: 25, chroma: 0.18 }, // Red-orange — error / delete
  muted: { hue: 260, chroma: 0.02 }, // Neutral — disabled / placeholder
  success: { hue: 145, chroma: 0.15 }, // Green — confirmation
  warning: { hue: 75, chroma: 0.14 }, // Amber — caution
  info: { hue: 245, chroma: 0.16 }, // Blue — informational
};

/**
 * Build a SemanticColorMap using the default hue/chroma assignments.
 * Customize by overriding specific roles.
 *
 * @param overrides - Partial map of roles to override with custom scales
 */
export function buildDefaultSemanticMap(
  overrides: Partial<Record<SemanticRole, ColorScale>> = {}
): SemanticColorMap {
  const scales = {} as Record<SemanticRole, ColorScale>;
  for (const [role, { hue, chroma }] of Object.entries(DEFAULT_SEMANTIC_HUES) as Array<
    [SemanticRole, { hue: number; chroma: number }]
  >) {
    scales[role] = overrides[role] ?? generateScale(hue, chroma);
  }
  return buildSemanticMap(scales);
}
