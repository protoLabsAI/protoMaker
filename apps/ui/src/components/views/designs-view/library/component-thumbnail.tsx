/**
 * Component thumbnail renderer
 * Renders a scaled-down preview of a reusable component
 */

import type { PenNode, PenDocument } from '@protolabs-ai/types';
import { useDraggable } from '@dnd-kit/core';
import { PenNodeRenderer } from '../renderer/pen-node-renderer';
import { PenThemeProvider } from '../renderer/pen-theme-context';
import type { DragData } from '../dnd';

interface ComponentThumbnailProps {
  node: PenNode;
  document: PenDocument | null;
  onClick?: () => void;
}

/**
 * Renders a thumbnail preview of a component at reduced scale
 * Now draggable to create instances on the canvas
 */
export function ComponentThumbnail({ node, document, onClick }: ComponentThumbnailProps) {
  const dragData: DragData = {
    type: 'component',
    componentId: node.id,
    componentName: node.name,
  };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `component-${node.id}`,
    data: dragData,
  });

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="group relative h-16 w-full overflow-hidden rounded-lg border border-border bg-muted/30 hover:border-primary hover:bg-muted/50 transition-colors cursor-grab active:cursor-grabbing"
      title={node.name || node.id}
      aria-label={`Drag or select component: ${node.name || node.id}`}
      style={{
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center p-2">
        <div
          className="origin-center"
          style={{
            transform: 'scale(0.5)',
          }}
        >
          <PenThemeProvider document={document}>
            <PenNodeRenderer node={node} />
          </PenThemeProvider>
        </div>
      </div>
    </button>
  );
}
