/**
 * Recursive node renderer that dispatches to specific node type renderers
 */

import type { PenNode } from '@protolabs-ai/types';
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
  // Handle visibility
  if (node.visible === false) {
    return null;
  }

  // Dispatch to specific renderer based on type
  switch (node.type) {
    case 'frame':
      return <PenFrameRenderer node={node} />;
    case 'group':
      return <PenGroupRenderer node={node} />;
    case 'text':
      return <PenTextRenderer node={node} />;
    case 'icon-font':
      return <PenIconRenderer node={node} />;
    case 'ref':
      return <PenRefRenderer node={node} />;
    case 'rectangle':
    case 'ellipse':
      return <PenShapeRenderer node={node} />;
    case 'line':
    case 'polygon':
    case 'path':
    case 'image':
    case 'vector':
    case 'instance':
      // Placeholder for other node types - will be implemented in future features
      return (
        <div
          style={{
            padding: '8px',
            background: '#f0f0f0',
            border: '1px dashed #ccc',
            borderRadius: '4px',
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
