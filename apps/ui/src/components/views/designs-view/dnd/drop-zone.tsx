/**
 * Drop zone component for frames
 * Provides visual feedback when dragging over valid drop targets
 */

import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

interface DropZoneProps {
  frameId: string;
  children: ReactNode;
  isValidTarget: boolean;
}

/**
 * Wraps a frame to make it a droppable target with visual indicators
 */
export function DropZone({ frameId, children, isValidTarget }: DropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `frame-${frameId}`,
    data: {
      type: 'frame',
      frameId,
    },
    disabled: !isValidTarget,
  });

  return (
    <div
      ref={setNodeRef}
      className="relative"
      style={{
        outline: isOver && isValidTarget ? '2px solid hsl(var(--primary))' : undefined,
        outlineOffset: isOver && isValidTarget ? '2px' : undefined,
        transition: 'outline 150ms ease-in-out',
      }}
    >
      {children}
    </div>
  );
}
