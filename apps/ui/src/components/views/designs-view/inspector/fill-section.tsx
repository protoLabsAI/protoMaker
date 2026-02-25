/**
 * Fill section of property inspector
 * Shows: fill colors with color preview
 */

import { useState } from 'react';
import type { PenNode } from '@protolabs-ai/types';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface FillSectionProps {
  node: PenNode;
}

export function FillSection({ node }: FillSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Check if node has fills
  const hasFills = 'fills' in node && Array.isArray(node.fills) && node.fills.length > 0;

  if (!hasFills) {
    return null;
  }

  const fills = node.fills as Array<{ type: string; color?: string; opacity?: number }>;

  return (
    <div className="border-b border-gray-200">
      {/* Section header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
      >
        <span className="text-sm font-semibold">Fill</span>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Section content */}
      {isExpanded && (
        <div className="space-y-2 px-4 pb-4">
          {fills.map((fill, index) => (
            <div key={index} className="flex items-center gap-2">
              {/* Color preview */}
              {fill.color && (
                <div
                  className="h-6 w-6 rounded border border-gray-300"
                  style={{ backgroundColor: fill.color }}
                  title={fill.color}
                />
              )}

              {/* Color value */}
              <div className="flex-1">
                <div className="text-sm font-mono">{fill.color || 'None'}</div>
                {fill.opacity !== undefined && fill.opacity < 1 && (
                  <div className="text-xs text-muted-foreground">
                    Opacity: {(fill.opacity * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
