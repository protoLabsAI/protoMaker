/**
 * Fill section for editing colors
 */

import type { PenNode, PenText, PenColor } from '@protolabs-ai/types';
import { useDesignsStore } from '@/store/designs-store';
import { Input } from '@protolabs-ai/ui/atoms';

/** Extract r/g/b from a PenColor or hex string */
function extractRGB(color: string | PenColor): { r: number; g: number; b: number } | null {
  if (typeof color === 'object' && 'r' in color) {
    return { r: color.r, g: color.g, b: color.b };
  }
  return null;
}

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
      const rgb = extractRGB(fill.color);
      if (rgb) {
        currentColor = `#${Math.round(rgb.r * 255)
          .toString(16)
          .padStart(2, '0')}${Math.round(rgb.g * 255)
          .toString(16)
          .padStart(2, '0')}${Math.round(rgb.b * 255)
          .toString(16)
          .padStart(2, '0')}`;
      }
    }
  } else if (node.type === 'text') {
    // PenText uses fills for color, check first fill
    const textNode = node as PenText;
    if (textNode.fills && textNode.fills.length > 0) {
      const fill = textNode.fills[0];
      if (fill.type === 'solid' && fill.color) {
        const rgb = extractRGB(fill.color);
        if (rgb) {
          currentColor = `#${Math.round(rgb.r * 255)
            .toString(16)
            .padStart(2, '0')}${Math.round(rgb.g * 255)
            .toString(16)
            .padStart(2, '0')}${Math.round(rgb.b * 255)
            .toString(16)
            .padStart(2, '0')}`;
        }
      }
    }
  }

  const handleColorChange = (hexColor: string) => {
    // Convert hex to RGB (0-1 range)
    const r = parseInt(hexColor.slice(1, 3), 16) / 255;
    const g = parseInt(hexColor.slice(3, 5), 16) / 255;
    const b = parseInt(hexColor.slice(5, 7), 16) / 255;

    if ('fills' in node) {
      // Update fills
      const fills = node.fills || [];
      const newFills = [...fills];
      if (newFills.length === 0) {
        newFills.push({ type: 'solid', color: { r, g, b, a: 1 } });
      } else {
        newFills[0] = { type: 'solid', color: { r, g, b, a: 1 } };
      }
      updateNode(node.id, { fills: newFills } as Partial<PenNode>);
    }
  };

  return (
    <div className="rounded-lg bg-card p-3 shadow-sm space-y-3">
      <div className="text-sm font-semibold">Fill</div>

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Color</div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={currentColor}
            onChange={(e) => handleColorChange(e.target.value)}
            className="h-8 w-16 rounded border border-border cursor-pointer"
            aria-label="Fill color picker"
          />
          <Input
            type="text"
            value={currentColor.toUpperCase()}
            onChange={(e) => {
              const value = e.target.value;
              if (/^#[0-9A-F]{6}$/i.test(value)) {
                handleColorChange(value);
              }
            }}
            className="flex-1 text-sm font-mono"
            placeholder="#000000"
            aria-label="Fill color hex value"
          />
        </div>
      </div>
    </div>
  );
}
