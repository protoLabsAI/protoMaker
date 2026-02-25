/**
 * Stroke section of property inspector
 * Shows: stroke color and thickness
 */

import { useState } from 'react';
import type { PenNode } from '@protolabs-ai/types';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface StrokeSectionProps {
  node: PenNode;
}

export function StrokeSection({ node }: StrokeSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Check if node has strokes
  const hasStrokes = 'strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0;

  if (!hasStrokes) {
    return null;
  }

  const strokes = node.strokes as Array<{
    type: string;
    color?: string;
    opacity?: number;
    thickness?: number;
  }>;

  return (
    <div className="border-b border-gray-200">
      {/* Section header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
      >
        <span className="text-sm font-semibold">Stroke</span>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Section content */}
      {isExpanded && (
        <div className="space-y-3 px-4 pb-4">
          {strokes.map((stroke, index) => (
            <div key={index} className="space-y-2">
              {/* Color */}
              <div className="flex items-center gap-2">
                {stroke.color && (
                  <div
                    className="h-6 w-6 rounded border border-gray-300"
                    style={{ backgroundColor: stroke.color }}
                    title={stroke.color}
                  />
                )}
                <div className="flex-1">
                  <div className="text-sm font-mono">{stroke.color || 'None'}</div>
                  {stroke.opacity !== undefined && stroke.opacity < 1 && (
                    <div className="text-xs text-muted-foreground">
                      Opacity: {(stroke.opacity * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
              </div>

              {/* Thickness */}
              {stroke.thickness !== undefined && (
                <div>
                  <label className="text-xs text-muted-foreground">Thickness</label>
                  <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                    {stroke.thickness}px
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
