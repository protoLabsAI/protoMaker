/**
 * Property inspector panel that displays selected node properties
 */

import type { PenNode } from '@protolabs-ai/types';
import { TransformSection } from './transform-section';
import { FillSection } from './fill-section';
import { StrokeSection } from './stroke-section';
import { TypographySection } from './typography-section';
import { LayoutSection } from './layout-section';

interface PropertyInspectorProps {
  node: PenNode | null;
}

/**
 * Main property inspector component showing all relevant sections
 * for the selected node
 */
export function PropertyInspector({ node }: PropertyInspectorProps) {
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <p>No node selected</p>
      </div>
    );
  }

  const isTextNode = node.type === 'text';
  const isContainerNode = node.type === 'frame' || node.type === 'group';
  const hasStroke = 'strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Node header */}
      <div className="border-b border-gray-200 p-4">
        <div className="text-xs text-muted-foreground">{node.type}</div>
        <div className="font-semibold">{node.name || node.id}</div>
      </div>

      {/* Properties sections */}
      <div className="flex-1 overflow-y-auto">
        <TransformSection node={node} />
        <FillSection node={node} />
        {hasStroke && <StrokeSection node={node} />}
        {isTextNode && <TypographySection node={node} />}
        {isContainerNode && <LayoutSection node={node} />}
      </div>
    </div>
  );
}
