/**
 * Layout section for editing layout properties
 */

import type { PenFrame, PenNode } from '@protolabs-ai/types';
import { useDesignsStore } from '@/store/designs-store';
import { Input } from '@protolabs-ai/ui/atoms';

interface LayoutSectionProps {
  node: PenFrame;
}

export function LayoutSection({ node }: LayoutSectionProps) {
  const updateNode = useDesignsStore((state) => state.updateNode);

  const handleLayoutChange = (layoutMode: PenFrame['layoutMode']) => {
    updateNode(node.id, { layoutMode } as Partial<PenNode>);
  };

  const handlePaddingChange = (value: number) => {
    updateNode(node.id, {
      paddingTop: value,
      paddingRight: value,
      paddingBottom: value,
      paddingLeft: value,
    } as Partial<PenNode>);
  };

  const handleGapChange = (itemSpacing: number) => {
    updateNode(node.id, { itemSpacing } as Partial<PenNode>);
  };

  // Derive uniform padding from individual values (use paddingTop as representative)
  const uniformPadding = node.paddingTop ?? 0;

  return (
    <div className="rounded-lg bg-card p-3 shadow-sm space-y-3">
      <div className="text-sm font-semibold">Layout</div>

      {/* Layout Direction */}
      {node.layoutMode !== undefined && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Direction</div>
          <select
            value={node.layoutMode}
            onChange={(e) => handleLayoutChange(e.target.value as PenFrame['layoutMode'])}
            className="w-full rounded border border-border bg-card px-2 py-1 text-sm"
            aria-label="Layout direction"
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
            <option value="none">None</option>
          </select>
        </div>
      )}

      {/* Padding */}
      {node.paddingTop !== undefined && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Padding</div>
          <Input
            type="number"
            value={uniformPadding}
            onChange={(e) => handlePaddingChange(Number(e.target.value))}
            className="w-full text-sm"
            min="0"
            aria-label="Padding"
          />
        </div>
      )}

      {/* Gap */}
      {node.itemSpacing !== undefined && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Gap</div>
          <Input
            type="number"
            value={node.itemSpacing}
            onChange={(e) => handleGapChange(Number(e.target.value))}
            className="w-full text-sm"
            min="0"
            aria-label="Gap"
          />
        </div>
      )}
    </div>
  );
}
