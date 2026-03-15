/**
 * Style utility functions for converting .pen node properties to CSS
 *
 * Converts PenFill, PenStroke, layout modes, padding, and size values
 * into CSS strings / style objects suitable for React inline styles.
 *
 * Zero external dependencies.
 */

import type { PenFill, PenStroke, PenColor, PenVector } from './types.js';

// ============================================================================
// Variable Resolver
// ============================================================================

/**
 * Function type that resolves a design variable reference to its CSS value.
 * Pass this from your theme context when rendering.
 */
export type VariableResolver = (name: string) => string | number | boolean | null;

// ============================================================================
// Color
// ============================================================================

/**
 * Convert a `PenColor` object or hex/variable string to a CSS color value.
 *
 * - RGBA objects → `rgba(r, g, b, a)`
 * - `$--variable` strings → resolved via `resolveVariable`, or `var(--variable)`
 * - Other strings → returned as-is
 *
 * @example
 * ```ts
 * colorToCSS({ r: 59, g: 130, b: 246, a: 1 }) // → 'rgba(59, 130, 246, 1)'
 * colorToCSS('$--primary')                      // → 'var(--primary)'
 * colorToCSS('#3B82F6')                          // → '#3B82F6'
 * ```
 */
export function colorToCSS(color: string | PenColor, resolveVariable?: VariableResolver): string {
  if (typeof color === 'string') {
    if (color.startsWith('$')) {
      if (resolveVariable) {
        const resolved = resolveVariable(color);
        if (resolved !== null && typeof resolved === 'string') {
          return resolved;
        }
      }
      // Fall back to CSS variable syntax
      return `var(--${color.slice(1)})`;
    }
    return color;
  }
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

// ============================================================================
// Fill
// ============================================================================

/**
 * Convert a `PenFill` descriptor to a CSS `background` value.
 *
 * Supports solid, linear/radial/angular gradient, and image fills.
 *
 * @example
 * ```ts
 * fillToCSS({ type: 'solid', color: '#3B82F6' })
 * // → '#3B82F6'
 *
 * fillToCSS({ type: 'gradient', gradientType: 'linear', stops: [...] })
 * // → 'linear-gradient(180deg, #fff 0%, #000 100%)'
 * ```
 */
export function fillToCSS(fill: PenFill, resolveVariable?: VariableResolver): string {
  switch (fill.type) {
    case 'solid': {
      const color = colorToCSS(fill.color, resolveVariable);
      // opacity is handled separately (element-level)
      return color;
    }

    case 'gradient': {
      const stops = fill.stops
        .map((s) => `${colorToCSS(s.color, resolveVariable)} ${s.position * 100}%`)
        .join(', ');

      if (fill.gradientType === 'linear') {
        const angle = fill.start && fill.end ? calculateGradientAngle(fill.start, fill.end) : 180;
        return `linear-gradient(${angle}deg, ${stops})`;
      }
      if (fill.gradientType === 'radial') {
        return `radial-gradient(circle, ${stops})`;
      }
      if (fill.gradientType === 'angular') {
        return `conic-gradient(from 0deg, ${stops})`;
      }
      return 'transparent';
    }

    case 'image': {
      return `url(${fill.imageRef})`;
    }

    default:
      return 'transparent';
  }
}

/**
 * Calculate CSS gradient angle from two 2-D points.
 */
function calculateGradientAngle(start: PenVector, end: PenVector): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI + 90;
}

// ============================================================================
// Stroke
// ============================================================================

/**
 * Convert a `PenStroke` descriptor to CSS border properties.
 *
 * @returns Object with `borderWidth`, `borderStyle`, `borderColor` strings
 *
 * @example
 * ```ts
 * const border = strokeToCSS({ color: '#000', width: 1 });
 * // → { borderWidth: '1px', borderStyle: 'solid', borderColor: '#000' }
 * ```
 */
export function strokeToCSS(
  stroke: PenStroke,
  resolveVariable?: VariableResolver
): {
  borderWidth: string;
  borderStyle: string;
  borderColor: string;
} {
  return {
    borderWidth: `${stroke.width}px`,
    borderStyle: stroke.dashPattern ? 'dashed' : 'solid',
    borderColor: colorToCSS(stroke.color, resolveVariable),
  };
}

// ============================================================================
// Size
// ============================================================================

/**
 * Convert a .pen node width/height value to a CSS size descriptor.
 *
 * | .pen value           | CSS result         |
 * |----------------------|--------------------|
 * | number               | `'Npx'`            |
 * | `'fill_container'`   | `{ flex: '1' }`    |
 * | `'fit_content'`      | `'auto'`           |
 * | `{ fit_content: N }` | `'auto'` + minWidth|
 *
 * @param size - Raw size value from the .pen node
 * @param _isFlex - Whether the parent is a flex container (reserved)
 */
export function sizeToCSS(
  size: number | 'fill_container' | 'fit_content' | { fit_content: number } | undefined,
  _isFlex: boolean
): { size?: string; flex?: string; minSize?: string } {
  if (size === undefined) {
    return {};
  }
  if (size === 'fill_container') {
    return { flex: '1' };
  }
  if (size === 'fit_content') {
    return { size: 'auto' };
  }
  if (typeof size === 'object' && 'fit_content' in size) {
    return { size: 'auto', minSize: `${size.fit_content}px` };
  }
  if (typeof size === 'number') {
    return { size: `${size}px` };
  }
  return {};
}

// ============================================================================
// Padding
// ============================================================================

/**
 * Convert a .pen padding value to a CSS shorthand string.
 *
 * Accepts uniform number, 2-tuple `[h, v]`, 4-tuple `[t, r, b, l]`,
 * or `{ top, right, bottom, left }` object.
 *
 * @example
 * ```ts
 * paddingToCSS(8)             // → '8px'
 * paddingToCSS([8, 16])       // → '8px 16px'
 * paddingToCSS([4, 8, 12, 0]) // → '4px 8px 12px 0px'
 * ```
 */
export function paddingToCSS(
  padding:
    | number
    | [number, number]
    | [number, number, number, number]
    | { top?: number; right?: number; bottom?: number; left?: number }
    | undefined
): string {
  if (padding === undefined) {
    return '0';
  }
  if (typeof padding === 'number') {
    return `${padding}px`;
  }
  if (Array.isArray(padding)) {
    if (padding.length === 2) {
      return `${padding[0]}px ${padding[1]}px`;
    }
    const [t, r, b, l] = padding;
    return `${t}px ${r}px ${b}px ${l}px`;
  }
  const t = padding.top ?? 0;
  const r = padding.right ?? 0;
  const b = padding.bottom ?? 0;
  const l = padding.left ?? 0;
  return `${t}px ${r}px ${b}px ${l}px`;
}

// ============================================================================
// Layout
// ============================================================================

/**
 * Convert a .pen layout mode to a CSS flexbox `flex-direction` value.
 *
 * @returns `'column'`, `'row'`, or `undefined` (for `'none'` / absolute positioning)
 *
 * @example
 * ```ts
 * layoutToFlexDirection('vertical')   // → 'column'
 * layoutToFlexDirection('horizontal') // → 'row'
 * layoutToFlexDirection('none')       // → undefined
 * ```
 */
export function layoutToFlexDirection(
  layout: 'none' | 'vertical' | 'horizontal' | undefined
): 'column' | 'row' | undefined {
  if (!layout || layout === 'none') {
    return undefined;
  }
  return layout === 'vertical' ? 'column' : 'row';
}
