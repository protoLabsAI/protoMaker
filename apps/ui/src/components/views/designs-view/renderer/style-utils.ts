/**
 * Style utility functions for converting Pen node properties to CSS
 */

import type { PenFill, PenStroke, PenColor } from '@protolabs-ai/types';

/**
 * Variable resolver function type
 */
export type VariableResolver = (name: string) => string | number | boolean | null;

/**
 * Convert PenColor to CSS rgba string
 */
export function colorToCSS(color: string | PenColor, resolveVariable?: VariableResolver): string {
  if (typeof color === 'string') {
    // Handle theme variables (e.g., $--background)
    if (color.startsWith('$')) {
      if (resolveVariable) {
        const resolved = resolveVariable(color);
        if (resolved !== null && typeof resolved === 'string') {
          return resolved;
        }
      }
      // Fallback to CSS variable syntax
      return `var(--${color.slice(1)})`;
    }
    // Already a hex or CSS color string
    return color;
  }
  // Convert RGBA object to CSS rgba()
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

/**
 * Convert PenFill to CSS background
 */
export function fillToCSS(fill: PenFill, resolveVariable?: VariableResolver): string {
  switch (fill.type) {
    case 'solid': {
      const color = colorToCSS(fill.color, resolveVariable);
      const opacity = fill.opacity ?? 1;
      if (opacity < 1) {
        // Apply opacity to the color
        if (color.startsWith('var(')) {
          // For CSS variables, we need to use opacity on the element
          return color;
        }
        return color; // Opacity will be handled separately
      }
      return color;
    }
    case 'gradient': {
      const stops = fill.stops
        .map((stop) => `${colorToCSS(stop.color, resolveVariable)} ${stop.position * 100}%`)
        .join(', ');

      if (fill.gradientType === 'linear') {
        // Default to top-to-bottom if no start/end specified
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
      // Image fills would need asset resolution - for now return a placeholder
      return `url(${fill.imageRef})`;
    }
    default:
      return 'transparent';
  }
}

/**
 * Calculate gradient angle from start/end points
 */
function calculateGradientAngle(
  start: { x: number; y: number },
  end: { x: number; y: number }
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  return angle;
}

/**
 * Convert PenStroke to CSS border
 */
export function strokeToCSS(
  stroke: PenStroke,
  resolveVariable?: VariableResolver
): {
  borderWidth: string;
  borderStyle: string;
  borderColor: string;
} {
  const color = colorToCSS(stroke.color, resolveVariable);
  const width = `${stroke.width}px`;
  const style = stroke.dashPattern ? 'dashed' : 'solid';

  return {
    borderWidth: width,
    borderStyle: style,
    borderColor: color,
  };
}

/**
 * Convert width/height to CSS size
 * - number → 'Npx'
 * - 'fill_container' → flex: 1
 * - 'fit_content' → 'auto'
 */
export function sizeToCSS(
  size: number | 'fill_container' | 'fit_content' | undefined,
  isFlex: boolean
): { size?: string; flex?: string } {
  if (size === undefined) {
    return {};
  }

  if (size === 'fill_container') {
    return { flex: '1' };
  }

  if (size === 'fit_content') {
    return { size: 'auto' };
  }

  if (typeof size === 'number') {
    return { size: `${size}px` };
  }

  return {};
}

/**
 * Convert padding to CSS
 */
export function paddingToCSS(
  padding: number | { top?: number; right?: number; bottom?: number; left?: number } | undefined
): string {
  if (padding === undefined) {
    return '0';
  }

  if (typeof padding === 'number') {
    return `${padding}px`;
  }

  const top = padding.top ?? 0;
  const right = padding.right ?? 0;
  const bottom = padding.bottom ?? 0;
  const left = padding.left ?? 0;

  return `${top}px ${right}px ${bottom}px ${left}px`;
}

/**
 * Get flexbox direction from layout mode
 */
export function layoutToFlexDirection(
  layout: 'none' | 'horizontal' | 'vertical' | undefined
): string | undefined {
  if (!layout || layout === 'none') {
    return undefined;
  }
  return layout === 'vertical' ? 'column' : 'row';
}
