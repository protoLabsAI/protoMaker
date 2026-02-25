/**
 * Icon renderer with Lucide React icon support
 */

import type { PenIconFont } from '@protolabs-ai/types';
import { fillToCSS, colorToCSS } from './style-utils';
import type { CSSProperties } from 'react';
import * as LucideIcons from 'lucide-react';

interface PenIconRendererProps {
  node: PenIconFont;
}

/**
 * Renders an icon font node as a Lucide React icon (if fontFamily is 'lucide')
 * or as a Unicode character from the specified font
 */
export function PenIconRenderer({ node }: PenIconRendererProps) {
  const style: CSSProperties = {
    position: 'relative',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  // Icon color from fills
  let iconColor: string | undefined;
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0];
    iconColor = fillToCSS(fill);
    if (fill.opacity !== undefined && fill.opacity < 1) {
      style.opacity = fill.opacity;
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

  // Bounds (if specified)
  if (node.bounds) {
    style.width = `${node.bounds.width}px`;
    style.height = `${node.bounds.height}px`;
  }

  // Handle Lucide icons
  if (node.fontFamily.toLowerCase() === 'lucide') {
    // Map character (icon name) to Lucide component
    const iconName = node.character;
    const IconComponent = (
      LucideIcons as Record<
        string,
        React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
      >
    )[iconName];

    if (IconComponent) {
      // Calculate stroke width from strokes if present
      let strokeWidth: number | undefined;
      if (node.strokes && node.strokes.length > 0) {
        strokeWidth = node.strokes[0].width;
      }

      return (
        <div style={style} data-node-id={node.id} data-node-type="icon-font">
          <IconComponent size={node.fontSize} color={iconColor} strokeWidth={strokeWidth} />
        </div>
      );
    }

    // Fallback if icon not found
    return (
      <div style={style} data-node-id={node.id} data-node-type="icon-font">
        <span style={{ fontSize: `${node.fontSize}px`, color: iconColor }}>[{iconName}]</span>
      </div>
    );
  }

  // Handle generic icon fonts (Unicode characters)
  style.fontSize = `${node.fontSize}px`;
  style.fontFamily = node.fontFamily;
  style.color = iconColor;

  // Text stroke (outline) for icon fonts
  if (node.strokes && node.strokes.length > 0) {
    const stroke = node.strokes[0];
    const strokeColor = colorToCSS(stroke.color);
    style.WebkitTextStroke = `${stroke.width}px ${strokeColor}`;
  }

  return (
    <div style={style} data-node-id={node.id} data-node-type="icon-font">
      {node.character}
    </div>
  );
}
