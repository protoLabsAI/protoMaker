/**
 * Layout section of property inspector
 * Shows: direction, gap, padding, alignment (for frame/group nodes only)
 */

import { useState } from 'react';
import type { PenNode, PenFrame, PenGroup } from '@protolabs-ai/types';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface LayoutSectionProps {
  node: PenNode;
}

export function LayoutSection({ node }: LayoutSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Only show for frame and group nodes
  if (node.type !== 'frame' && node.type !== 'group') {
    return null;
  }

  const layoutNode = node as PenFrame | PenGroup;

  // Only show if layout mode is enabled
  if (layoutNode.layoutMode === 'none') {
    return null;
  }

  return (
    <div className="border-b border-gray-200">
      {/* Section header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
      >
        <span className="text-sm font-semibold">Layout</span>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Section content */}
      {isExpanded && (
        <div className="space-y-3 px-4 pb-4">
          {/* Layout mode / direction */}
          {layoutNode.layoutMode && (
            <div>
              <label className="text-xs text-muted-foreground">Direction</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm capitalize">
                {layoutNode.layoutMode === 'horizontal' ? 'Horizontal' : 'Vertical'}
              </div>
            </div>
          )}

          {/* Gap */}
          {layoutNode.itemSpacing !== undefined && layoutNode.itemSpacing > 0 && (
            <div>
              <label className="text-xs text-muted-foreground">Gap</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                {layoutNode.itemSpacing}px
              </div>
            </div>
          )}

          {/* Padding */}
          {layoutNode.padding !== undefined && (
            <div>
              <label className="text-xs text-muted-foreground">Padding</label>
              {typeof layoutNode.padding === 'number' ? (
                <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                  {layoutNode.padding}px
                </div>
              ) : (
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Top</div>
                    <div className="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                      {layoutNode.padding.top || 0}px
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Right</div>
                    <div className="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                      {layoutNode.padding.right || 0}px
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Bottom</div>
                    <div className="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                      {layoutNode.padding.bottom || 0}px
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Left</div>
                    <div className="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
                      {layoutNode.padding.left || 0}px
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Primary axis alignment */}
          {layoutNode.primaryAxisAlignment && (
            <div>
              <label className="text-xs text-muted-foreground">Primary Align</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm capitalize">
                {layoutNode.primaryAxisAlignment.replace('-', ' ')}
              </div>
            </div>
          )}

          {/* Counter axis alignment */}
          {layoutNode.counterAxisAlignment && (
            <div>
              <label className="text-xs text-muted-foreground">Cross Align</label>
              <div className="mt-1 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm capitalize">
                {layoutNode.counterAxisAlignment.replace('-', ' ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
