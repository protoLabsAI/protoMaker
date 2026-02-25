/**
 * DnD context provider for designs view
 * Wraps the entire designs view to enable drag-and-drop functionality
 */

import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useState } from 'react';
import { DragOverlay } from './drag-overlay';

interface DndProviderProps {
  children: React.ReactNode;
  onDragEnd: (event: DragEndEvent) => void;
}

export interface DragData {
  componentId: string;
  componentName: string;
}

export function DndProvider({ children, onDragEnd }: DndProviderProps) {
  const [activeDragData, setActiveDragData] = useState<DragData | null>(null);

  // Configure pointer sensor with activation constraint to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (data) {
      setActiveDragData(data);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragData(null);
    onDragEnd(event);
  };

  const handleDragCancel = () => {
    setActiveDragData(null);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay dragData={activeDragData} />
    </DndContext>
  );
}
