/**
 * DnD Provider wrapping the designs view
 * Manages drag-and-drop context for component instantiation
 */

import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import type { ReactNode } from 'react';

export interface DragData {
  type: 'component';
  componentId: string;
  componentName?: string;
}

interface DndProviderProps {
  children: ReactNode;
  onDragStart?: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  dragOverlay?: ReactNode;
}

/**
 * Provides DnD context for dragging components from library to canvas
 */
export function DndProvider({ children, onDragStart, onDragEnd, dragOverlay }: DndProviderProps) {
  return (
    <DndContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {children}
      {dragOverlay && <DragOverlay>{dragOverlay}</DragOverlay>}
    </DndContext>
  );
}
