/**
 * Sortable item wrapper for individual nodes within a frame
 * Uses @dnd-kit's useSortable hook to enable drag-and-drop reordering
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';

interface SortableItemProps {
  id: string;
  children: ReactNode;
}

/**
 * Wraps a node to make it sortable within its parent frame
 */
export function SortableItem({ id, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}
