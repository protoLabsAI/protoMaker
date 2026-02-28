/**
 * Group renderer - layout only, no fill
 */

import type { PenGroup } from '@protolabs-ai/types';
import { PenNodeRenderer } from './pen-node-renderer';
import { layoutToFlexDirection } from './style-utils';
import type { CSSProperties } from 'react';

interface PenGroupRendererProps {
  node: PenGroup;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/**
 * Renders a group node as a div with layout only (no background/fill)
 * Note: PenGroup does not have layout properties in the type system,
 * but parsed data may include them. We access them via type-safe casts.
 */
export function PenGroupRenderer({ node, onClick, style: externalStyle }: PenGroupRendererProps) {
  // Access optional layout properties that may exist on parsed data
  const nodeAny = node as PenGroup & {
    layoutMode?: string;
    itemSpacing?: number;
    clipsContent?: boolean;
  };

  const style: CSSProperties = {
    position: nodeAny.layoutMode === 'none' ? 'relative' : undefined,
    display: nodeAny.layoutMode !== 'none' ? 'flex' : undefined,
    boxSizing: 'border-box',
  };

  // Layout direction
  const flexDirection = layoutToFlexDirection(
    nodeAny.layoutMode as 'none' | 'horizontal' | 'vertical' | undefined
  );
  if (flexDirection) {
    style.flexDirection = flexDirection as 'row' | 'column';
  }

  // Gap (itemSpacing)
  if (nodeAny.itemSpacing !== undefined && nodeAny.layoutMode !== 'none') {
    style.gap = `${nodeAny.itemSpacing}px`;
  }

  // Width and height from bounds
  if (node.bounds) {
    style.width = `${node.bounds.width}px`;
    style.height = `${node.bounds.height}px`;
  }

  // Opacity (node-level)
  if (node.opacity !== undefined && node.opacity < 1) {
    style.opacity = node.opacity;
  }

  // Clip content (overflow:hidden)
  if (nodeAny.clipsContent) {
    style.overflow = 'hidden';
  }

  // Transform
  if (node.transform) {
    const t = node.transform;
    style.transform = `matrix(${t.a}, ${t.b}, ${t.c}, ${t.d}, ${t.tx}, ${t.ty})`;
  }

  // Render children recursively
  return (
    <div
      style={{ ...style, ...externalStyle }}
      data-node-id={node.id}
      data-node-type="group"
      onClick={onClick}
    >
      {node.children?.map((child) => (
        <PenNodeRenderer key={child.id} node={child} />
      ))}
    </div>
  );
}
