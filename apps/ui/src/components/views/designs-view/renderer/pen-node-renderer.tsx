/**
 * Recursive node renderer that dispatches to specific node type renderers
 */

import type { PenNode } from '@protolabs-ai/types';
import { useDesignsStore } from '@/store/designs-store';
import { PenFrameRenderer } from './pen-frame-renderer';
import { PenGroupRenderer } from './pen-group-renderer';
import { PenTextRenderer } from './pen-text-renderer';
import { PenIconRenderer } from './pen-icon-renderer';
import { PenRefRenderer } from './pen-ref-renderer';
import { PenShapeRenderer } from './pen-shape-renderer';

interface PenNodeRendererProps {
  node: PenNode;
}

/**
 * Main node renderer that dispatches based on node type
 */
export function PenNodeRenderer({ node }: PenNodeRendererProps) {
  const { selectedNodeId, setSelectedNode } = useDesignsStore();
  const isSelected = selectedNodeId === node.id;

  // Handle visibility
  if (node.visible === false) {
    return null;
  }

  // Click handler to select node
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNode(node.id);
  };

  // Wrapper style for selection outline
  const wrapperStyle = isSelected
    ? {
        outline: '2px solid var(--pen-node-selection-outline)',
        outlineOffset: '2px',
      }
    : undefined;

  // Dispatch to specific renderer based on type
  switch (node.type) {
    case 'frame':
      return <PenFrameRenderer node={node} onClick={handleClick} style={wrapperStyle} />;
    case 'group':
      return <PenGroupRenderer node={node} onClick={handleClick} style={wrapperStyle} />;
    case 'text':
      return <PenTextRenderer node={node} onClick={handleClick} style={wrapperStyle} />;
    case 'icon-font':
      return <PenIconRenderer node={node} onClick={handleClick} style={wrapperStyle} />;
    case 'ref':
      return <PenRefRenderer node={node} onClick={handleClick} style={wrapperStyle} />;
    case 'rectangle':
    case 'ellipse':
      return <PenShapeRenderer node={node} onClick={handleClick} style={wrapperStyle} />;
    case 'line':
    case 'polygon':
    case 'path':
    case 'image':
    case 'vector':
    case 'instance':
      // Placeholder for other node types - will be implemented in future features
      return (
        <div
          onClick={handleClick}
          style={{
            padding: '8px',
            background: 'var(--pen-node-placeholder-bg)',
            border: '1px dashed var(--pen-node-placeholder-border)',
            borderRadius: '4px',
            ...wrapperStyle,
          }}
        >
          {node.type} ({node.name || node.id})
        </div>
      );
    default:
      console.warn('Unknown node type:', (node as PenNode).type);
      return null;
  }
}
