/**
 * Layout-to-CSS converter for .pen files.
 *
 * Converts PEN layout properties (layout, gap, padding, sizing, etc.)
 * into CSS flexbox styles. The .pen layout model maps directly to CSS
 * flexbox with minimal translation.
 */

import type {
  PenNode,
  PenFrame,
  PenText,
  PenRectangle,
  PenEllipse,
  PenIconFont,
  PenRef,
  PenStroke,
  PenSize,
  PenPadding,
  PenCornerRadius,
  PenStrokeThickness,
  PenLayoutMode,
  ResolvedStyles,
} from './types.js';

/**
 * Convert a PEN size value to CSS.
 *
 * - number → "{n}px"
 * - "fill_container" → flex: 1
 * - "fill_container(min)" → flex: 1, minWidth/minHeight: min
 * - "fit_content" → auto
 * - "fit_content(max)" → auto with maxWidth/maxHeight
 */
export function convertSize(
  size: PenSize | undefined,
  dimension: 'width' | 'height'
): Partial<ResolvedStyles> {
  if (size === undefined) return {};

  if (typeof size === 'number') {
    return { [dimension]: `${size}px` };
  }

  if (size === 'fill_container') {
    return { flex: '1', [dimension]: '100%' };
  }

  // fill_container(min) — e.g., "fill_container(200)"
  const fillMatch = size.match(/^fill_container\((\d+)\)$/);
  if (fillMatch) {
    const min = fillMatch[1];
    const minProp = dimension === 'width' ? 'minWidth' : 'minHeight';
    return { flex: '1', [minProp]: `${min}px` };
  }

  if (size === 'fit_content') {
    return {}; // auto is default
  }

  // fit_content(max) — e.g., "fit_content(300)"
  const fitMatch = size.match(/^fit_content\((\d+)\)$/);
  if (fitMatch) {
    const max = fitMatch[1];
    const maxProp = dimension === 'width' ? 'maxWidth' : 'maxHeight';
    return { [maxProp]: `${max}px` };
  }

  return {};
}

/**
 * Convert PEN padding to CSS padding string.
 *
 * - number → "Npx" (uniform)
 * - [v, h] → "Vpx Hpx"
 * - [t, r, b, l] → "Tpx Rpx Bpx Lpx"
 */
export function convertPadding(padding: PenPadding | undefined): string | undefined {
  if (padding === undefined) return undefined;

  if (typeof padding === 'number') {
    return `${padding}px`;
  }

  if (Array.isArray(padding)) {
    if (padding.length === 2) {
      return `${padding[0]}px ${padding[1]}px`;
    }
    if (padding.length === 4) {
      return `${padding[0]}px ${padding[1]}px ${padding[2]}px ${padding[3]}px`;
    }
  }

  return undefined;
}

/**
 * Convert PEN corner radius to CSS border-radius string.
 *
 * - number → "Npx"
 * - [tl, tr, br, bl] → "TLpx TRpx BRpx BLpx"
 */
export function convertCornerRadius(radius: PenCornerRadius | undefined): string | undefined {
  if (radius === undefined) return undefined;

  if (typeof radius === 'number') {
    return `${radius}px`;
  }

  if (Array.isArray(radius) && radius.length === 4) {
    return `${radius[0]}px ${radius[1]}px ${radius[2]}px ${radius[3]}px`;
  }

  return undefined;
}

/**
 * Convert PEN justify-content values to CSS.
 */
function convertJustifyContent(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const map: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    space_between: 'space-between',
    space_around: 'space-around',
    space_evenly: 'space-evenly',
  };

  return map[value] ?? undefined;
}

/**
 * Convert PEN align-items values to CSS.
 */
function convertAlignItems(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const map: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch',
    baseline: 'baseline',
  };

  return map[value] ?? undefined;
}

/**
 * Convert PEN stroke to CSS border properties.
 *
 * @param stroke - The stroke definition
 * @param resolveFill - Function to resolve variable references in fill colors
 */
export function convertStroke(
  stroke: PenStroke | undefined,
  resolveFill: (fill: unknown) => string | undefined
): Partial<ResolvedStyles> {
  if (!stroke) return {};

  const color = stroke.fill ? (resolveFill(stroke.fill) ?? 'transparent') : 'transparent';
  const thickness = stroke.thickness;

  if (thickness === undefined) return {};

  if (typeof thickness === 'number') {
    return { border: `${thickness}px solid ${color}` };
  }

  // Per-side thickness
  const result: Partial<ResolvedStyles> = {};
  if (thickness.top) result.borderTop = `${thickness.top}px solid ${color}`;
  if (thickness.right) result.borderRight = `${thickness.right}px solid ${color}`;
  if (thickness.bottom) result.borderBottom = `${thickness.bottom}px solid ${color}`;
  if (thickness.left) result.borderLeft = `${thickness.left}px solid ${color}`;

  return result;
}

/**
 * Convert a PEN frame node to CSS styles.
 *
 * @param frame - The frame node
 * @param resolveFill - Variable resolver function
 * @param parentLayout - The parent node's layout mode (determines if this node is absolutely positioned)
 */
export function convertFrameLayout(
  frame: PenFrame,
  resolveFill: (fill: unknown) => string | undefined,
  parentLayout?: PenLayoutMode
): ResolvedStyles {
  const styles: ResolvedStyles = {
    boxSizing: 'border-box',
  };

  // Layout mode → flexbox (controls how THIS node's children are arranged)
  if (frame.layout === 'vertical') {
    styles.display = 'flex';
    styles.flexDirection = 'column';
  } else if (frame.layout === 'horizontal') {
    styles.display = 'flex';
    styles.flexDirection = 'row';
  } else if (frame.layout === 'none') {
    // This frame uses absolute positioning for its children
    styles.position = 'relative';
  }

  // Absolute positioning: if parent uses layout: none (or top-level), position with x/y
  if (parentLayout === 'none' || parentLayout === undefined) {
    if (frame.x !== undefined || frame.y !== undefined) {
      styles.position = 'absolute';
      if (frame.x !== undefined) styles.left = `${frame.x}px`;
      if (frame.y !== undefined) styles.top = `${frame.y}px`;
    }
  }

  // Gap
  if (frame.gap !== undefined) {
    styles.gap = `${frame.gap}px`;
  }

  // Padding
  const padding = convertPadding(frame.padding);
  if (padding) styles.padding = padding;

  // Justify & align
  const jc = convertJustifyContent(frame.justifyContent);
  if (jc) styles.justifyContent = jc;

  const ai = convertAlignItems(frame.alignItems);
  if (ai) styles.alignItems = ai;

  // Sizing
  Object.assign(styles, convertSize(frame.width, 'width'));
  Object.assign(styles, convertSize(frame.height, 'height'));

  // Background color
  if (frame.fill) {
    const color = resolveFill(frame.fill);
    if (color) styles.backgroundColor = color;
  }

  // Corner radius
  const radius = convertCornerRadius(frame.cornerRadius);
  if (radius) styles.borderRadius = radius;

  // Stroke → border
  Object.assign(styles, convertStroke(frame.stroke, resolveFill));

  // Clip
  if (frame.clip) {
    styles.overflow = 'hidden';
  }

  // Opacity
  if (frame.opacity !== undefined && frame.opacity !== 1) {
    styles.opacity = String(frame.opacity);
  }

  // Rotation
  if (frame.rotation) {
    styles.transform = `rotate(${frame.rotation}deg)`;
  }

  return styles;
}

/**
 * Convert a PEN text node to CSS styles.
 */
export function convertTextLayout(
  text: PenText,
  resolveFill: (fill: unknown) => string | undefined
): ResolvedStyles {
  const styles: ResolvedStyles = {};

  // Text color (uses fill property in .pen)
  if (text.fill) {
    const color = resolveFill(text.fill);
    if (color) styles.color = color;
  }

  // Typography
  if (text.fontFamily) {
    const resolved = resolveFill(text.fontFamily);
    styles.fontFamily = resolved ?? text.fontFamily;
  }
  if (text.fontSize) styles.fontSize = `${text.fontSize}px`;
  if (text.fontWeight) styles.fontWeight = text.fontWeight;
  if (text.fontStyle) styles.fontStyle = text.fontStyle;
  if (text.lineHeight !== undefined) {
    styles.lineHeight =
      typeof text.lineHeight === 'number' ? String(text.lineHeight) : text.lineHeight;
  }
  if (text.letterSpacing !== undefined) {
    styles.letterSpacing = `${text.letterSpacing}px`;
  }
  if (text.textAlign) styles.textAlign = text.textAlign;
  if (text.textDecoration && text.textDecoration !== 'none') {
    styles.textDecoration = text.textDecoration;
  }
  if (text.textTransform && text.textTransform !== 'none') {
    styles.textTransform = text.textTransform;
  }

  // Sizing
  Object.assign(styles, convertSize(text.width, 'width'));
  Object.assign(styles, convertSize(text.height, 'height'));

  return styles;
}

/**
 * Convert any PEN node to CSS styles.
 *
 * @param node - The node to convert
 * @param resolveFill - Variable resolver function
 * @param parentLayout - The parent node's layout mode
 */
export function convertNodeToStyles(
  node: PenNode,
  resolveFill: (fill: unknown) => string | undefined,
  parentLayout?: PenLayoutMode
): ResolvedStyles {
  switch (node.type) {
    case 'frame':
      return convertFrameLayout(node as PenFrame, resolveFill, parentLayout);
    case 'text': {
      const textStyles = convertTextLayout(node as PenText, resolveFill);
      applyAbsolutePosition(node, textStyles, parentLayout);
      return textStyles;
    }
    case 'rectangle': {
      const rect = node as PenRectangle;
      const styles: ResolvedStyles = { boxSizing: 'border-box' };
      Object.assign(styles, convertSize(rect.width, 'width'));
      Object.assign(styles, convertSize(rect.height, 'height'));
      if (rect.fill) {
        const color = resolveFill(rect.fill);
        if (color) styles.backgroundColor = color;
      }
      const radius = convertCornerRadius(rect.cornerRadius);
      if (radius) styles.borderRadius = radius;
      Object.assign(styles, convertStroke(rect.stroke, resolveFill));
      applyAbsolutePosition(node, styles, parentLayout);
      return styles;
    }
    case 'ellipse': {
      const ellipse = node as PenEllipse;
      const styles: ResolvedStyles = {
        boxSizing: 'border-box',
        borderRadius: '50%',
      };
      Object.assign(styles, convertSize(ellipse.width, 'width'));
      Object.assign(styles, convertSize(ellipse.height, 'height'));
      if (ellipse.fill) {
        const color = resolveFill(ellipse.fill);
        if (color) styles.backgroundColor = color;
      }
      Object.assign(styles, convertStroke(ellipse.stroke, resolveFill));
      applyAbsolutePosition(node, styles, parentLayout);
      return styles;
    }
    case 'icon_font': {
      const icon = node as PenIconFont;
      const styles: ResolvedStyles = {};
      Object.assign(styles, convertSize(icon.width, 'width'));
      Object.assign(styles, convertSize(icon.height, 'height'));
      if (icon.fill) {
        const color = resolveFill(icon.fill);
        if (color) styles.color = color;
      }
      applyAbsolutePosition(node, styles, parentLayout);
      return styles;
    }
    default:
      return {};
  }
}

/**
 * Apply absolute positioning for nodes inside layout:none parents.
 */
function applyAbsolutePosition(
  node: PenNode,
  styles: ResolvedStyles,
  parentLayout?: PenLayoutMode
): void {
  if (parentLayout === 'none' || parentLayout === undefined) {
    if (node.x !== undefined || node.y !== undefined) {
      styles.position = 'absolute';
      if (node.x !== undefined) styles.left = `${node.x}px`;
      if (node.y !== undefined) styles.top = `${node.y}px`;
    }
  }
}
