/**
 * SortableContext wrapper for frame children
 * Enables drag-and-drop reordering of child nodes within a frame
 */

import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { ReactNode } from 'react';
import type { PenFrame } from '@protolabs-ai/types';

interface SortableNodeProps {
  frame: PenFrame;
  children: ReactNode;
}

/**
 * Wraps frame children in a SortableContext to enable reordering
 * Strategy is determined by the frame's layout mode
 */
export function SortableNode({ frame, children }: SortableNodeProps) {
  // Only enable sorting if frame has a layout mode (not 'none')
  if (frame.layoutMode === 'none' || !frame.children || frame.children.length === 0) {
    return <>{children}</>;
  }

  // Determine sorting strategy based on layout direction
  const strategy =
    frame.layoutMode === 'vertical' ? verticalListSortingStrategy : horizontalListSortingStrategy;

  // Get IDs of all children
  const items = frame.children.map((child) => child.id);

  return (
    <SortableContext items={items} strategy={strategy}>
      {children}
    </SortableContext>
  );
}
