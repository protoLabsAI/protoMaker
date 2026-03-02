/**
 * Ref renderer - resolves references to other nodes and renders with overrides
 */

import type { PenRef } from '@protolabs-ai/types';
import { usePenDocument } from './pen-document-context';
import { PenNodeRenderer } from './pen-node-renderer';
import { useMemo } from 'react';

interface PenRefRendererProps {
  node: PenRef;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

/**
 * Renders a ref node by resolving it to its source and applying overrides
 */
export function PenRefRenderer({ node, onClick, style: externalStyle }: PenRefRendererProps) {
  const { resolveRef } = usePenDocument();

  // Resolve the referenced node
  const resolvedNode = useMemo(() => {
    const sourceNode = resolveRef(node.refId);
    if (!sourceNode) {
      return null;
    }

    // Apply overrides if present
    if (node.overrides && Object.keys(node.overrides).length > 0) {
      // Create a shallow copy and apply overrides
      const nodeWithOverrides = {
        ...sourceNode,
        ...node.overrides,
      };

      // Special handling for nested property overrides
      // If overrides contains descendant paths (e.g., "child.prop"), apply them recursively
      // For now, we do a simple shallow merge. Deep override handling would require
      // more complex logic to traverse the node tree
      return nodeWithOverrides;
    }

    return sourceNode;
  }, [node.refId, node.overrides, resolveRef]);

  if (!resolvedNode) {
    // Ref not found - render a placeholder
    return (
      <div
        style={{
          padding: '8px',
          background: 'var(--pen-ref-missing-bg)',
          border: '1px dashed var(--pen-ref-missing-border)',
          borderRadius: '4px',
          color: 'var(--pen-ref-missing-text)',
          ...externalStyle,
        }}
        data-node-id={node.id}
        data-node-type="ref"
        onClick={onClick}
      >
        Ref not found: {node.refId}
      </div>
    );
  }

  // Render the resolved node with its renderer
  // Note: We need to wrap it to apply onClick and style
  return (
    <div onClick={onClick} style={externalStyle}>
      <PenNodeRenderer node={resolvedNode} />
    </div>
  );
}
