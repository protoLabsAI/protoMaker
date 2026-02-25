/**
 * Ghost preview overlay during drag
 */

import { DragOverlay as DndKitDragOverlay } from '@dnd-kit/core';
import type { DragData } from './dnd-provider';

interface DragOverlayProps {
  dragData: DragData | null;
}

export function DragOverlay({ dragData }: DragOverlayProps) {
  return (
    <DndKitDragOverlay>
      {dragData ? (
        <div className="rounded-lg border-2 border-primary bg-background/95 px-4 py-2 shadow-lg">
          <span className="text-sm font-medium">{dragData.componentName}</span>
        </div>
      ) : null}
    </DndKitDragOverlay>
  );
}
