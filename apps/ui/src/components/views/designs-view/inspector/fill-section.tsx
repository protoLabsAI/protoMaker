/**
 * Fill section for editing colors
 */

import type { PenNode, PenTextNode } from '@protolabs-ai/types';
import { useDesignsStore } from '@/store/designs-store';

interface FillSectionProps {
  node: PenNode;
}

export function FillSection({ node }: FillSectionProps) {
  const updateNode = useDesignsStore((state) => state.updateNode);

  // Get current fill color
  let currentColor = '#000000';
  if ('fills' in node && node.fills && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === 'solid' && fill.color) {
      const { r, g, b } = fill.color;
      currentColor = `#${Math.round(r * 255)
        .toString(16)
        .padStart(2, '0')}${Math.round(g * 255)
        .toString(16)
        .padStart(2, '0')}${Math.round(b * 255)
        .toString(16)
        .padStart(2, '0')}`;
    }
  } else if (node.type === 'text' && 'color' in node) {
    const textNode = node as PenTextNode;
    if (textNode.color) {
      const { r, g, b } = textNode.color;
      currentColor = `#${Math.round(r * 255)
        .toString(16)
        .padStart(2, '0')}${Math.round(g * 255)
        .toString(16)
        .padStart(2, '0')}${Math.round(b * 255)
        .toString(16)
        .padStart(2, '0')}`;
    }
  }

  const handleColorChange = (hexColor: string) => {
    // Convert hex to RGB (0-1 range)
    const r = parseInt(hexColor.slice(1, 3), 16) / 255;
    const g = parseInt(hexColor.slice(3, 5), 16) / 255;
    const b = parseInt(hexColor.slice(5, 7), 16) / 255;

    if (node.type === 'text') {
      // Update text color
      updateNode(node.id, {
        color: { r, g, b, a: 1 },
      });
    } else if ('fills' in node) {
      // Update fills
      const fills = node.fills || [];
      const newFills = [...fills];
      if (newFills.length === 0) {
        newFills.push({ type: 'solid', color: { r, g, b, a: 1 } });
      } else {
        newFills[0] = { type: 'solid', color: { r, g, b, a: 1 } };
      }
      updateNode(node.id, { fills: newFills });
    }
  };

  return (
    <div className="rounded-lg bg-white p-3 shadow-sm space-y-3">
      <div className="text-sm font-semibold">Fill</div>

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Color</div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={currentColor}
            onChange={(e) => handleColorChange(e.target.value)}
            className="h-8 w-16 rounded border border-gray-300 cursor-pointer"
          />
          <input
            type="text"
            value={currentColor.toUpperCase()}
            onChange={(e) => {
              const value = e.target.value;
              if (/^#[0-9A-F]{6}$/i.test(value)) {
                handleColorChange(value);
              }
            }}
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-mono"
            placeholder="#000000"
          />
        </div>
      </div>
    </div>
  );
}
