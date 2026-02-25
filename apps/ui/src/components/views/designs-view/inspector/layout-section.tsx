/**
 * Layout section for editing layout properties
 */

import type { PenFrameNode } from '@protolabs-ai/types';
import { useDesignsStore } from '@/store/designs-store';

interface LayoutSectionProps {
  node: PenFrameNode;
}

export function LayoutSection({ node }: LayoutSectionProps) {
  const updateNode = useDesignsStore((state) => state.updateNode);

  const handleLayoutChange = (layout: PenFrameNode['layout']) => {
    updateNode(node.id, { layout });
  };

  const handlePaddingChange = (padding: number) => {
    updateNode(node.id, { padding });
  };

  const handleGapChange = (gap: number) => {
    updateNode(node.id, { gap });
  };

  return (
    <div className="rounded-lg bg-white p-3 shadow-sm space-y-3">
      <div className="text-sm font-semibold">Layout</div>

      {/* Layout Direction */}
      {node.layout !== undefined && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Direction</div>
          <select
            value={node.layout}
            onChange={(e) => handleLayoutChange(e.target.value as PenFrameNode['layout'])}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
            <option value="none">None</option>
          </select>
        </div>
      )}

      {/* Padding */}
      {node.padding !== undefined && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Padding</div>
          <input
            type="number"
            value={node.padding}
            onChange={(e) => handlePaddingChange(Number(e.target.value))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            min="0"
          />
        </div>
      )}

      {/* Gap */}
      {node.gap !== undefined && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Gap</div>
          <input
            type="number"
            value={node.gap}
            onChange={(e) => handleGapChange(Number(e.target.value))}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            min="0"
          />
        </div>
      )}
    </div>
  );
}
