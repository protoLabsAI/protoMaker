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

  // Access strokes via type assertion since we checked above
  const strokes = (node as unknown as { strokes: import('@protolabs-ai/types').PenStroke[] })
    .strokes;

  // Convert PenColor to CSS string for display
  const colorToDisplayString = (color: string | import('@protolabs-ai/types').PenColor): string => {
    if (typeof color === 'string') return color;
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  };

  return (
    <div className="border-b border-border">
      {/* Section header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-accent"
        aria-label={isExpanded ? 'Collapse stroke section' : 'Expand stroke section'}
      >
        <span className="text-sm font-semibold">Stroke</span>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Section content */}
      {isExpanded && (
        <div className="space-y-3 px-4 pb-4">
          {strokes.map((stroke, index) => {
            const colorStr = colorToDisplayString(stroke.color);
            return (
              <div key={index} className="space-y-2">
                {/* Color */}
                <div className="flex items-center gap-2">
                  <div
                    className="h-6 w-6 rounded border border-border"
                    style={{ backgroundColor: colorStr }}
                    title={colorStr}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-mono">{colorStr}</div>
                    {stroke.opacity !== undefined && stroke.opacity < 1 && (
                      <div className="text-xs text-muted-foreground">
                        Opacity: {(stroke.opacity * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>
                </div>

                {/* Width */}
                {stroke.width !== undefined && (
                  <div>
                    <label className="text-xs text-muted-foreground">Width</label>
                    <div className="mt-1 rounded border border-border bg-muted px-2 py-1 text-sm">
                      {stroke.width}px
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
