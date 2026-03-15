/**
 * css-extractor.ts
 *
 * Extracts CSS properties from PenNode styling fields.
 * Handles fills, strokes, layout, padding, corner radius, opacity,
 * and $--variable references → CSS custom properties.
 */

// ============================================================================
// Minimal local types (structural compatibility with pen.ts)
// ============================================================================

interface LocalFill {
  type: 'solid' | 'gradient' | 'image';
  color?: string;
  opacity?: number;
  gradientType?: 'linear' | 'radial';
  stops?: Array<{ position: number; color: string }>;
  imageRef?: string;
}

interface LocalStroke {
  color: string;
  width: number;
  opacity?: number;
}

interface StyledNode {
  fills?: LocalFill[];
  strokes?: LocalStroke[];
  cornerRadius?: number;
  opacity?: number;
  layoutMode?: 'none' | 'horizontal' | 'vertical';
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  clipsContent?: boolean;
}

// ============================================================================
// Fill → CSS
// ============================================================================

/**
 * Resolve a color string.  If it starts with '$', treat it as a CSS variable
 * reference: '$--primary' → 'var(--primary)'.
 */
export function resolveColor(color: string): string {
  if (color.startsWith('$')) {
    return `var(${color.slice(1)})`;
  }
  return color;
}

/**
 * Convert a single fill definition to a CSS background-* value string.
 */
export function fillToCSS(fill: LocalFill): string {
  switch (fill.type) {
    case 'solid': {
      const color = fill.color ? resolveColor(fill.color) : 'transparent';
      if (fill.opacity !== undefined && fill.opacity < 1) {
        return `color-mix(in srgb, ${color} ${Math.round(fill.opacity * 100)}%, transparent)`;
      }
      return color;
    }
    case 'gradient': {
      if (!fill.stops || fill.stops.length === 0) return 'none';
      const stopList = fill.stops
        .map((s) => `${resolveColor(s.color)} ${Math.round(s.position * 100)}%`)
        .join(', ');
      const gradFn = fill.gradientType === 'radial' ? 'radial-gradient' : 'linear-gradient';
      const direction = fill.gradientType === 'radial' ? 'circle' : 'to bottom';
      return `${gradFn}(${direction}, ${stopList})`;
    }
    case 'image': {
      return fill.imageRef ? `url(${fill.imageRef})` : 'none';
    }
    default:
      return 'none';
  }
}

/**
 * Convert an array of fills to a CSS background shorthand.
 * Multiple fills are layered (first fill = topmost layer).
 */
export function fillsToBackgroundCSS(fills: LocalFill[]): string {
  if (!fills || fills.length === 0) return '';
  const values = fills.map(fillToCSS).filter(Boolean);
  return values.join(', ');
}

// ============================================================================
// Stroke → CSS border
// ============================================================================

/**
 * Convert a stroke definition to CSS border properties.
 */
export function strokeToCSS(stroke: LocalStroke): Record<string, string> {
  const color = resolveColor(stroke.color);
  const opacity =
    stroke.opacity !== undefined && stroke.opacity < 1
      ? `color-mix(in srgb, ${color} ${Math.round(stroke.opacity * 100)}%, transparent)`
      : color;
  return {
    'border-width': `${stroke.width}px`,
    'border-style': 'solid',
    'border-color': opacity,
  };
}

// ============================================================================
// Layout → CSS flexbox
// ============================================================================

/**
 * Convert layoutMode + spacing to CSS flexbox properties.
 */
export function layoutToFlexCSS(
  layoutMode: 'none' | 'horizontal' | 'vertical' | undefined,
  itemSpacing?: number
): Record<string, string> {
  if (!layoutMode || layoutMode === 'none') return {};

  const styles: Record<string, string> = {
    display: 'flex',
    'flex-direction': layoutMode === 'horizontal' ? 'row' : 'column',
  };

  if (itemSpacing !== undefined && itemSpacing > 0) {
    styles['gap'] = `${itemSpacing}px`;
  }

  return styles;
}

/**
 * Convert individual padding values to a CSS padding shorthand.
 */
export function paddingToCSS(top?: number, right?: number, bottom?: number, left?: number): string {
  const t = top ?? 0;
  const r = right ?? 0;
  const b = bottom ?? 0;
  const l = left ?? 0;
  if (t === r && r === b && b === l) return `${t}px`;
  if (t === b && r === l) return `${t}px ${r}px`;
  return `${t}px ${r}px ${b}px ${l}px`;
}

// ============================================================================
// Node-level style extraction
// ============================================================================

/**
 * Extract all CSS properties from a styled node as a plain string→string map.
 * Keys use kebab-case CSS property names.
 */
export function extractNodeStyles(node: StyledNode): Record<string, string> {
  const styles: Record<string, string> = {};

  // Background / fills
  if (node.fills && node.fills.length > 0) {
    const bg = fillsToBackgroundCSS(node.fills);
    if (bg) styles['background'] = bg;
  }

  // Border / stroke (first stroke wins for codegen simplicity)
  const firstStroke = node.strokes?.[0];
  if (firstStroke) {
    const borderProps = strokeToCSS(firstStroke);
    Object.assign(styles, borderProps);
  }

  // Border radius
  if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
    styles['border-radius'] = `${node.cornerRadius}px`;
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    styles['opacity'] = String(node.opacity);
  }

  // Overflow
  if (node.clipsContent) {
    styles['overflow'] = 'hidden';
  }

  // Flexbox layout
  const flexStyles = layoutToFlexCSS(node.layoutMode, node.itemSpacing);
  Object.assign(styles, flexStyles);

  // Padding
  const hasPadding = node.paddingTop || node.paddingRight || node.paddingBottom || node.paddingLeft;
  if (hasPadding) {
    styles['padding'] = paddingToCSS(
      node.paddingTop,
      node.paddingRight,
      node.paddingBottom,
      node.paddingLeft
    );
  }

  return styles;
}

/**
 * Extract all $--variable references found in a node's styling properties.
 * Returns the CSS variable names (e.g. '--primary', '--text-color').
 */
export function extractCSSVariables(node: StyledNode): string[] {
  const vars = new Set<string>();

  const checkColor = (color: string): void => {
    if (color.startsWith('$')) {
      vars.add(color.slice(1)); // strip '$' → keep '--variable-name'
    }
  };

  for (const fill of node.fills ?? []) {
    if (fill.color) checkColor(fill.color);
    for (const stop of fill.stops ?? []) checkColor(stop.color);
  }

  for (const stroke of node.strokes ?? []) {
    checkColor(stroke.color);
  }

  return Array.from(vars);
}

/**
 * Convert a styles map to an inline React style object literal string.
 * e.g. { display: 'flex', gap: '8px' }
 */
export function stylesToReactObject(styles: Record<string, string>): string {
  if (Object.keys(styles).length === 0) return '{}';
  const entries = Object.entries(styles)
    .map(([k, v]) => {
      const camel = k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      return `${camel}: '${v.replace(/'/g, "\\'")}'`;
    })
    .join(', ');
  return `{ ${entries} }`;
}
