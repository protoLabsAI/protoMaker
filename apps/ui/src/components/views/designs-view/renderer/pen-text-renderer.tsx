/**
 * Text renderer with font properties and styling
 */

import type { PenText } from '@protolabs-ai/types';
import { fillToCSS, colorToCSS } from './style-utils';
import type { CSSProperties } from 'react';

interface PenTextRendererProps {
  node: PenText;
}

/**
 * Renders a text node with font properties, alignment, and color
 */
export function PenTextRenderer({ node }: PenTextRendererProps) {
  const style: CSSProperties = {
    position: 'relative',
    boxSizing: 'border-box',
  };

  // Font properties
  style.fontSize = `${node.fontSize}px`;
  style.fontFamily = node.fontFamily;

  if (node.fontWeight !== undefined) {
    style.fontWeight = node.fontWeight;
  }

  if (node.fontStyle !== undefined) {
    style.fontStyle = node.fontStyle;
  }

  // Text alignment
  if (node.textAlign !== undefined) {
    style.textAlign = node.textAlign;
  }

  // Text decoration
  if (node.textDecoration !== undefined) {
    style.textDecoration = node.textDecoration;
  }

  // Line height
  if (node.lineHeight !== undefined) {
    style.lineHeight =
      typeof node.lineHeight === 'number' ? `${node.lineHeight}px` : node.lineHeight;
  }

  // Letter spacing
  if (node.letterSpacing !== undefined) {
    style.letterSpacing = `${node.letterSpacing}px`;
  }

  // Text color from fills
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0]; // Use first fill for text color
    style.color = fillToCSS(fill);
    if (fill.opacity !== undefined && fill.opacity < 1) {
      style.opacity = fill.opacity;
    }
  }

  // Text stroke (outline)
  if (node.strokes && node.strokes.length > 0) {
    const stroke = node.strokes[0];
    const strokeColor = colorToCSS(stroke.color);
    style.WebkitTextStroke = `${stroke.width}px ${strokeColor}`;
  }

  // Node-level opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    style.opacity = node.opacity;
  }

  // Transform
  if (node.transform) {
    const t = node.transform;
    style.transform = `matrix(${t.a}, ${t.b}, ${t.c}, ${t.d}, ${t.tx}, ${t.ty})`;
  }

  // Bounds (if specified)
  if (node.bounds) {
    style.width = `${node.bounds.width}px`;
    style.height = `${node.bounds.height}px`;
  }

  return (
    <div style={style} data-node-id={node.id} data-node-type="text">
      {node.content}
    </div>
  );
}
