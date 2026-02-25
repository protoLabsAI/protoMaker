/**
 * Typography section of property inspector
 * Shows: font, size, weight (for text nodes only)
 */

import { useState } from 'react';
import type { PenNode, PenText } from '@protolabs-ai/types';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface TypographySectionProps {
  node: PenNode;
}

export function TypographySection({ node }: TypographySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Only show for text nodes
  if (node.type !== 'text') {
    return null;
  }

  const textNode = node as PenText;

  return (
    <div className="border-b border-gray-200">
      {/* Section header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
      >
        <span className="text-sm font-semibold">Typography</span>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Section content */}
      {isExpanded && (
        <div className="space-y-3 px-4 pb-4">
          {/* Font family */}
          {textNode.fontFamily && (
            <div>
              <label className="text-xs text-muted-foreground">Font</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                {textNode.fontFamily}
              </div>
            </div>
          )}

          {/* Font size */}
          {textNode.fontSize !== undefined && (
            <div>
              <label className="text-xs text-muted-foreground">Size</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                {textNode.fontSize}px
              </div>
            </div>
          )}

          {/* Font weight */}
          {textNode.fontWeight !== undefined && (
            <div>
              <label className="text-xs text-muted-foreground">Weight</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                {textNode.fontWeight}
              </div>
            </div>
          )}

          {/* Text alignment */}
          {textNode.textAlign && (
            <div>
              <label className="text-xs text-muted-foreground">Alignment</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm capitalize">
                {textNode.textAlign}
              </div>
            </div>
          )}

          {/* Letter spacing */}
          {textNode.letterSpacing !== undefined && textNode.letterSpacing !== 0 && (
            <div>
              <label className="text-xs text-muted-foreground">Letter Spacing</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                {textNode.letterSpacing}px
              </div>
            </div>
          )}

          {/* Line height */}
          {textNode.lineHeight !== undefined && (
            <div>
              <label className="text-xs text-muted-foreground">Line Height</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                {textNode.lineHeight}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
