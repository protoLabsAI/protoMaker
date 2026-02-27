/**
 * EditorTabs — Multi-tab manager for the file editor view.
 *
 * Features:
 * - Displays open file tabs with the file name
 * - Unsaved-changes indicator (amber dot) when content differs from disk
 * - Close button per tab
 * - Drag-to-reorder via @dnd-kit
 */

import { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileEditorTab } from './use-file-editor-store';
import { useFileEditorStore } from './use-file-editor-store';

// ---------------------------------------------------------------------------
// Individual sortable tab
// ---------------------------------------------------------------------------

interface SortableTabProps {
  tab: FileEditorTab;
  isActive: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

function SortableTab({ tab, isActive, onActivate, onClose }: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasUnsavedChanges = tab.content !== tab.savedContent && !tab.isLoading && !tab.isBinary;

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose(tab.id);
    },
    [tab.id, onClose]
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-testid={`editor-tab-${tab.id}`}
      onClick={() => onActivate(tab.id)}
      className={cn(
        'group flex h-full min-w-0 max-w-[200px] shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-border px-3 text-xs',
        'transition-colors',
        isActive
          ? 'bg-background text-foreground'
          : 'bg-muted/40 text-muted-foreground hover:bg-accent/50'
      )}
      title={tab.filePath}
      role="tab"
      aria-selected={isActive}
    >
      {/* Unsaved changes indicator */}
      {hasUnsavedChanges && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
          aria-label="Unsaved changes"
          data-testid="unsaved-indicator"
        />
      )}

      <span className="truncate">{tab.fileName}</span>

      {/* Close button */}
      <button
        onClick={handleClose}
        className={cn(
          'ml-auto shrink-0 rounded p-0.5 opacity-0 transition-opacity',
          'group-hover:opacity-60 hover:!opacity-100 hover:bg-accent',
          isActive && 'opacity-50'
        )}
        aria-label={`Close ${tab.fileName}`}
        data-testid={`close-tab-${tab.id}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

export function EditorTabs() {
  const { tabs, activeTabId, setActiveTab, closeTab, reorderTabs } = useFileEditorStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Require 8px movement before activating drag to avoid interfering with clicks
        distance: 8,
      },
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        reorderTabs(String(active.id), String(over.id));
      }
    },
    [reorderTabs]
  );

  if (tabs.length === 0) {
    return (
      <div
        className="flex h-9 items-center border-b border-border px-4 text-xs text-muted-foreground"
        data-testid="editor-tabs-empty"
      >
        No files open
      </div>
    );
  }

  return (
    <div
      className="flex h-9 items-stretch overflow-x-auto border-b border-border bg-muted/20"
      role="tablist"
      data-testid="editor-tabs"
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
          {tabs.map((tab) => (
            <SortableTab
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onActivate={setActiveTab}
              onClose={closeTab}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
