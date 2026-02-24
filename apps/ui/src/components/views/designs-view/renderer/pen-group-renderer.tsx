/**
 * Group renderer - layout only, no fill
 */

import type { PenGroup } from '@protolabs-ai/types';
import { PenNodeRenderer } from './pen-node-renderer';
import { layoutToFlexDirection } from './style-utils';
import type { CSSProperties } from 'react';

interface PenGroupRendererProps {
  node: PenGroup;
}

/**
 * Renders a group node as a div with layout only (no background/fill)
 */
export function PenGroupRenderer({ node }: PenGroupRendererProps) {
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
  if (node.clipsContent) {
    style.overflow = 'hidden';
  }

  // Transform
  if (node.transform) {
    const t = node.transform;
    style.transform = `matrix(${t.a}, ${t.b}, ${t.c}, ${t.d}, ${t.tx}, ${t.ty})`;
  }

  // Render children recursively
  return (
    <div style={style} data-node-id={node.id} data-node-type="group">
      {node.children?.map((child) => (
        <PenNodeRenderer key={child.id} node={child} />
      ))}
    </div>
  );
}
