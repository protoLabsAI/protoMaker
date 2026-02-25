/**
 * Frame renderer with flexbox layout support
 */

import type { PenFrame } from '@protolabs-ai/types';
import { PenNodeRenderer } from './pen-node-renderer';
import { fillToCSS, strokeToCSS, paddingToCSS, layoutToFlexDirection } from './style-utils';
import { usePenTheme } from './pen-theme-context';
import { DropZone } from '../dnd/drop-zone';
import { SortableNode } from '../dnd/sortable-node';
import { SortableItem } from '../dnd/sortable-item';
import type { CSSProperties } from 'react';

interface PenFrameRendererProps {
  node: PenFrame;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/**
 * Renders a frame node as a div with CSS flexbox layout
 */
export function PenFrameRenderer({ node, onClick, style: externalStyle }: PenFrameRendererProps) {
  const { resolveVariable } = usePenTheme();

  const style: CSSProperties = {
    position: node.layoutMode === 'none' ? 'relative' : undefined,
    display: node.layoutMode !== 'none' ? 'flex' : undefined,
    boxSizing: 'border-box',
  };

  // Layout direction
  const flexDirection = layoutToFlexDirection(node.layoutMode);
  if (flexDirection) {
    style.flexDirection = flexDirection as 'row' | 'column';
  }

  // Gap (itemSpacing)
  if (node.itemSpacing !== undefined && node.layoutMode !== 'none') {
    style.gap = `${node.itemSpacing}px`;
  }

  // Padding (handle both uniform and per-side)
  const paddingTop = node.paddingTop ?? 0;
  const paddingRight = node.paddingRight ?? 0;
  const paddingBottom = node.paddingBottom ?? 0;
  const paddingLeft = node.paddingLeft ?? 0;

  if (paddingTop || paddingRight || paddingBottom || paddingLeft) {
    style.padding = `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`;
  }

  // Width and height from bounds
  if (node.bounds) {
    style.width = `${node.bounds.width}px`;
    style.height = `${node.bounds.height}px`;
  }

  // Corner radius
  if (node.cornerRadius !== undefined) {
    style.borderRadius = `${node.cornerRadius}px`;
  }

  // Fills (background)
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0]; // Use first fill for now
    style.background = fillToCSS(fill, resolveVariable);
    if (fill.opacity !== undefined && fill.opacity < 1) {
      // Apply fill opacity to background
      style.opacity = fill.opacity;
    }
  }

  // Strokes (border)
  if (node.strokes && node.strokes.length > 0) {
    const stroke = node.strokes[0]; // Use first stroke for now
    const borderStyle = strokeToCSS(stroke, resolveVariable);
    style.borderWidth = borderStyle.borderWidth;
    style.borderStyle = borderStyle.borderStyle;
    style.borderColor = borderStyle.borderColor;
  }

  // Opacity (node-level)
  if (node.opacity !== undefined && node.opacity < 1) {
    style.opacity = node.opacity;
  }

  // Clip content (overflow:hidden)
  if (node.clipsContent) {
    style.overflow = 'hidden';
  }

  // Transform
  if (node.transform) {
    const t = node.transform;
    style.transform = `matrix(${t.a}, ${t.b}, ${t.c}, ${t.d}, ${t.tx}, ${t.ty})`;
  }

  // Check if this frame is a valid drop target (has layout)
  const isValidDropTarget = node.layoutMode !== 'none';

  // Determine if children should be sortable (frame has layout mode)
  const isSortable = node.layoutMode !== 'none';

  // Render children recursively
  const frameContent = (
    <div
      style={{ ...style, ...externalStyle }}
      data-node-id={node.id}
      data-node-type="frame"
      onClick={onClick}
    >
      <SortableNode frame={node}>
        {node.children?.map((child) =>
          isSortable ? (
            <SortableItem key={child.id} id={child.id}>
              <PenNodeRenderer node={child} />
            </SortableItem>
          ) : (
            <PenNodeRenderer key={child.id} node={child} />
          )
        )}
      </SortableNode>
    </div>
  );

  // Wrap with DropZone if this frame accepts drops
  if (isValidDropTarget) {
    return (
      <DropZone frameId={node.id} isValidTarget={isValidDropTarget}>
        {frameContent}
      </DropZone>
    );
  }

  return frameContent;
}
