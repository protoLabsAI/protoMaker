/**
 * Shape renderer for rectangles and ellipses
 */

import type { PenRectangle, PenEllipse } from '@protolabs-ai/types';
import { fillToCSS, colorToCSS } from './style-utils';
import type { CSSProperties } from 'react';

interface PenShapeRendererProps {
  node: PenRectangle | PenEllipse;
}

/**
 * Renders rectangle and ellipse shapes with fills and strokes
 */
export function PenShapeRenderer({ node }: PenShapeRendererProps) {
  const style: CSSProperties = {
    position: 'relative',
    boxSizing: 'border-box',
  };

  // Bounds
  if (node.bounds) {
    style.width = `${node.bounds.width}px`;
    style.height = `${node.bounds.height}px`;
  }

  // Background fills
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0]; // Use first fill
    style.background = fillToCSS(fill);
    if (fill.opacity !== undefined && fill.opacity < 1) {
      style.opacity = fill.opacity;
    }
  }

  // Strokes
  if (node.strokes && node.strokes.length > 0) {
    const stroke = node.strokes[0];
    const strokeColor = colorToCSS(stroke.color);
    style.border = `${stroke.width}px solid ${strokeColor}`;
    if (stroke.opacity !== undefined && stroke.opacity < 1) {
      style.borderColor = `${strokeColor.replace(')', `, ${stroke.opacity})`).replace('rgb', 'rgba')}`;
    }
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

  // Shape-specific styles
  if (node.type === 'RECTANGLE') {
    // Corner radius for rectangles
    if (node.cornerRadius !== undefined) {
      if (typeof node.cornerRadius === 'number') {
        style.borderRadius = `${node.cornerRadius}px`;
      } else if (Array.isArray(node.cornerRadius)) {
        // Individual corner radii [topLeft, topRight, bottomRight, bottomLeft]
        const [tl, tr, br, bl] = node.cornerRadius;
        style.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
      }
    }
  } else if (node.type === 'ELLIPSE') {
    // Ellipses are always rounded
    style.borderRadius = '50%';
  }

  return <div style={style} data-node-id={node.id} data-node-type={node.type.toLowerCase()} />;
}
