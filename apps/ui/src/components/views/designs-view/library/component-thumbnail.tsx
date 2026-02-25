/**
 * Draggable component thumbnail in the library panel
 */

import { useDraggable } from '@dnd-kit/core';
import type { DragData } from '../dnd/dnd-provider';
import { Box } from 'lucide-react';

interface ComponentThumbnailProps {
  componentId: string;
  componentName: string;
}

export function ComponentThumbnail({ componentId, componentName }: ComponentThumbnailProps) {
  const dragData: DragData = {
    componentId,
    componentName,
  };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `component-${componentId}`,
    data: dragData,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 cursor-grab hover:bg-accent/50 transition-colors"
      style={{
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <Box className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm">{componentName}</span>
    </div>
  );
}
