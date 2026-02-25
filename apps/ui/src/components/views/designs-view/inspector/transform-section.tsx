/**
 * Transform section for editing position and size
 */

import type { PenNode } from '@protolabs-ai/types';
import { useDesignsStore } from '@/store/designs-store';

interface TransformSectionProps {
  node: PenNode;
}

export function TransformSection({ node }: TransformSectionProps) {
  const updateNode = useDesignsStore((state) => state.updateNode);

  // Extract position from transform or bounds
  const x = node.transform?.tx ?? node.bounds?.x ?? 0;
  const y = node.transform?.ty ?? node.bounds?.y ?? 0;

  // Extract size from node-specific properties
  const width = 'width' in node ? node.width : (node.bounds?.width ?? 0);
  const height = 'height' in node ? node.height : (node.bounds?.height ?? 0);

  const hasSize = 'width' in node || 'height' in node;

  const handleUpdate = (field: string, value: number) => {
    if (field === 'x' || field === 'y') {
      // Update transform
      const transform = node.transform || { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
      updateNode(node.id, {
        transform: {
          ...transform,
          [field === 'x' ? 'tx' : 'ty']: value,
        },
      });
    } else if (field === 'width' || field === 'height') {
      // Update size
      updateNode(node.id, { [field]: value });
    }
  };

  return (
    <div className="rounded-lg bg-white p-3 shadow-sm space-y-3">
      <div className="text-sm font-semibold">Transform</div>

      {/* Position */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Position</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">X</label>
            <input
              type="number"
              value={x}
              onChange={(e) => handleUpdate('x', Number(e.target.value))}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Y</label>
            <input
              type="number"
              value={y}
              onChange={(e) => handleUpdate('y', Number(e.target.value))}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Size */}
      {hasSize && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Size</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">W</label>
              <input
                type="number"
                value={width}
                onChange={(e) => handleUpdate('width', Number(e.target.value))}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">H</label>
              <input
                type="number"
                value={height}
                onChange={(e) => handleUpdate('height', Number(e.target.value))}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Opacity */}
      {node.opacity !== undefined && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Opacity</div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={node.opacity}
            onChange={(e) => updateNode(node.id, { opacity: Number(e.target.value) })}
            className="w-full"
          />
          <div className="text-xs text-right text-muted-foreground">
            {Math.round((node.opacity || 1) * 100)}%
          </div>
        </div>
      )}
    </div>
  );
}
