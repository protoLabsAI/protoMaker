/**
 * Transform section of property inspector
 * Shows: x, y, width, height, rotation
 */

import { useState } from 'react';
import type { PenNode } from '@protolabs-ai/types';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface TransformSectionProps {
  node: PenNode;
}

export function TransformSection({ node }: TransformSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const width = node.width ?? 0;
  const height = node.height ?? 0;
  const rotation = node.rotation ?? 0;

  return (
    <div className="border-b border-gray-200">
      {/* Section header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
      >
        <span className="text-sm font-semibold">Transform</span>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Section content */}
      {isExpanded && (
        <div className="space-y-3 px-4 pb-4">
          {/* Position */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">X</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                {x.toFixed(1)}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Y</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                {y.toFixed(1)}
              </div>
            </div>
          </div>

          {/* Size */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Width</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                {width.toFixed(1)}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Height</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                {height.toFixed(1)}
              </div>
            </div>
          </div>

          {/* Rotation */}
          {rotation !== 0 && (
            <div>
              <label className="text-xs text-muted-foreground">Rotation</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                {rotation.toFixed(1)}°
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
