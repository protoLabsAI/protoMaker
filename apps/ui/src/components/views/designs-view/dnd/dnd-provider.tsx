/**
 * DnD Provider wrapping the designs view
 * Manages drag-and-drop context for component instantiation and reordering
 */

import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  closestCenter,
} from '@dnd-kit/core';
import type { ReactNode } from 'react';

export interface DragData {
  type: 'component' | 'node';
  componentId?: string;
  componentName?: string;
  nodeId?: string;
  frameId?: string;
}

interface DndProviderProps {
  children: ReactNode;
  onDragStart?: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  dragOverlay?: ReactNode;
}

/**
 * Provides DnD context for dragging components from library to canvas
 * and reordering nodes within frames
 */
export function DndProvider({ children, onDragStart, onDragEnd, dragOverlay }: DndProviderProps) {
  return (
    <DndContext onDragStart={onDragStart} onDragEnd={onDragEnd} collisionDetection={closestCenter}>
      {children}
      {dragOverlay && <DragOverlay>{dragOverlay}</DragOverlay>}
    </DndContext>
  );
}
