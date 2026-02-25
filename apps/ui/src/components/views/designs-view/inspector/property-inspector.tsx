/**
 * Property inspector for editing selected PEN nodes
 */

import { useMemo } from 'react';
import type { PenNode, PenDocument as PenDocumentParsed } from '@protolabs-ai/types';
import { useDesignsStore } from '@/store/designs-store';
import { TransformSection } from './transform-section';
import { FillSection } from './fill-section';
import { TypographySection } from './typography-section';
import { LayoutSection } from './layout-section';

export function PropertyInspector() {
  const selectedDocument = useDesignsStore((state) => state.selectedDocument);
  const selectedNodeId = useDesignsStore((state) => state.selectedNodeId);

  // Parse document and find selected node
  const selectedNode = useMemo<PenNode | null>(() => {
    if (!selectedDocument?.content || !selectedNodeId) return null;

    try {
      const parsed: PenDocumentParsed = JSON.parse(selectedDocument.content);

      const findNode = (nodes: PenNode[]): PenNode | null => {
        for (const node of nodes) {
          if (node.id === selectedNodeId) return node;
          if ('children' in node && node.children) {
            const found = findNode(node.children);
            if (found) return found;
          }
        }
        return null;
      };

      return findNode(parsed.children || []);
    } catch {
      return null;
    }
  }, [selectedDocument, selectedNodeId]);

  if (!selectedNode) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
        <p>Select a node to view and edit properties</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Node info */}
      <div className="rounded-lg bg-white p-3 shadow-sm">
        <div className="text-xs text-muted-foreground">Selected</div>
        <div className="font-medium">{selectedNode.name || selectedNode.type}</div>
        <div className="text-xs text-muted-foreground">{selectedNode.type}</div>
      </div>

      {/* Transform section - all nodes have position */}
      <TransformSection node={selectedNode} />

      {/* Fill section - for nodes with fills */}
      {('fills' in selectedNode || selectedNode.type === 'text') && (
        <FillSection node={selectedNode} />
      )}

      {/* Typography section - for text nodes */}
      {selectedNode.type === 'text' && <TypographySection node={selectedNode} />}

      {/* Layout section - for frames */}
      {selectedNode.type === 'frame' && <LayoutSection node={selectedNode} />}
    </div>
  );
}
