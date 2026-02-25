import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { useDesignsStore } from '@/store/designs-store';
import { Spinner } from '@protolabs-ai/ui/atoms';
import { DesignsTree } from './designs-tree';
import { DesignsCanvas } from './designs-canvas';
import { PropertyInspector } from './inspector/property-inspector';
import { ComponentLibrary } from './library';
import { FileText, Package } from 'lucide-react';
import { DndProvider, DragOverlayContent } from './dnd';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import type { DragData } from './dnd';
import type { PenNode } from '@protolabs-ai/types';

export function DesignsView() {
  const { currentProject } = useAppStore();
  const {
    selectedFilePath,
    selectedDocument,
    isLoadingDocument,
    isDirty,
    isLibraryVisible,
    toggleLibraryVisibility,
    createRefNode,
    reorderChildren,
    moveNode,
    reset,
  } = useDesignsStore();

  const [activeNode, setActiveNode] = useState<PenNode | null>(null);

  // Reset store when project changes or component unmounts
  useEffect(() => {
    return () => reset();
  }, [currentProject?.path, reset]);

  // Handle drag start to show overlay
  const handleDragStart = (event: DragStartEvent) => {
    const dragData = event.active.data.current as DragData | undefined;
    if (dragData?.type === 'component' && selectedDocument) {
      try {
        const parsed = JSON.parse(selectedDocument.content);
        const findNode = (nodes: PenNode[]): PenNode | null => {
          for (const node of nodes) {
            if (node.id === dragData.componentId) return node;
            if ('children' in node && node.children) {
              const found = findNode(node.children);
              if (found) return found;
            }
          }
          return null;
        };
        const node = findNode(parsed.children || []);
        setActiveNode(node);
      } catch (error) {
        console.error('Failed to parse document:', error);
      }
    }
  };

  // Handle drag end event
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveNode(null);

    if (!over) return;

    const dragData = active.data.current as DragData | undefined;
    const dropData = over.data.current as { type: string; frameId: string } | undefined;

    // Handle component instantiation (drag from library)
    if (dragData?.type === 'component' && dropData?.type === 'frame') {
      const componentId = dragData.componentId;
      const frameId = dropData.frameId;
      createRefNode(frameId, componentId);
      return;
    }

    // Handle sortable reordering (drag within or between frames)
    // When using @dnd-kit/sortable, active.id and over.id are the node IDs
    if (active.id !== over.id && selectedDocument) {
      try {
        const parsed = JSON.parse(selectedDocument.content);

        // Find the parent frame for each node
        const findParentFrame = (
          nodes: PenNode[],
          targetId: string,
          parentId?: string
        ): string | null => {
          for (const node of nodes) {
            if (node.id === targetId) return parentId ?? null;
            if ('children' in node && node.children) {
              const found = findParentFrame(node.children, targetId, node.id);
              if (found !== null) return found;
            }
          }
          return null;
        };

        // Find indices within parent
        const findIndexInFrame = (nodes: PenNode[], frameId: string, childId: string): number => {
          for (const node of nodes) {
            if (node.id === frameId && 'children' in node && node.children) {
              return node.children.findIndex((child) => child.id === childId);
            }
            if ('children' in node && node.children) {
              const index = findIndexInFrame(node.children, frameId, childId);
              if (index !== -1) return index;
            }
          }
          return -1;
        };

        const activeId = String(active.id);
        const overId = String(over.id);
        const activeParent = findParentFrame(parsed.children || [], activeId);
        const overParent = findParentFrame(parsed.children || [], overId);

        if (!activeParent || !overParent) return;

        // Same frame: reorder children
        if (activeParent === overParent) {
          const fromIndex = findIndexInFrame(parsed.children || [], activeParent, activeId);
          const toIndex = findIndexInFrame(parsed.children || [], activeParent, overId);

          if (fromIndex !== -1 && toIndex !== -1) {
            reorderChildren(activeParent, fromIndex, toIndex);
          }
        } else {
          // Cross-frame: move node
          const sourceIndex = findIndexInFrame(parsed.children || [], activeParent, activeId);
          const targetIndex = findIndexInFrame(parsed.children || [], overParent, overId);

          if (sourceIndex !== -1 && targetIndex !== -1) {
            moveNode(activeId, activeParent, overParent, targetIndex);
          }
        }
      } catch (error) {
        console.error('Failed to handle drag end:', error);
      }
    }
  };

  // Warn user about unsaved changes when navigating away
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Show empty state if no project
  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No Project Open</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Open a project to view its design files
          </p>
        </div>
      </div>
    );
  }

  // Prepare drag overlay
  let parsedDocument = null;
  try {
    parsedDocument = selectedDocument ? JSON.parse(selectedDocument.content) : null;
  } catch (error) {
    console.error('Failed to parse document:', error);
  }

  return (
    <DndProvider
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      dragOverlay={<DragOverlayContent node={activeNode} document={parsedDocument} />}
    >
      <div className="flex h-full flex-col">
        {/* Toolbar */}
        <div className="border-b border-border bg-muted/30 px-4 py-2 flex items-center gap-2">
          <button
            onClick={toggleLibraryVisibility}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isLibraryVisible ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
            title={isLibraryVisible ? 'Hide component library' : 'Show component library'}
          >
            <Package className="h-4 w-4" />
            Components
          </button>
        </div>

        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar - File tree */}
          <div className="w-64 border-r border-border bg-background overflow-y-auto">
            <DesignsTree projectPath={currentProject.path} />
          </div>

          {/* Component library panel */}
          {isLibraryVisible && (
            <div className="w-80 border-r border-border bg-background overflow-hidden">
              <ComponentLibrary penFile={selectedDocument} />
            </div>
          )}

          {/* Middle pane - Canvas/Document viewer */}
          <div className="flex-1 flex flex-col">
            {/* Canvas header */}
            {selectedFilePath && (
              <div className="border-b border-border bg-muted/30 px-4 py-3">
                <h2 className="text-sm font-medium truncate">
                  {selectedFilePath.split('/').pop()}
                </h2>
              </div>
            )}

            {/* Canvas content */}
            <div className="flex-1 flex items-center justify-center">
              {isLoadingDocument ? (
                <div className="flex flex-col items-center gap-3">
                  <Spinner size="lg" />
                  <p className="text-sm text-muted-foreground">Loading design...</p>
                </div>
              ) : selectedDocument ? (
                <DesignsCanvas penFile={selectedDocument} />
              ) : (
                <div className="text-center">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-lg font-medium">No Design Selected</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Select a .pen file from the tree to view it
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar - Property inspector */}
          {selectedDocument && (
            <div className="w-80 border-l border-border bg-background overflow-y-auto">
              <PropertyInspector />
            </div>
          )}
        </div>
      </div>
    </DndProvider>
  );
}
